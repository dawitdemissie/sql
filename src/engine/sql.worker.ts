/// <reference lib="webworker" />
import initSqlJs, { Database, SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { ROW_CAP, TableInfo, WorkerRequest, WorkerResponse } from './types'

let db: Database | null = null
const post = (m: WorkerResponse) => self.postMessage(m)

function readSchema(d: Database): TableInfo[] {
  const names = d.exec(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )[0]?.values.map(r => String(r[0])) ?? []
  return names.map(name => {
    const info = d.exec(`PRAGMA table_info("${name.replace(/"/g, '""')}")`)[0]
    return {
      name,
      columns: (info?.values ?? []).map(r => ({ name: String(r[1]), type: String(r[2]) }))
    }
  })
}

function run(d: Database, sql: string) {
  const t0 = performance.now()
  let columns: string[] = []
  let rows: SqlValue[][] = []
  let truncated = false
  for (const stmt of d.iterateStatements(sql)) {
    const cols = stmt.getColumnNames()
    if (cols.length === 0) {
      stmt.step()
      continue
    }
    // keep only the last statement that returns rows
    columns = cols
    rows = []
    truncated = false
    while (stmt.step()) {
      if (rows.length >= ROW_CAP) {
        truncated = true
        break
      }
      rows.push(stmt.get())
    }
  }
  return { columns, rows, truncated, ms: Math.round(performance.now() - t0) }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  try {
    if (msg.type === 'load') {
      const SQL = await initSqlJs({ locateFile: () => wasmUrl })
      db?.close()
      db = new SQL.Database(new Uint8Array(msg.bytes))
      db.run('PRAGMA query_only = ON') // read-only workspace
      post({ type: 'loaded', tables: readSchema(db) })
    } else if (msg.type === 'run') {
      if (!db) throw new Error('No database loaded')
      post({ type: 'result', reqId: msg.reqId, result: run(db, msg.sql) })
    }
  } catch (err) {
    post({
      type: 'error',
      reqId: msg.type === 'run' ? msg.reqId : undefined,
      message: err instanceof Error ? err.message : String(err)
    })
  }
}
