export interface TableInfo {
  name: string
  columns: { name: string; type: string }[]
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  truncated: boolean
  ms: number
}

export type WorkerRequest =
  | { type: 'load'; bytes: ArrayBuffer }
  | { type: 'run'; reqId: number; sql: string }

export type WorkerResponse =
  | { type: 'loaded'; tables: TableInfo[] }
  | { type: 'result'; reqId: number; result: QueryResult }
  | { type: 'error'; reqId?: number; message: string }

export const ROW_CAP = 10_000
