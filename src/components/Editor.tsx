import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { TableInfo } from '../engine/types'

export function Editor({ value, onChange, onRun, tables, dark }: {
  value: string
  onChange: (v: string) => void
  onRun: () => void
  tables: TableInfo[]
  dark: boolean
}) {
  const extensions = useMemo(() => {
    const schema = Object.fromEntries(tables.map(t => [t.name, t.columns.map(c => c.name)]))
    return [
      sql({ schema, upperCaseKeywords: true }),
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { onRun(); return true } }]))
    ]
  }, [tables, onRun])

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme={dark ? 'dark' : 'light'}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ lineNumbers: true, autocompletion: true }}
    />
  )
}
