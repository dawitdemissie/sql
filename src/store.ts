import { get, set, del } from 'idb-keyval'

export interface Dataset {
  id: string
  label: string
  description?: string
  url: string
  version: string
  starter: string
}
export interface Registry {
  default: string
  datasets: Dataset[]
}
export interface Tab {
  id: string
  title: string
  sql: string
}
export interface DbWorkspace {
  tabs: Tab[]
  activeId: string
}
export interface Workspace {
  dbId: string
  byDb: Record<string, DbWorkspace>
}

const WS_KEY = 'workspace:v1'
const dbKey = (d: Dataset) => `db:${d.id}:${d.version}`

export const uid = () => Math.random().toString(36).slice(2, 10)

export async function loadRegistry(): Promise<Registry> {
  const res = await fetch('/datasets.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error('Could not load datasets.json')
  return res.json()
}

/** DB bytes are cached in IndexedDB, keyed by dataset id + version. */
export async function fetchDb(d: Dataset, onProgress?: (p: number) => void): Promise<ArrayBuffer> {
  try {
    const cached = await get<ArrayBuffer>(dbKey(d))
    if (cached) return cached
  } catch { /* IndexedDB unavailable */ }

  const res = await fetch(d.url)
  if (!res.ok || !res.body) throw new Error(`Failed to download ${d.label} (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.length
    if (total) onProgress?.(got / total)
  }
  const out = new Uint8Array(got)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  try { await set(dbKey(d), out.buffer) } catch { /* ignore quota errors */ }
  return out.buffer
}

export function newTab(sql = '', n = 1): Tab {
  return { id: uid(), title: `Query ${n}`, sql }
}

export async function loadWorkspace(): Promise<Workspace | null> {
  try { return (await get<Workspace>(WS_KEY)) ?? null } catch { return null }
}
export async function saveWorkspace(w: Workspace) {
  try { await set(WS_KEY, w) } catch { /* ignore */ }
}
export async function resetWorkspace() {
  try { await del(WS_KEY) } catch { /* ignore */ }
}
