import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { da, daShort, num } from '../lib/format.js'
import { MARK, MARK_SOFT } from './ui.jsx'

const axis = { fontSize: 11, fill: '#8a7f95' }

function Tip({ active, payload, measure, extra }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="pointer-events-none rounded-xl border border-line bg-paper px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-ink">{row.title || row.label}</p>
      <p className="tabular mt-1 text-ink">{measure === 'orders' ? `${num(row.orders)} orders` : da(row[measure])}</p>
      {measure !== 'orders' && row.orders != null && <p className="tabular text-muted">{num(row.orders)} {row.orders === 1 ? 'order' : 'orders'}</p>}
      {extra?.(row)}
      <p className="mt-1 text-[10px] text-muted">Click for details</p>
    </div>
  )
}

/**
 * Bars over time or categories. One measure, one axis.
 * `target` draws a reference line in the same unit; `onSelect(row)` makes bars clickable.
 */
export function Bars({ data, measure = 'revenue', height = 260, target, onSelect, activeKey, extra, xKey = 'label', showAxis = true, color = MARK }) {
  const money = measure !== 'orders' && measure !== 'qty'
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={data.length > 20 ? 2 : '18%'}
          onClick={(e) => onSelect && e?.activePayload?.[0] && onSelect(e.activePayload[0].payload)}>
          {showAxis && <CartesianGrid vertical={false} stroke="#f0eaef" />}
          <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={6} />
          <YAxis hide={!showAxis} tick={axis} tickLine={false} axisLine={false} width={54} tickFormatter={money ? daShort : num} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'rgb(107 79 179 / 0.07)' }} content={<Tip measure={measure} extra={extra} />} />
          {target > 0 && <ReferenceLine y={target} stroke="#b7791f" strokeDasharray="4 4" label={{ value: `Target ${daShort(target)}`, position: 'insideTopRight', fill: '#b7791f', fontSize: 11 }} />}
          <Bar dataKey={measure} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
            {data.map((row) => (
              <Cell key={row.key} fill={activeKey != null && String(activeKey) !== String(row.key) ? MARK_SOFT : color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Tiny trend line for table rows (last 6 months). */
export function Sparkline({ values, width = 72, height = 22 }) {
  const max = Math.max(...values, 1)
  const step = width / Math.max(values.length - 1, 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(' ')
  const last = values.at(-1)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <polyline points={pts} fill="none" stroke={MARK} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={height - 2 - (last / max) * (height - 4)} r="2.5" fill={MARK} />
    </svg>
  )
}

/** Weekday × hour grid, one hue light → dark. Cells are clickable. */
export function Heatmap({ data, onSelect, active }) {
  const { grid, from, to, max } = data
  const hours = []
  for (let h = from; h <= to; h++) hours.push(h)
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th />
            {hours.map((h) => <th key={h} scope="col" className="px-0.5 text-[10px] font-normal text-muted">{h}h</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.map((row) => (
            <tr key={row.day}>
              <th scope="row" className="pr-2 text-right text-[11px] font-medium text-muted">{row.day}</th>
              {hours.map((h) => {
                const c = row.hours[h]
                const t = c.revenue / max
                const isActive = active && active.weekday === row.d && active.hour === h
                return (
                  <td key={h} className="p-0">
                    <button
                      onClick={() => onSelect?.(row.d, h)}
                      title={`${row.day} ${h}:00 — ${da(c.revenue)} · ${num(c.orders)} orders`}
                      aria-label={`${row.day} ${h}:00, ${da(c.revenue)}, ${num(c.orders)} orders`}
                      className={`block h-7 w-full min-w-8 rounded-md transition hover:ring-2 hover:ring-plum/40 ${isActive ? 'ring-2 ring-plum' : ''}`}
                      style={{ background: c.orders ? `rgb(107 79 179 / ${0.1 + t * 0.85})` : '#f6f1f4' }}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
        <span>Less</span>
        {[0.1, 0.3, 0.5, 0.7, 0.95].map((a) => <span key={a} className="h-3 w-5 rounded" style={{ background: `rgb(107 79 179 / ${a})` }} />)}
        <span>More sales</span>
      </div>
    </div>
  )
}
