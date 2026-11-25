import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react'
import { downloadCsv } from '../lib/csv.js'

/**
 * Sortable, searchable, exportable table.
 * columns: [{ key, label, align, render(row), sort(row) -> value, csv(row) -> value, className, hide }]
 */
export function DataTable({
  rows, columns, initialSort, search, onRowClick, pageSize = 15, exportName, empty = 'Nothing in this period', dense = false, toolbar,
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(initialSort || { key: null, dir: 'desc' })
  const [limit, setLimit] = useState(pageSize)

  const visibleCols = columns.filter((c) => !c.hide)
  const filtered = useMemo(() => {
    if (!q || !search) return rows
    const needle = q.toLowerCase()
    return rows.filter((r) => search(r).toLowerCase().includes(needle))
  }, [rows, q, search])

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered
    const get = col.sort || ((r) => r[col.key])
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const x = get(a); const y = get(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir
    })
  }, [filtered, sort, columns])

  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))

  const exportCsv = () => {
    const cols = columns.filter((c) => c.csv !== false)
    downloadCsv(`${exportName}.csv`, cols.map((c) => c.label), sorted.map((r) => cols.map((c) => (c.csv ? c.csv(r) : (c.sort ? c.sort(r) : r[c.key])))))
  }

  const pad = dense ? 'px-2.5 py-2' : 'px-3 py-2.5'
  return (
    <div>
      {(search || exportName || toolbar) && (
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          <div className="flex items-center gap-2">
            {search && (
              <label className="relative block">
                <span className="sr-only">Search</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(pageSize) }} placeholder="Search"
                  className="h-8 w-48 rounded-lg border border-line bg-cream/60 pl-9 pr-3 text-sm outline-none transition focus:border-plum focus:bg-paper" />
              </label>
            )}
            {exportName && (
              <button onClick={exportCsv} title="Download as CSV (opens in Excel)" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-muted transition hover:border-plum hover:text-plum">
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            )}
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              {visibleCols.map((c) => (
                <th key={c.key} scope="col" className={`${pad} whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-muted ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.className || ''}`}>
                  {c.sortable === false ? c.label : (
                    <button onClick={() => toggle(c.key)} className={`inline-flex items-center gap-1 uppercase hover:text-ink ${sort.key === c.key ? 'text-plum' : ''}`}>
                      {c.label}
                      {sort.key === c.key && (sort.dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((r, idx) => (
              <tr key={r.key ?? r.id ?? idx} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`border-t border-line/60 transition ${onRowClick ? 'cursor-pointer hover:bg-plum-soft/35' : ''} ${r.muted ? 'opacity-55' : ''}`}>
                {visibleCols.map((c) => (
                  <td key={c.key} className={`${pad} align-middle ${c.align === 'right' ? 'tabular whitespace-nowrap text-right' : ''} ${c.className || ''}`}>
                    {c.render ? c.render(r, idx) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!sorted.length && <p className="py-10 text-center text-sm text-muted">{q ? `No match for “${q}”.` : empty}</p>}
      </div>
      {sorted.length > limit && (
        <button onClick={() => setLimit((n) => n + 25)} className="no-print mt-3 w-full rounded-xl border border-dashed border-line py-2 text-sm text-muted transition hover:border-plum hover:text-plum">
          Show {Math.min(25, sorted.length - limit)} more · {sorted.length - limit} left
        </button>
      )}
    </div>
  )
}
