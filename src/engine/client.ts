import { QueryResult, TableInfo, WorkerResponse } from './types'

/** Wraps the SQLite worker. cancel() kills the worker and reloads the DB. */
export class SqlEngine {
  private worker!: Worker
  private bytes: ArrayBuffer | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (r: QueryResult) => void; reject: (e: Error) => void }>()
  private loadWaiter: { resolve: (t: TableInfo[]) => void; reject: (e: Error) => void } | null = null

  constructor() {
    this.spawn()
  }

  private spawn() {
    this.worker = new Worker(new URL('./sql.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const m = e.data
      if (m.type === 'loaded') {
        this.loadWaiter?.resolve(m.tables)
        this.loadWaiter = null
      } else if (m.type === 'result') {
        this.pending.get(m.reqId)?.resolve(m.result)
        this.pending.delete(m.reqId)
      } else if (m.reqId !== undefined) {
        this.pending.get(m.reqId)?.reject(new Error(m.message))
        this.pending.delete(m.reqId)
      } else {
        this.loadWaiter?.reject(new Error(m.message))
        this.loadWaiter = null
      }
    }
  }

  load(bytes: ArrayBuffer): Promise<TableInfo[]> {
    this.bytes = bytes
    return new Promise((resolve, reject) => {
      this.loadWaiter = { resolve, reject }
      // copy so we can reload after a cancel
      this.worker.postMessage({ type: 'load', bytes: bytes.slice(0) })
    })
  }

  run(sql: string): Promise<QueryResult> {
    const reqId = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject })
      this.worker.postMessage({ type: 'run', reqId, sql })
    })
  }

  /** Abort running queries: terminate the worker and restore the DB. */
  async cancel() {
    this.worker.terminate()
    for (const p of this.pending.values()) p.reject(new Error('Query cancelled'))
    this.pending.clear()
    this.spawn()
    if (this.bytes) await this.load(this.bytes)
  }

  dispose() {
    this.worker.terminate()
  }
}
