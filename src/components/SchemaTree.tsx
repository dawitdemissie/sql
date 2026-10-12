import { useState } from 'react'
import { TableInfo } from '../engine/types'

export function SchemaTree({ tables }: { tables: TableInfo[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <div className="schema">
      <h3>Tables</h3>
      {tables.map(t => (
        <div key={t.name}>
          <div className="schema-table">
            <button className="link" onClick={() => setOpen(o => ({ ...o, [t.name]: !o[t.name] }))}>
              {open[t.name] ? '▾' : '▸'} {t.name}
            </button>
          </div>
          {open[t.name] &&
            t.columns.map(c => (
              <div key={c.name} className="schema-col">
                {c.name} <span className="muted">{c.type}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}
