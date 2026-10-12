import { useCallback, useEffect, useRef, useState } from 'react'
import { SqlEngine } from './engine/client'
import { QueryResult, TableInfo } from './engine/types'
import {
  Dataset, DbWorkspace, Registry, Workspace,
  fetchDb, loadRegistry, loadWorkspace, newTab, resetWorkspace, saveWorkspace
} from './store'
import { Editor } from './components/Editor'
import { Results } from './components/Results'
import { Logo } from './components/Logo'
import { SchemaTree } from './components/SchemaTree'

interface TabState { result: QueryResult | null; error: string | null; running: boolean }
const idle: TabState = { result: null, error: null, running: false }

type Theme = 'light' | 'dark'
const initialTheme = (): Theme =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'

function freshDb(d: Dataset): DbWorkspace {
  const t = newTab(d.starter)
  return { tabs: [t], activeId: t.id }
}

export default function App() {
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [ws, setWs] = useState<Workspace | null>(null)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [status, setStatus] = useState<string>('Loading…')
  const [fatal, setFatal] = useState<string | null>(null)
  const [tabState, setTabState] = useState<Record<string, TabState>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const dark = theme === 'dark'
  const engine = useRef<SqlEngine | null>(null)
  const ready = useRef(false)

  // follow the system theme until the user picks one explicitly
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      let chosen: string | null = null
      try { chosen = localStorage.getItem('theme') } catch { /* ignore */ }
      if (chosen === 'light' || chosen === 'dark') return
      const next: Theme = e.matches ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', next)
      setTheme(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggleTheme = () => {
    const next: Theme = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('theme', next) } catch { /* ignore */ }
    setTheme(next)
  }

  // boot: registry + restored workspace
  useEffect(() => {
    engine.current = new SqlEngine()
    ;(async () => {
      try {
        const reg = await loadRegistry()
        const saved = await loadWorkspace()
        const valid = (id?: string) => reg.datasets.some(d => d.id === id)
        const dbId = saved && valid(saved.dbId) ? saved.dbId : reg.default
        setRegistry(reg)
        setWs({ dbId, byDb: saved?.byDb ?? {} })
      } catch (e) {
        setFatal(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => engine.current?.dispose()
  }, [])

  const dataset = registry?.datasets.find(d => d.id === ws?.dbId)
  const dbId = ws?.dbId

  // make sure the current DB has a workspace entry
  useEffect(() => {
    if (!ws || !dataset || ws.byDb[ws.dbId]) return
    setWs(w => w && { ...w, byDb: { ...w.byDb, [w.dbId]: freshDb(dataset) } })
  }, [ws, dataset])

  // load the database when the selection changes
  useEffect(() => {
    if (!dataset || !engine.current) return
    let cancelled = false
    ready.current = false
    setTables([])
    setTabState({})
    setStatus(`Downloading ${dataset.label}…`)
    ;(async () => {
      try {
        const bytes = await fetchDb(dataset, p => !cancelled && setStatus(`Downloading ${dataset.label}… ${Math.round(p * 100)}%`))
        if (cancelled) return
        const t = await engine.current!.load(bytes)
        if (cancelled) return
        setTables(t)
        ready.current = true
        setStatus('')
      } catch (e) {
        if (!cancelled) setStatus(`Error: ${e instanceof Error ? e.message : e}`)
      }
    })()
    return () => { cancelled = true }
  }, [dataset])

  // persist workspace (debounced)
  useEffect(() => {
    if (!ws) return
    const t = setTimeout(() => saveWorkspace(ws), 300)
    return () => clearTimeout(t)
  }, [ws])

  const cur = ws && dbId ? ws.byDb[dbId] : undefined
  const activeTab = cur?.tabs.find(t => t.id === cur.activeId) ?? cur?.tabs[0]

  const updateDb = useCallback((fn: (d: DbWorkspace) => DbWorkspace) => {
    setWs(w => w && w.byDb[w.dbId] ? { ...w, byDb: { ...w.byDb, [w.dbId]: fn(w.byDb[w.dbId]) } } : w)
  }, [])

  const setSql = (sqlText: string) =>
    updateDb(d => ({ ...d, tabs: d.tabs.map(t => (t.id === d.activeId ? { ...t, sql: sqlText } : t)) }))

  const addTab = () =>
    updateDb(d => {
      const t = newTab('', d.tabs.length + 1)
      return { tabs: [...d.tabs, t], activeId: t.id }
    })

  const closeTab = (id: string) =>
    updateDb(d => {
      if (d.tabs.length === 1) return { tabs: [{ ...d.tabs[0], sql: '' }], activeId: d.tabs[0].id }
      const idx = d.tabs.findIndex(t => t.id === id)
      const tabs = d.tabs.filter(t => t.id !== id)
      return { tabs, activeId: d.activeId === id ? tabs[Math.max(0, idx - 1)].id : d.activeId }
    })

  const renameTab = (id: string, title: string) => {
    const name = title.trim()
    if (name) updateDb(d => ({ ...d, tabs: d.tabs.map(t => (t.id === id ? { ...t, title: name } : t)) }))
    setEditingId(null)
  }

  const patchState = (id: string, p: Partial<TabState>) =>
    setTabState(s => ({ ...s, [id]: { ...(s[id] ?? idle), ...p } }))

  // always uses the latest tab content via ref
  const activeRef = useRef(activeTab)
  activeRef.current = activeTab

  const run = useCallback(async () => {
    const tab = activeRef.current
    if (!tab || !ready.current || !engine.current) return
    patchState(tab.id, { running: true, error: null })
    try {
      const result = await engine.current.run(tab.sql)
      patchState(tab.id, { running: false, result, error: null })
    } catch (e) {
      patchState(tab.id, { running: false, result: null, error: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const cancel = async () => {
    setStatus('Cancelling…')
    await engine.current?.cancel()
    setStatus('')
  }

  const reset = async () => {
    if (!registry || !confirm('Reset all tabs and queries for every database?')) return
    await resetWorkspace()
    setWs({ dbId: registry.default, byDb: {} })
    setTabState({})
  }

  if (fatal) return <div className="fatal">{fatal}</div>
  if (!registry || !ws || !cur || !activeTab || !dataset) return <div className="fatal">Loading…</div>

  const st = tabState[activeTab.id] ?? idle

  return (
    <div className="app">
      <header>
        <Logo />
        <select value={ws.dbId} onChange={e => setWs({ ...ws, dbId: e.target.value })}>
          {registry.datasets.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <span className="spacer" />
        {status && <span className="status">{status}</span>}
        <button onClick={toggleTheme} title="Toggle light / dark mode">{dark ? '☀ Light' : '🌙 Dark'}</button>
        <button onClick={reset}>Reset workspace</button>
      </header>
      <div className="body">
        <aside><SchemaTree tables={tables} /></aside>
        <main>
          <div className="tabs">
            {cur.tabs.map(t => (
              <div key={t.id} className={'tab' + (t.id === activeTab.id ? ' active' : '')}
                onClick={() => updateDb(d => ({ ...d, activeId: t.id }))}
                onDoubleClick={() => setEditingId(t.id)} title="Double-click to rename">
                {editingId === t.id ? (
                  <input className="tab-input" autoFocus defaultValue={t.title} maxLength={40}
                    onFocus={e => e.target.select()} onClick={e => e.stopPropagation()}
                    onBlur={e => renameTab(t.id, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameTab(t.id, e.currentTarget.value)
                      else if (e.key === 'Escape') setEditingId(null)
                    }} />
                ) : t.title}
                <button className="x" onClick={e => { e.stopPropagation(); closeTab(t.id) }}>×</button>
              </div>
            ))}
            <button className="mini" onClick={addTab} title="New tab">+</button>
          </div>
          <div className="toolbar">
            <button className="primary" onClick={run} disabled={!!status || st.running}>▶ Run</button>
            {st.running && <button onClick={cancel}>■ Cancel</button>}
            <span className="muted">⌘/Ctrl + Enter</span>
          </div>
          <div className="editor">
            <Editor key={activeTab.id} value={activeTab.sql} onChange={setSql} onRun={run} tables={tables} dark={dark} />
          </div>
          <Results result={st.result} error={st.error} running={st.running} />
        </main>
      </div>
    </div>
  )
}
