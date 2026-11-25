import { useMemo, useState } from 'react'
import { Banknote, Receipt, ShoppingBag, Sparkles, Users, Wallet, Target, Package, CheckCircle2, AlertTriangle, AlertOctagon, Lightbulb, ArrowRight } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Stat, Delta, BarList, Meter, Segmented, Empty } from '../components/ui.jsx'
import { Bars } from '../components/Charts.jsx'
import * as M from '../model/metrics.js'
import { insights } from '../model/insights.js'
import { makePeriod } from '../model/period.js'
import { da, delta, num, ratio, pct, plural } from '../lib/format.js'
import { CHANNEL_LABELS, PAYMENT_LABELS, label } from '../lib/labels.js'
import { today } from '../lib/time.js'

/** Everything the insight engine needs, shared by Overview. */
export function useInsightContext() {
  const { ds, sel, prevSel, period, dailyTarget, prefs } = useApp()
  return useMemo(() => {
    const s = M.summary(sel)
    const profiles = M.customerProfiles(ds, period.end < today() ? period.end : today())
    const st = M.stock(ds, period, { coverDays: prefs.coverDays })
    return {
      summary: s,
      previous: M.summary(prevSel),
      pace: M.pace(sel, period, dailyTarget),
      products: M.productRows(ds, sel, prevSel, { coverDays: prefs.coverDays }),
      weekdays: M.weekdays(sel, period),
      hours: M.hours(sel),
      channels: M.breakdown(sel, (o) => o.channel, (k) => label(CHANNEL_LABELS, k)),
      customers: profiles,
      loyalty: M.loyaltyStats(profiles),
      receivables: M.receivables(ds),
      bills: M.supplierBills(ds),
      stock: st,
      slow: M.slowMovers(ds),
      anomalies: ds.anomalies,
      money: M.money(ds, sel, period),
      ops: M.operations(sel),
      period,
    }
  }, [ds, sel, prevSel, period, dailyTarget, prefs.coverDays])
}

const TONE = {
  bad: { icon: AlertOctagon, cls: 'bg-rose-soft text-rose' },
  warn: { icon: AlertTriangle, cls: 'bg-amber-soft text-amber' },
  good: { icon: CheckCircle2, cls: 'bg-sage-soft text-sage' },
  info: { icon: Lightbulb, cls: 'bg-plum-soft text-plum' },
}

export function InsightList({ list, limit }) {
  const { go } = useApp()
  const [all, setAll] = useState(false)
  const shown = all || !limit ? list : list.slice(0, limit)
  if (!list.length) return <p className="py-4 text-sm text-muted">Nothing worth flagging in this period.</p>
  return (
    <>
      <ul className="grid gap-2 md:grid-cols-2">
        {shown.map((i) => {
          const t = TONE[i.tone]
          return (
            <li key={i.title}>
              <button onClick={() => i.action && go(i.action.page, i.action.filters)} className="group flex h-full w-full items-start gap-3 rounded-2xl border border-line/70 bg-paper p-3 text-left transition hover:border-plum/30 hover:shadow-md">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${t.cls}`}><t.icon className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{i.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{i.detail}</span>
                </span>
                {i.action && <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" aria-hidden="true" />}
              </button>
            </li>
          )
        })}
      </ul>
      {limit && list.length > limit && (
        <button onClick={() => setAll((v) => !v)} className="mt-3 w-full rounded-xl py-2 text-sm font-medium text-plum hover:bg-plum-soft/50">
          {all ? 'Show fewer' : `Show all ${list.length} findings`}
        </button>
      )}
    </>
  )
}

export default function Overview() {
  const { ds, sel, period, prev, open, setPeriod, filters, setFilter, dailyTarget, go } = useApp()
  const ctx = useInsightContext()
  const [measure, setMeasure] = useState('revenue')
  const s = ctx.summary
  const p = ctx.previous
  const pace = ctx.pace
  const mix = useMemo(() => M.customerMix(ds, sel), [ds, sel])
  const tl = useMemo(() => M.timeline(sel, period, dailyTarget), [sel, period, dailyTarget])
  const found = useMemo(() => insights(ctx), [ctx])
  const payments = useMemo(() => M.breakdown(sel, (o) => o.payment, (k) => label(PAYMENT_LABELS, k)), [sel])

  if (!s.orders && !s.cancelled) {
    return (<><PageHeader title={period.label} subtitle="Overview" /><div className="card"><Empty title="No sales in this period">Pick another period at the top, or clear the filters.</Empty></div></>)
  }

  const onBar = (row) => {
    if (tl.grain === 'day') open('day', row.key)
    else setPeriod(makePeriod('month', row.key))
  }

  return (
    <>
      <PageHeader title={period.label} subtitle={pace.running ? `Day ${pace.elapsed} of ${pace.days} · live from Blossom` : 'Overview · live from Blossom'} />

      {/* Target */}
      {pace.target > 0 && !sel.itemScoped && Object.keys(filters).length === 0 && (
        <Card className="mb-4" title={<span className="flex items-center gap-2"><Target className="h-4 w-4 text-plum" /> Target</span>}
          info={`Your daily target (${da(dailyTarget)}) × ${pace.days} days. Change it in Settings. Projection = sales per day so far × days in the period.`}>
          <div className="grid gap-5 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="tabular font-display text-3xl text-ink">{ratio(pace.progress)}</span>
                <span className="tabular text-muted">{da(pace.revenue)} of {da(pace.target)}</span>
              </div>
              <Meter className="mt-3" value={pace.progress} tone={pace.progress >= 1 ? 'sage' : 'plum'} />
              {pace.running && <div className="relative h-0"><span className="absolute -top-2 h-2 w-0.5 bg-ink/40" style={{ left: `${Math.min((pace.elapsed / pace.days) * 100, 100)}%` }} title="Today" /></div>}
            </div>
            <Mini label={pace.running ? 'Projected finish' : 'Finished at'} value={da(pace.projected)} note={pace.projected >= pace.target ? `${da(pace.projected - pace.target)} above target` : `${da(pace.target - pace.projected)} below target`} good={pace.projected >= pace.target} />
            <Mini label="Per day so far" value={da(pace.perDay)} note={`target ${da(dailyTarget)}`} good={pace.perDay >= dailyTarget} />
            {pace.running ? <Mini label="Needed per day now" value={da(pace.neededPerDay)} note={`${pace.remainingDays} days left`} good={pace.neededPerDay <= pace.perDay} /> : <Mini label="Days on target" value={`${tl.rows.filter((r) => r.revenue >= dailyTarget).length} / ${tl.rows.length}`} note="days at or above target" />}
          </div>
        </Card>
      )}

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Banknote} label="Sales value" value={da(s.revenue)} onClick={() => go('sales')}
          info="Sum of order totals, after discounts. Cancelled, voided and refunded orders are left out."><Delta value={delta(s.revenue, p.revenue)} suffix={prev.partial ? 'vs same days before' : 'vs period before'} /></Stat>
        <Stat icon={Sparkles} label="Gross profit" tone="sage" value={s.estGrossProfit == null ? '—' : da(s.estGrossProfit)} onClick={() => go('products')}
          info={`Sales minus what the flowers cost you (average supplier price). ${ratio(s.costCoverage)} of sales have a known cost; the rest is assumed to earn the same margin.`}>{s.marginPct == null ? 'no costs yet' : `${ratio(s.marginPct)} margin`}</Stat>
        <Stat icon={Receipt} label="Orders" tone="rose" value={num(s.orders)} onClick={() => go('orders')} info="Counted sales only. Cancelled orders are on the Operations page."><Delta value={delta(s.orders, p.orders)} /></Stat>
        <Stat icon={ShoppingBag} label="Average order" tone="amber" value={da(s.avgOrder)} onClick={() => go('sales')} info="Sales value ÷ orders."><Delta value={delta(s.avgOrder, p.avgOrder)} /></Stat>
        <Stat icon={Wallet} label="Collected" tone="sage" value={da(s.collected)} onClick={() => go('money')} info="Money actually received for these orders. The rest is still owed.">{s.due > 0 ? <span className="text-amber">{da(s.due)} still owed</span> : 'all paid'}</Stat>
        <Stat icon={Users} label="Customers" tone="plum" value={num(s.customers)} onClick={() => go('customers')} info="Named customers who bought in the period. New = first ever order in this period.">{num(mix.newCustomers)} new · {num(mix.returning)} returning</Stat>
      </div>

      {/* Insights */}
      <Card className="mb-4" title={<span className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-plum" /> What Bloom noticed</span>} hint="Click a finding to open the page with the details">
        <InsightList list={found} limit={6} />
      </Card>

      {/* Timeline */}
      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={tl.grain === 'day' ? 'Day by day' : 'Month by month'} hint={tl.grain === 'day' ? 'Click a day to see its orders' : 'Click a month to open it'}
          action={<Segmented label="Measure" value={measure} onChange={setMeasure} options={[['revenue', 'Sales'], ['orders', 'Orders']]} />}>
          <Bars data={tl.rows} measure={measure} height={340} onSelect={onBar} target={measure === 'revenue' && tl.grain === 'day' ? dailyTarget : 0} />
        </Card>
        <Card title="Best sellers" hint="Click a product for its full story" action={<button onClick={() => go('products')} className="text-xs font-medium text-plum hover:underline">All products</button>}>
          <BarList rows={ctx.products.slice(0, 7).map((r) => ({ ...r, label: r.name }))} limit={7} onSelect={(k) => open('product', isNaN(k) ? k : Number(k))}
            extra={(r) => `${num(r.qty)} sold${r.marginPct != null ? ` · ${ratio(r.marginPct)} margin` : ''}`} />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Where sales come from" hint="Click to filter everything">
          <BarList rows={ctx.channels} onSelect={(k) => setFilter('channel', k)} active={filters.channel} extra={(r) => `${plural(r.orders, 'order')} · avg ${da(r.avg)}`} />
        </Card>
        <Card title="How customers pay" hint="Click to filter everything">
          <BarList rows={payments} onSelect={(k) => setFilter('payment', k)} active={filters.payment} extra={(r) => `${num(r.orders)} orders`} />
        </Card>
        <Card title="At a glance">
          <dl className="space-y-2.5 text-sm">
            <Row k="Items sold" v={`${num(s.itemsSold)} (${num(s.productsSold)} products)`} icon={Package} />
            <Row k="Discounts given" v={da(s.discounts)} />
            <Row k="Extra charges" v={da(s.extras)} />
            <Row k="Cancelled" v={`${num(s.cancelled)} orders · ${da(s.cancelledValue)}`} />
            <Row k="Walk-in sales" v={`${pct(s.walkInOrders, s.orders)}% of orders`} />
            <Row k="Left after costs" v={da(ctx.money.left)} strong />
          </dl>
        </Card>
      </div>
    </>
  )
}

function Mini({ label: l, value, note, good }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{l}</p>
      <p className="tabular mt-1 font-display text-xl text-ink">{value}</p>
      {note && <p className={`mt-0.5 text-xs ${good === true ? 'text-sage' : good === false ? 'text-amber' : 'text-muted'}`}>{note}</p>}
    </div>
  )
}

function Row({ k, v, strong, icon: Icon }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
      <dt className="flex items-center gap-1.5 text-muted">{Icon && <Icon className="h-3.5 w-3.5" />}{k}</dt>
      <dd className={`tabular text-right ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>{v}</dd>
    </div>
  )
}
