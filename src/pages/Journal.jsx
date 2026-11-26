import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Scale, ListOrdered, Vault, Boxes, History, AlertTriangle, CheckCircle2, X, Lock } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Stat, Pill, Segmented, BarList, Empty } from '../components/ui.jsx'
import { DataTable } from '../components/DataTable.jsx'
import { Select } from '../components/Form.jsx'
import { moneyLines, totals, groupLines, tillDays, stockMoves, stockType, methodLabel, SOURCES } from '../model/journal.js'
import { loadActivity } from '../data/load.js'
import { da, daSigned, num } from '../lib/format.js'
import { dayKey, dayLabel, formatTime } from '../lib/time.js'

const when = (l) => `${dayLabel(l.day, { day: 'numeric', month: 'short' })}${l.at ? ` · ${formatTime(l.at)}` : ''}`
const Signed = ({ v, muted }) => <span className={`tabular whitespace-nowrap ${muted ? 'text-muted line-through decoration-muted/40' : v < 0 ? 'text-rose' : 'text-sage'}`}>{daSigned(v)}</span>

export default function Journal() {
  const { period } = useApp()
  const [tab, setTab] = useState('money')
  return (
    <>
      <PageHeader title="Journal" subtitle={`Every line, one by one · ${period.label}`} />
      <div className="mb-4">
        <Segmented label="Show" value={tab} onChange={setTab} options={[['money', 'Every money movement'], ['till', 'Till, day by day'], ['stock', 'Every stock movement'], ['activity', 'Who did what']]} />
      </div>
      {tab === 'money' && <Money />}
      {tab === 'till' && <Till />}
      {tab === 'stock' && <Stock />}
      {tab === 'activity' && <Activity />}
    </>
  )
}

// ─── Every money movement ───────────────────────────────────────────────
function Money() {
  const { ds, bo, period, rawData, open } = useApp()
  const all = useMemo(() => moneyLines(rawData, ds, bo, period), [rawData, ds, bo, period])
  const [dir, setDir] = useState('all')
  const [source, setSource] = useState('')
  const [category, setCategory] = useState('')
  const [method, setMethod] = useState('')
  const [person, setPerson] = useState('')

  const lines = all.filter((l) => (dir === 'all' || (dir === 'in' ? l.amount > 0 : l.amount < 0))
    && (!source || l.source === source) && (!category || l.category === category) && (!method || l.method === method) && (!person || l.who === person))
  const t = totals(lines)
  const outs = lines.filter((l) => l.amount < 0)
  const opts = (f) => [...new Set(all.map(f).filter(Boolean))].sort().map((v) => [v, v])
  const anyFilter = dir !== 'all' || source || category || method || person
  const clear = () => { setDir('all'); setSource(''); setCategory(''); setMethod(''); setPerson('') }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={ArrowDownLeft} tone="sage" label="Money in" value={da(t.in)} onClick={() => setDir('in')}>{num(lines.filter((l) => l.amount > 0).length)} lines</Stat>
        <Stat icon={ArrowUpRight} tone="rose" label="Money out" value={da(t.out)} onClick={() => setDir('out')}>{num(outs.length)} lines</Stat>
        <Stat icon={Scale} tone="plum" label="Net" value={daSigned(t.net)} info="Money in minus money out for the lines shown. Staff pay taken from the till is listed but counted once, in the till." />
        <Stat icon={ListOrdered} tone="muted" label="Lines" value={num(t.count)}>{anyFilter ? `of ${num(all.length)}` : 'everything recorded'}</Stat>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card title="Out, by category" hint="Click one to see only those lines">
          <BarList rows={groupLines(outs, (l) => l.category).map((g) => ({ ...g, revenue: g.out }))} onSelect={(k) => setCategory(category === k ? '' : k)} active={category} empty="No money out." extra={(g) => `${num(g.count)} lines`} />
        </Card>
        <Card title="Out, by who entered it" hint="Till lines carry the person who typed them">
          <BarList rows={groupLines(outs.filter((l) => l.who), (l) => l.who).map((g) => ({ ...g, revenue: g.out }))} onSelect={(k) => setPerson(person === k ? '' : k)} active={person} empty="No till cash-outs." extra={(g) => `${num(g.count)} lines`} />
        </Card>
        <Card title="By payment method" hint="In and out">
          <BarList rows={groupLines(lines, (l) => methodLabel(l.method)).map((g) => ({ ...g, revenue: g.in + g.out }))} extra={(g) => `${da(g.in)} in · ${da(g.out)} out`} empty="Nothing." />
        </Card>
      </div>

      <Card title="All lines" hint="Newest first · click a line linked to an order to open it">
        <DataTable rows={lines.map((l) => ({ ...l, muted: !l.counted }))} pageSize={50} exportName={`bloom-journal-${period.start}`}
          onRowClick={(l) => l.orderId && open('order', l.orderId)}
          search={(l) => `${l.type} ${l.category} ${l.description} ${l.who} ${l.orderNumber ?? ''}`}
          initialSort={{ key: 'day', dir: 'desc' }}
          toolbar={
            <>
              <Segmented label="Direction" value={dir} onChange={setDir} options={[['all', 'All'], ['in', 'In'], ['out', 'Out']]} />
              <FilterSelect label="Where" value={source} onChange={setSource} options={Object.entries(SOURCES).map(([k, v]) => [k, v.label])} />
              <FilterSelect label="Category" value={category} onChange={setCategory} options={opts((l) => l.category)} />
              <FilterSelect label="Method" value={method} onChange={setMethod} options={[...new Set(all.map((l) => l.method))].map((m) => [m, methodLabel(m)])} />
              <FilterSelect label="Who" value={person} onChange={setPerson} options={opts((l) => l.who)} />
              {anyFilter && <button onClick={clear} className="inline-flex items-center gap-1 text-xs text-muted hover:text-rose"><X className="h-3.5 w-3.5" /> Clear</button>}
            </>
          }
          columns={[
            { key: 'day', label: 'When', sort: (l) => `${l.day} ${l.at || ''}`, render: (l) => <span className="whitespace-nowrap">{when(l)}</span>, csv: (l) => `${l.day}${l.at ? ` ${formatTime(l.at)}` : ''}` },
            { key: 'type', label: 'What', render: (l) => <><p className="font-medium">{l.type}</p><Pill tone={SOURCES[l.source].tone}>{SOURCES[l.source].label}</Pill></> },
            { key: 'category', label: 'Category / to' },
            { key: 'description', label: 'Details', render: (l) => <span className="text-muted">{l.description || '—'}{l.orderNumber != null && <span className="ml-1 font-medium text-plum">#{l.orderNumber}</span>}</span>, csv: (l) => `${l.description}${l.orderNumber != null ? ` #${l.orderNumber}` : ''}` },
            { key: 'method', label: 'Method', render: (l) => methodLabel(l.method), csv: (l) => methodLabel(l.method) },
            { key: 'who', label: 'Entered by', render: (l) => l.who || <span className="text-muted">—</span> },
            { key: 'amount', label: 'Amount', align: 'right', render: (l) => <Signed v={l.amount} muted={!l.counted} /> },
          ]} />
      </Card>
    </>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`${label}: all`} options={options}
      className={`!h-8 !w-auto !rounded-lg !py-0 !text-xs ${value ? '!border-plum !text-plum' : ''}`} />
  )
}

// ─── The till, day by day ───────────────────────────────────────────────
function Till() {
  const { ds, period, rawData, restricted } = useApp()
  const days = useMemo(() => tillDays(rawData, ds, period), [rawData, ds, period])
  const [openDay, setOpenDay] = useState(null)
  const closed = days.filter((d) => d.closing != null)
  const short = closed.filter((d) => d.difference < 0)
  const day = days.find((d) => d.day === openDay)

  if (restricted.includes('cash')) return <Card><p className="flex items-center gap-2 text-sm text-amber"><Lock className="h-4 w-4" /> The till records are visible to owner accounts only.</p></Card>
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={Vault} label="Days with the till open" value={num(days.length)}>{num(closed.length)} closed</Stat>
        <Stat icon={ArrowDownLeft} tone="sage" label="Into the till" value={da(days.reduce((s, d) => s + d.in, 0))} />
        <Stat icon={ArrowUpRight} tone="rose" label="Out of the till" value={da(days.reduce((s, d) => s + d.out, 0))}>{da(days.reduce((s, d) => s + d.banked, 0))} banked</Stat>
        <Stat icon={AlertTriangle} tone={short.length ? 'rose' : 'sage'} label="Closing differences" value={daSigned(closed.reduce((s, d) => s + d.difference, 0))}
          info="At each closing: what was counted minus what the entries say should be there (opening + in − out). Negative = money missing.">{short.length ? `${num(short.length)} days short` : 'no shortfall'}</Stat>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Each day" hint="Click a day to see every line with the running balance">
          <DataTable dense rows={days} onRowClick={(d) => setOpenDay(d.day)} pageSize={31} exportName={`bloom-till-days-${period.start}`} initialSort={{ key: 'day', dir: 'desc' }} empty="The till was not opened in this period."
            columns={[
              { key: 'day', label: 'Day', render: (d) => <span className={`whitespace-nowrap ${openDay === d.day ? 'font-medium text-plum' : ''}`}>{dayLabel(d.day)}</span> },
              { key: 'opening', label: 'Opening', align: 'right', render: (d) => (d.opening == null ? <span className="text-muted">—</span> : da(d.opening)) },
              { key: 'in', label: 'In', align: 'right', render: (d) => <span className="text-sage">{da(d.in)}</span> },
              { key: 'out', label: 'Out', align: 'right', render: (d) => <span className="text-rose">{da(d.out)}</span> },
              { key: 'expected', label: 'Should be', align: 'right', render: (d) => da(d.expected) },
              { key: 'closing', label: 'Counted', align: 'right', render: (d) => (d.closing == null ? <Pill tone="amber">Not closed</Pill> : da(d.closing)), csv: (d) => d.closing ?? '' },
              { key: 'difference', label: 'Difference', align: 'right', render: (d) => (d.difference == null ? '—' : d.difference === 0 ? <CheckCircle2 className="ml-auto h-4 w-4 text-sage" aria-label="Exact" /> : <Signed v={d.difference} />), csv: (d) => d.difference ?? '' },
            ]} />
        </Card>
        {day ? <TillDay d={day} /> : <Card><Empty title="Choose a day">Every opening, payment, cash-out and closing of that day, in order, with who entered it and the balance after each line.</Empty></Card>}
      </div>
    </>
  )
}

function TillDay({ d }) {
  const { open } = useApp()
  return (
    <Card title={dayLabel(d.day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      hint={[d.openedBy && `opened by ${d.openedBy}${d.openedAt ? ` at ${formatTime(d.openedAt)}` : ''}`, d.closedBy && `closed by ${d.closedBy}${d.closedAt ? ` at ${formatTime(d.closedAt)}` : ''}`].filter(Boolean).join(' · ')}>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
        <Box label="Should be in the till" value={da(d.expected)} />
        <Box label="Counted at closing" value={d.closing == null ? '—' : da(d.closing)} />
        <Box label="Difference" value={d.difference == null ? '—' : daSigned(d.difference)} tone={d.difference < 0 ? 'text-rose' : d.difference > 0 ? 'text-amber' : 'text-sage'} />
      </div>
      {d.counted && (
        <p className="mb-3 rounded-xl bg-cream/70 p-3 text-xs text-muted">
          Counted: cash {da(d.counted.cash)} · BaridiMob {da(d.counted.baridimob)} · USD {da(d.counted.usd)}{d.banked ? ` · ${da(d.banked)} taken out to the bank, ${da(d.closing)} left in the drawer` : ''}
        </p>
      )}
      <p className="mb-2 text-xs text-muted">By method today: {Object.entries(d.byMethod).map(([m, v]) => `${methodLabel(m)} ${daSigned(v)}`).join(' · ') || 'nothing'}</p>
      <ol className="max-h-[560px] divide-y divide-line/60 overflow-y-auto text-sm">
        {d.movements.map((m) => (
          <li key={m.key} onClick={m.orderId ? () => open('order', m.orderId) : undefined} className={`grid grid-cols-[52px_1fr_auto_auto] items-baseline gap-3 py-2 ${m.orderId ? 'cursor-pointer hover:bg-plum-soft/30' : ''} ${m.kind === 'opening' || m.kind === 'closing' ? 'font-medium' : ''}`}>
            <span className="tabular text-xs text-muted">{m.at ? formatTime(m.at) : ''}</span>
            <span className="min-w-0">
              <span className="text-ink">{m.type}</span>
              <span className="block truncate text-xs text-muted">{[m.category !== m.type && m.category, m.description, m.method && methodLabel(m.method), m.who].filter(Boolean).join(' · ')}</span>
            </span>
            <span>{m.kind === 'cash_in' || m.kind === 'cash_out' ? <Signed v={m.amount} /> : <span className="tabular">{da(m.amount)}</span>}</span>
            <span className="tabular w-24 text-right text-xs text-muted">{da(m.balance)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-right text-[11px] text-muted">Last column = balance after the line</p>
    </Card>
  )
}

function Box({ label, value, tone = 'text-ink' }) {
  return <div className="rounded-xl bg-cream/70 p-3"><p className="text-xs text-muted">{label}</p><p className={`tabular mt-1 font-display text-lg ${tone}`}>{value}</p></div>
}

// ─── Every stock movement ───────────────────────────────────────────────
function Stock() {
  const { ds, period, rawData, open } = useApp()
  const rows = useMemo(() => stockMoves(rawData, ds, period), [rawData, ds, period])
  const [type, setType] = useState('')
  const shown = type ? rows.filter((r) => stockType(r.type).label === type) : rows
  const types = [...new Set(rows.map((r) => stockType(r.type).label))].sort()
  return (
    <Card title="Every stock movement" hint="Deliveries, counts, removals and waste, with the stock before and after and who did it · click a line to open the product">
      <DataTable rows={shown} pageSize={50} onRowClick={(r) => open('product', r.productId)} exportName={`bloom-stock-moves-${period.start}`} search={(r) => `${r.name} ${r.reason} ${r.who}`}
        initialSort={{ key: 'day', dir: 'desc' }} empty="No stock movements in this period."
        toolbar={<FilterSelect label="Type" value={type} onChange={setType} options={types.map((t) => [t, t])} />}
        columns={[
          { key: 'day', label: 'When', sort: (r) => `${r.day} ${r.at || ''}`, render: (r) => <span className="whitespace-nowrap">{when(r)}</span>, csv: (r) => `${r.day}${r.at ? ` ${formatTime(r.at)}` : ''}` },
          { key: 'name', label: 'Product', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'type', label: 'What', render: (r) => <Pill tone={stockType(r.type).tone}>{stockType(r.type).label}</Pill>, csv: (r) => stockType(r.type).label },
          { key: 'change', label: 'Change', align: 'right', render: (r) => <span className={`tabular font-medium ${r.change < 0 ? 'text-rose' : 'text-sage'}`}>{r.change > 0 ? '+' : ''}{num(r.change)}</span> },
          { key: 'before', label: 'Before → after', align: 'right', sort: (r) => r.after, render: (r) => (r.before == null ? '—' : <span className="tabular text-muted">{num(r.before)} → <span className="text-ink">{num(r.after)}</span></span>), csv: (r) => (r.before == null ? '' : `${r.before} -> ${r.after}`) },
          { key: 'reason', label: 'Reason' },
          { key: 'who', label: 'By', render: (r) => r.who || <span className="text-muted">—</span> },
          { key: 'cost', label: 'Value', align: 'right', render: (r) => (r.cost == null ? '—' : da(r.cost)) },
        ]} />
    </Card>
  )
}

// ─── Who did what (Blossom's activity log) ──────────────────────────────
function Activity() {
  const { period } = useApp()
  const { profile } = useAuth()
  const [state, setState] = useState({ loading: true, rows: [], error: null })
  const [person, setPerson] = useState('')
  const [area, setArea] = useState('')

  useEffect(() => {
    let alive = true
    setState({ loading: true, rows: [], error: null })
    loadActivity(period.start, period.end)
      .then((rows) => alive && setState({ loading: false, rows, error: null }))
      .catch((err) => alive && setState({ loading: false, rows: [], error: err.message }))
    return () => { alive = false }
  }, [period.start, period.end])

  if (profile?.role !== 'owner') return <Card><p className="flex items-center gap-2 text-sm text-amber"><Lock className="h-4 w-4" /> Only owner accounts can see who did what.</p></Card>
  const rows = state.rows.map((r, i) => ({ ...r, key: `${r.at}-${i}`, who: r.actor_name || r.actor_username || 'System', where: r.area || r.kind || '' }))
  const shown = rows.filter((r) => (!person || r.who === person) && (!area || r.where === area))
  return (
    <Card title="Who did what" hint="Everything recorded in Blossom: orders, payments, edits, cancellations, stock, cash, logins…">
      {state.error ? <p className="flex items-center gap-2 text-sm text-rose"><AlertTriangle className="h-4 w-4" /> {state.error}</p> : (
        <DataTable rows={shown} pageSize={50} exportName={`bloom-activity-${period.start}`} search={(r) => `${r.who} ${r.summary} ${r.order_number ?? ''}`}
          empty={state.loading ? 'Loading the activity log…' : 'Nothing recorded in this period.'} initialSort={{ key: 'at', dir: 'desc' }}
          toolbar={
            <>
              <History className="h-4 w-4 text-muted" />
              <FilterSelect label="Who" value={person} onChange={setPerson} options={[...new Set(rows.map((r) => r.who))].sort().map((v) => [v, v])} />
              <FilterSelect label="Area" value={area} onChange={setArea} options={[...new Set(rows.map((r) => r.where).filter(Boolean))].sort().map((v) => [v, v])} />
              {state.rows.length >= 5000 && <span className="text-xs text-amber">Showing the first 5 000; choose a shorter period.</span>}
            </>
          }
          columns={[
            { key: 'at', label: 'When', render: (r) => <span className="whitespace-nowrap">{dayLabel(dayKey(r.at), { day: 'numeric', month: 'short' })} · {formatTime(r.at)}</span>, csv: (r) => r.at },
            { key: 'who', label: 'Who', render: (r) => <><p className="font-medium">{r.who}</p>{r.actor_role && <p className="text-xs capitalize text-muted">{r.actor_role}</p>}</> },
            { key: 'where', label: 'Area', render: (r) => (r.where ? <Pill tone="plum">{r.where}</Pill> : '—'), csv: (r) => r.where },
            { key: 'summary', label: 'What happened', render: (r) => <span>{r.summary}{r.order_number && <span className="ml-1 font-medium text-plum">#{r.order_number}</span>}</span> },
            { key: 'amount', label: 'Amount', align: 'right', render: (r) => (r.amount == null ? '' : da(r.amount)) },
          ]} />
      )}
    </Card>
  )
}
