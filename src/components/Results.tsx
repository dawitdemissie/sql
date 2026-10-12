import { useEffect, useState } from 'react'
import { QueryResult, ROW_CAP } from '../engine/types'

const PAGE = 100

function toCsv(r: QueryResult) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [r.columns.map(esc).join(','), ...r.rows.map(row => row.map(esc).join(','))].join('\n')
}

export function Results({ result, error, running }: { result: QueryResult | null; error: string | null; running: boolean }) {
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [result])

  if (running) return <div className="results-msg">Running…</div>
  if (error) return <div className="results-msg error">{error}</div>
  if (!result) return <div className="results-msg muted">Run a query with ⌘/Ctrl + Enter</div>
  if (result.columns.length === 0) return <div className="results-msg muted">Statement executed ({result.ms} ms), no rows returned.</div>

  const pages = Math.max(1, Math.ceil(result.rows.length / PAGE))
  const slice = result.rows.slice(page * PAGE, (page + 1) * PAGE)
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(result)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'result.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="results">
      <div className="results-bar">
        <span>
          {result.rows.length.toLocaleString()} rows · {result.ms} ms
          {result.truncated && <span className="warn"> (capped at {ROW_CAP.toLocaleString()})</span>}
        </span>
        <span className="spacer" />
        <button className="mini" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
        <span>{page + 1} / {pages}</span>
        <button className="mini" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>›</button>
        <button onClick={download}>Export CSV</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th className="rownum">#</th>{result.columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {slice.map((row, i) => (
              <tr key={i}>
                <td className="rownum">{page * PAGE + i + 1}</td>
                {row.map((v, j) => (
                  <td key={j} className={v === null ? 'null' : typeof v === 'number' ? 'num' : ''}>
                    {v === null ? 'NULL' : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
