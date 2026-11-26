import { useMemo, useState } from 'react'
import { Banknote, PiggyBank, Receipt, Scale, Plus, Printer, CalendarCheck, ChevronLeft, ChevronRight, XCircle, HandCoins, Wallet } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Stat, Pill, BarList, Segmented, Delta } from '../components/ui.jsx'
import { DataTable } from '../components/DataTable.jsx'
import { Dialog, Field, Input, Money, Select, Button, Confirm, useDialog } from '../components/Form.jsx'
import { SetupNotice } from '../components/SetupNotice.jsx'
import * as A from '../data/actions.js'
import * as M from '../model/metrics.js'
import { accounts, payables, EXPENSE_CATEGORIES, METHODS, METHOD_LABEL } from '../model/backoffice.js'
import { makePeriod, weekEnding, inPeriod, comparablePrevious } from '../model/period.js'
import { select } from '../model/filters.js'
import { da, daSigned, num, ratio, delta } from '../lib/format.js'
import { addDays, dayLabel, eachDay, today } from '../lib/time.js'

const short = (d) => dayLabel(d, { day: 'numeric', month: 'short' })

export default function Accounting() {
  const { ds, bo, sel, period, setupNeeded } = useApp()
  const dlg = useDialog()
  const [list, setList] = useState('all')

  const acc = useMemo(() => accounts(ds, bo, sel, period), [ds, bo, sel, period])
  const owe = useMemo(() => payables(bo), [bo])
  const rec = useMemo(() => M.receivables(ds), [ds])
  const lines = list === 'all' ? acc.lines : acc.lines.filter((l) => l.source === list)

  return (
    <>
      <PageHeader title="Accounting" subtitle={`Profit, costs and cash · ${period.label}`}>
        <Button icon={Plus} onClick={() => dlg.open('expense', {})} disabled={setupNeeded}>Add an expense</Button>
      </PageHeader>

      <FridayClosing />

      <div className="mb-4 mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Banknote} label="Sales" value={da(acc.sales)}>{da(acc.collected)} collected</Stat>
        <Stat icon={Wallet} tone="plum" label="Gross profit" value={acc.gross == null ? '—' : da(acc.gross)} info="Sales minus what the flowers and items sold cost you (average supplier price).">{ratio(acc.grossMargin)} margin</Stat>
        <Stat icon={Receipt} tone="amber" label="Running costs" value={da(acc.operating)} info="Till cash-outs + expenses paid outside the till + staff pay not taken from the till + waste at cost." />
        <Stat icon={PiggyBank} tone={acc.net != null && acc.net < 0 ? 'rose' : 'sage'} label="Net profit" value={acc.net == null ? '—' : da(acc.net)} info="Gross profit minus running costs.">{ratio(acc.netMargin)} of sales</Stat>
        <Stat icon={HandCoins} tone="rose" label="You owe suppliers" value={da(owe.total)} info="All suppliers, whatever the period.">{num(owe.suppliers.length)} suppliers</Stat>
        <Stat icon={Scale} tone="sky" label="Customers owe you" value={da(rec.total)} info="Unpaid order balances, whatever the period.">{num(rec.orders.length)} orders</Stat>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card title="Profit and loss" hint={period.label} className="xl:col-span-1"
          info="Profit counts what the goods you sold cost, not what you bought this period. Staff payments marked “taken from the till” are already in the till’s cash-outs, so they are counted once.">
          <Statement rows={[
            ['Sales', acc.sales, 'head'],
            ['Cost of goods sold', -acc.cogs, '', acc.costCoverage != null && acc.costCoverage < 0.95 ? `estimated: ${ratio(acc.costCoverage)} of items have a cost` : 'average supplier price'],
            ['Gross profit', acc.gross, 'sub'],
            ['Till expenses', -acc.tillCosts, '', 'cash-outs in Blossom'],
            ['Other expenses', -acc.officeCosts, '', 'rent, bills, bank…'],
            ['Staff pay', -acc.staffCosts, '', acc.staffFromTill ? `+ ${da(acc.staffFromTill)} taken from the till (in till expenses)` : 'outside the till'],
            ['Waste', -acc.wasteCost, '', 'thrown-away stock at cost'],
            ['Net profit', acc.net, 'total'],
          ]} />
        </Card>
        <Card title="Cash in and out" hint="Money that actually moved" info="Collected from customers, minus what was paid to suppliers, till expenses, other expenses and staff. Different from profit: buying stock costs cash now but profit only when it sells.">
          <Statement rows={[
            ['Collected from customers', acc.cash.in, 'head'],
            ['Paid to suppliers', -acc.cash.suppliers],
            ['Till expenses', -acc.cash.till],
            ['Other expenses', -acc.cash.office],
            ['Staff pay', -acc.cash.staff],
            ['Cash result', acc.cash.net, 'total'],
          ]} />
          <p className="mt-3 text-xs text-muted">Stock bought in the period: {da(acc.purchased)}</p>
        </Card>
        <Card title="Where the money goes" hint="Expenses by category">
          <BarList rows={acc.categories} empty="No expenses in this period." extra={(c) => [c.till && `${da(c.till)} till`, c.office && `${da(c.office)} outside`].filter(Boolean).join(' · ')} />
        </Card>
      </div>

      {setupNeeded && <div className="mb-4"><SetupNotice what="Expenses outside the till and staff pay" /></div>}

      <Card title="Expenses" hint={period.label}>
        <DataTable rows={lines} exportName={`bloom-expenses-${period.start}`} initialSort={{ key: 'day', dir: 'desc' }} search={(l) => `${l.category} ${l.description}`} pageSize={20}
          toolbar={<Segmented label="Source" value={list} onChange={setList} options={[['all', 'All'], ['till', 'Till'], ['office', 'Outside the till'], ['staff', 'Staff']]} />}
          columns={[
            { key: 'day', label: 'Date', render: (l) => short(l.day) },
            { key: 'category', label: 'Category' },
            { key: 'description', label: 'What' },
            { key: 'source', label: 'From', render: (l) => <Pill tone={l.source === 'till' ? 'muted' : l.source === 'staff' ? 'plum' : 'amber'}>{l.source === 'till' ? 'Till' : l.source === 'staff' ? 'Staff' : METHOD_LABEL[l.method] || 'Outside'}</Pill>, csv: (l) => l.source },
            { key: 'amount', label: 'Amount', align: 'right', render: (l) => da(l.amount) },
            { key: 'x', label: '', sortable: false, csv: false, render: (l) => (l.source === 'office'
              ? <span className="flex justify-end gap-1"><button onClick={() => dlg.open('expense', l)} className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-plum-soft hover:text-plum">Edit</button><button onClick={() => dlg.open('void', l)} aria-label="Cancel expense" className="rounded-lg p-1 text-muted hover:bg-rose-soft hover:text-rose"><XCircle className="h-4 w-4" /></button></span>
              : null) },
          ]} />
        <p className="mt-3 text-xs text-muted">Till expenses are entered at the till in Blossom. Use “Add an expense” only for money paid some other way (bank, safe, owner’s pocket), so nothing is counted twice.</p>
      </Card>

      {dlg.is('expense') && <ExpenseDialog data={dlg.state.data} onClose={dlg.close} />}
      {dlg.is('void') && <VoidExpense data={dlg.state.data} onClose={dlg.close} />}
    </>
  )
}

function Statement({ rows }) {
  return (
    <ul className="text-sm">
      {rows.map(([k, v, kind, note]) => (
        <li key={k} className={`flex items-baseline justify-between gap-3 py-2 ${kind === 'sub' || kind === 'total' ? 'border-t border-line' : ''} ${kind === 'total' ? 'mt-1 border-t-2' : ''}`}>
          <span>
            <span className={kind === 'total' || kind === 'sub' || kind === 'head' ? 'font-medium text-ink' : 'text-ink'}>{k}</span>
            {note && <span className="block text-xs text-muted">{note}</span>}
          </span>
          <span className={`tabular whitespace-nowrap ${kind === 'total' ? 'font-display text-xl' : ''} ${v == null ? 'text-muted' : v < 0 ? 'text-rose' : 'text-ink'}`}>
            {v == null ? '—' : kind === 'head' ? da(v) : daSigned(v)}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ─── Friday closing: the shop's weekly count, Saturday → Friday ─────────
function FridayClosing() {
  const { ds, bo } = useApp()
  const lastFriday = weekEnding(today())
  const [friday, setFriday] = useState(lastFriday)
  const week = makePeriod('week', friday)
  // A running week is compared with the same days of last week, never a whole week.
  const prev = comparablePrevious(week)

  const d = useMemo(() => {
    const s = select(ds, week, {})
    const p = select(ds, prev, {})
    const now = accounts(ds, bo, s, week)
    const before = accounts(ds, bo, p, prev)
    const days = eachDay(week.start, week.end).map((day) => {
      const orders = s.counted.filter((o) => o.day === day)
      return {
        key: day, day,
        orders: orders.length,
        sales: orders.reduce((t, o) => t + o.value, 0),
        collected: orders.reduce((t, o) => t + o.paid, 0),
        spent: now.lines.filter((l) => l.day === day).reduce((t, l) => t + l.amount, 0),
        future: day > today(),
      }
    })
    const supplierPaid = bo.payments.filter((x) => inPeriod(x.day, week))
    const delivered = ds.purchases.filter((x) => inPeriod(x.day, week) && !x.suspicious)
    return { now, before, days, supplierPaid, delivered }
  }, [ds, bo, friday]) // eslint-disable-line react-hooks/exhaustive-deps

  const { now, before } = d
  const running = friday >= today()

  return (
    <section className="card rise overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 bg-gradient-to-r from-plum-soft/70 to-rose-soft/40 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-plum text-white"><CalendarCheck className="h-5 w-5" /></span>
          <div>
            <h2 className="font-display text-xl text-ink">Friday closing</h2>
            <p className="text-sm text-muted">Saturday {short(week.start)} → Friday {short(week.end)}{running && ' · week still running'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setFriday(addDays(friday, -7))} aria-label="Previous week" className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-paper hover:text-plum"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setFriday(addDays(friday, 7))} disabled={friday >= lastFriday} aria-label="Next week" className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-paper hover:text-plum disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          {friday !== lastFriday && <Button variant="ghost" onClick={() => setFriday(lastFriday)}>This week</Button>}
          <Button variant="outline" icon={Printer} onClick={() => printClosing(week, d)}>Print the closing</Button>
        </div>
      </header>

      <div className="grid gap-px bg-line/60 sm:grid-cols-2 xl:grid-cols-5">
        <Big running={running} label="Sales" value={da(now.sales)} d={delta(now.sales, before.sales)} />
        <Big running={running} label="Collected" value={da(now.collected)} d={delta(now.collected, before.collected)} />
        <Big running={running} label="All expenses" value={da(now.tillCosts + now.officeCosts + now.staffCosts)} d={delta(now.tillCosts + now.officeCosts + now.staffCosts, before.tillCosts + before.officeCosts + before.staffCosts)} invert />
        <Big running={running} label="Net profit" value={now.net == null ? '—' : da(now.net)} d={now.net != null && before.net ? delta(now.net, before.net) : null} strong />
        <Big label="Cash result" value={daSigned(now.cash.net)} d={null} note="collected − everything paid out" />
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[1.4fr_1fr]">
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-muted">Day by day</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 text-left font-medium">Day</th><th className="py-2 text-right font-medium">Orders</th><th className="py-2 text-right font-medium">Sales</th><th className="py-2 text-right font-medium">Collected</th><th className="py-2 text-right font-medium">Spent</th>
            </tr></thead>
            <tbody>
              {d.days.map((r) => (
                <tr key={r.day} className={`border-t border-line/60 ${r.future ? 'text-muted/60' : ''}`}>
                  <td className="py-1.5">{dayLabel(r.day, { weekday: 'long', day: 'numeric', month: 'short' })}</td>
                  <td className="tabular py-1.5 text-right">{r.future ? '' : num(r.orders)}</td>
                  <td className="tabular py-1.5 text-right">{r.future ? '' : da(r.sales)}</td>
                  <td className="tabular py-1.5 text-right">{r.future ? '' : da(r.collected)}</td>
                  <td className="tabular py-1.5 text-right text-rose">{r.spent ? da(r.spent) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-line font-medium">
              <td className="py-2">Week</td><td className="tabular py-2 text-right">{num(d.days.reduce((t, r) => t + r.orders, 0))}</td>
              <td className="tabular py-2 text-right">{da(now.sales)}</td><td className="tabular py-2 text-right">{da(now.collected)}</td>
              <td className="tabular py-2 text-right text-rose">{da(now.tillCosts + now.officeCosts + now.staffCosts)}</td>
            </tr></tfoot>
          </table>
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-muted">The week’s account</h3>
          <Statement rows={[
            ['Sales', now.sales, 'head'],
            ['Cost of goods sold', -now.cogs],
            ['Till expenses', -now.tillCosts],
            ['Other expenses', -now.officeCosts],
            ['Staff pay', -now.staffCosts],
            ['Waste', -now.wasteCost],
            ['Net profit', now.net, 'total'],
          ]} />
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-cream/70 p-3"><p className="text-xs text-muted">Stock received</p><p className="tabular font-display text-lg">{da(now.purchased)}</p><p className="text-xs text-muted">{num(d.delivered.length)} delivery lines</p></div>
            <div className="rounded-xl bg-cream/70 p-3"><p className="text-xs text-muted">Paid to suppliers</p><p className="tabular font-display text-lg">{da(now.cash.suppliers)}</p><p className="text-xs text-muted">{num(d.supplierPaid.length)} payments</p></div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Big({ label, value, d, invert, strong, note, running }) {
  return (
    <div className="bg-paper p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`tabular mt-1 font-display leading-none tracking-tight text-ink ${strong ? 'text-[28px]' : 'text-[24px]'}`}>{value}</p>
      <div className="mt-2 min-h-5">{note ? <span className="text-xs text-muted">{note}</span> : <Delta value={d} invert={invert} suffix={running ? 'vs same days last week' : 'vs last week'} />}</div>
    </div>
  )
}

function printClosing(week, d) {
  const w = window.open('', '_blank', 'width=760,height=980')
  if (!w) return
  const { now } = d
  const row = (k, v, b) => `<tr${b ? ' class="b"' : ''}><td>${k}</td><td class="n">${v}</td></tr>`
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Friday closing ${week.end}</title>
<style>body{font:13px system-ui;margin:36px;color:#2b2138}h1{font:600 24px Georgia;margin:0}h2{font:600 15px Georgia;margin:22px 0 6px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #e5e0e6;text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}.b td{font-weight:700;border-top:2px solid #2b2138}.m{color:#7a6f86}.sig{margin-top:40px;display:flex;gap:60px}.sig div{flex:1;border-top:1px solid #999;padding-top:6px}</style>
<h1>Friday closing</h1><p class="m">Blossom · Saturday ${dayLabel(week.start, { day: 'numeric', month: 'long' })} to Friday ${dayLabel(week.end, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
<h2>Day by day</h2><table><tr><th>Day</th><th class="n">Orders</th><th class="n">Sales</th><th class="n">Collected</th><th class="n">Spent</th></tr>
${d.days.map((r) => `<tr><td>${dayLabel(r.day, { weekday: 'long', day: 'numeric', month: 'short' })}</td><td class="n">${r.orders}</td><td class="n">${da(r.sales)}</td><td class="n">${da(r.collected)}</td><td class="n">${r.spent ? da(r.spent) : ''}</td></tr>`).join('')}
</table>
<h2>Account</h2><table>
${row('Sales', da(now.sales))}${row('Cost of goods sold', daSigned(-now.cogs))}${row('Till expenses', daSigned(-now.tillCosts))}${row('Other expenses', daSigned(-now.officeCosts))}${row('Staff pay', daSigned(-now.staffCosts))}${row('Waste', daSigned(-now.wasteCost))}${row('Net profit', now.net == null ? '—' : daSigned(now.net), true)}
</table>
<h2>Cash</h2><table>
${row('Collected from customers', da(now.cash.in))}${row('Paid to suppliers', daSigned(-now.cash.suppliers))}${row('Till expenses', daSigned(-now.cash.till))}${row('Other expenses', daSigned(-now.cash.office))}${row('Staff pay', daSigned(-now.cash.staff))}${row('Cash result', daSigned(now.cash.net), true)}
</table>
<p class="m">Stock received this week: ${da(now.purchased)}</p>
<div class="sig"><div>Counted by</div><div>Checked by</div></div><script>print()</script>`)
  w.document.close()
}

// ─── Expense dialogs ────────────────────────────────────────────────────
function ExpenseDialog({ data, onClose }) {
  const { bo, saved } = useApp()
  const [f, setF] = useState({ day: data?.day || today(), category: data?.category || '', description: data?.description || '', amount: data?.amount ? String(data.amount) : '', method: data?.method || 'bank', supplierId: data?.supplierId || '', id: data?.id })
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }))
  const cats = [...new Set([...EXPENSE_CATEGORIES, ...bo.backExpenses.map((e) => e.category)])]
  return (
    <Dialog title={f.id ? 'Edit expense' : 'Add an expense'} subtitle="Money paid outside the till: rent, bills, bank transfers, the owner’s pocket"
      submitLabel={f.amount ? `Save ${da(f.amount)}` : 'Save'} onClose={onClose}
      onSubmit={async () => { await A.saveExpense(f); onClose(); await saved(f.id ? 'Expense updated' : 'Expense added') }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={f.day} max={today()} onChange={set('day')} required /></Field>
        <Field label="Amount"><Money value={f.amount} onChange={set('amount')} /></Field>
      </div>
      <Field label="Category"><Select value={f.category} onChange={set('category')} placeholder="Choose" options={cats.map((c) => [c, c])} /></Field>
      <Field label="What was it?"><Input value={f.description} onChange={set('description')} placeholder="e.g. November rent" maxLength={300} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paid by"><Select value={f.method} onChange={set('method')} options={METHODS} /></Field>
        <Field label="To a supplier (optional)"><Select value={f.supplierId} onChange={set('supplierId')} placeholder="—" options={bo.suppliers.filter((s) => s.active).map((s) => [s.id, s.name])} /></Field>
      </div>
      {f.method === 'cash' && <p className="text-xs text-amber">If this cash came out of the till, record it at the till instead, or it will be counted twice.</p>}
    </Dialog>
  )
}

function VoidExpense({ data: e, onClose }) {
  const { saved } = useApp()
  return (
    <Confirm title="Cancel this expense?" confirmLabel="Cancel expense" askReason="Why?" onClose={onClose}
      onConfirm={async (reason) => { await A.voidExpense(e.id, reason); await saved('Expense cancelled') }}>
      {e.category}{e.description ? `, ${e.description}` : ''}, {da(e.amount)} on {short(e.day)}. It stays in the records as cancelled and stops counting.
    </Confirm>
  )
}
