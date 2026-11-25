// Plain-language findings, each with where to look next.
// tone: 'good' | 'warn' | 'bad' | 'info'. action: { page, filters? }.

import { da, num, pct } from '../lib/format.js'
import { label, CHANNEL_LABELS } from '../lib/labels.js'
import { WEEKDAYS_LONG, daysBetween, today } from '../lib/time.js'

export function insights(ctx, now = new Date()) {
  const { summary: s, previous: p, pace, products, weekdays, hours, channels, customers, loyalty, receivables, bills, stock, slow, anomalies, money, ops } = ctx
  const out = []
  const add = (tone, title, detail, action) => out.push({ tone, title, detail, action })

  if (!s.orders) return out

  // Target
  if (pace.target && pace.running) {
    const gap = pace.projected - pace.target
    if (gap >= 0) add('good', `On track to beat the target by ${da(gap)}`, `At ${da(pace.perDay)} a day you should finish near ${da(pace.projected)} against a ${da(pace.target)} target.`, { page: 'overview' })
    else add('warn', `${da(-gap)} short of the target at this pace`, `You need ${da(pace.neededPerDay)} a day for the ${num(pace.remainingDays)} days left (now ${da(pace.perDay)}).`, { page: 'sales' })
  } else if (pace.target && !pace.running) {
    const hit = pace.revenue >= pace.target
    add(hit ? 'good' : 'warn', hit ? `Target reached: ${pct(pace.revenue, pace.target)}%` : `Target missed: ${pct(pace.revenue, pace.target)}% reached`, `${da(pace.revenue)} sold against ${da(pace.target)}.`, { page: 'overview' })
  }

  // Trend vs previous period (fair only when both are complete)
  if (p?.revenue && !pace.running) {
    const change = (s.revenue - p.revenue) / p.revenue
    if (Math.abs(change) >= 0.1) add(change > 0 ? 'good' : 'warn', `Sales ${change > 0 ? 'up' : 'down'} ${Math.abs(Math.round(change * 100))}% on the period before`, `${da(s.revenue)} now, ${da(p.revenue)} before. Average order ${da(s.avgOrder)} vs ${da(p.avgOrder)}.`, { page: 'sales' })
  }

  // Margin
  if (s.marginPct != null) {
    const lowMarginStars = products.filter((r) => r.marginPct != null && r.share >= 0.05 && r.marginPct < 0.3)
    if (lowMarginStars.length) add('warn', `${lowMarginStars.map((r) => r.name).slice(0, 3).join(', ')} sell a lot but earn little`, `Margin under 30% (${lowMarginStars.map((r) => `${r.name} ${Math.round(r.marginPct * 100)}%`).slice(0, 3).join(', ')}). A small price rise or a cheaper supplier would add up fast.`, { page: 'products' })
    const best = [...products].filter((r) => r.profit != null).sort((a, b) => b.profit - a.profit)[0]
    if (best) add('info', `${best.name} earns you the most: ${da(best.profit)} profit`, `${num(best.qty)} sold at ${Math.round(best.marginPct * 100)}% margin. Keep it in stock and in view.`, { page: 'products', filters: { product: best.id } })
  }
  if (s.costCoverage != null && s.costCoverage < 0.85) {
    add('info', `Profit is estimated: ${Math.round((1 - s.costCoverage) * 100)}% of sales have no known cost`, 'Gifts and bouquets have no supplier purchase price. Add their cost in Settings to make profit exact.', { page: 'settings' })
  }

  // Discounts
  const discountRate = s.discounts / (s.revenue + s.discounts || 1)
  if (s.discounts > 0 && discountRate >= 0.03) add(discountRate > 0.06 ? 'warn' : 'info', `${da(s.discounts)} given away in discounts (${Math.round(discountRate * 100)}% of full price)`, 'See who gives the most discounts on the Operations page, under Team.', { page: 'operations' })
  const underPriced = products.filter((r) => r.discountPct != null && r.discountPct > 0.1 && r.qty >= 10)
  if (underPriced.length) add('warn', `${underPriced.length} ${underPriced.length === 1 ? 'product sells' : 'products sell'} well below list price`, underPriced.slice(0, 3).map((r) => `${r.name}: ${da(r.avgPrice)} on average vs ${da(r.listPrice)}`).join(' · '), { page: 'products' })

  // When
  const busyDays = weekdays.filter((d) => d.days)
  if (busyDays.length >= 7) {
    const best = [...busyDays].sort((a, b) => b.perDay - a.perDay)[0]
    const worst = [...busyDays].sort((a, b) => a.perDay - b.perDay)[0]
    if (best.perDay > worst.perDay * 1.5) add('info', `${WEEKDAYS_LONG[best.key]}s sell ${(best.perDay / Math.max(worst.perDay, 1)).toFixed(1)}× more than ${WEEKDAYS_LONG[worst.key]}s`, `${da(best.perDay)} vs ${da(worst.perDay)} on an average day. A ${WEEKDAYS_LONG[worst.key]} offer or story post could lift the quiet day.`, { page: 'sales', filters: { weekday: worst.key } })
  }
  const peak = [...hours].sort((a, b) => b.revenue - a.revenue).slice(0, 3).sort((a, b) => a.key - b.key)
  if (peak.length === 3 && s.orders >= 30) add('info', `Busiest hours: ${peak.map((h) => `${h.key}h`).join(', ')}`, `${pct(peak.reduce((t, h) => t + h.revenue, 0), s.revenue)}% of sales happen then. Have bouquets ready and full staff at those hours.`, { page: 'sales' })

  // Channels
  const ig = channels.find((c) => c.key === 'instagram')
  const shop = channels.find((c) => c.key === 'inhouse')
  if (ig && shop && ig.orders >= 5) {
    add('info', `Instagram brings ${Math.round(ig.share * 100)}% of sales, with ${ig.avg > shop.avg ? 'bigger' : 'smaller'} baskets`, `${da(ig.avg)} per Instagram order vs ${da(shop.avg)} in the shop.`, { page: 'sales', filters: { channel: 'instagram' } })
  }
  const small = channels.filter((c) => c.orders >= 1 && c.share < 0.03 && c.key !== 'inhouse')
  if (small.length) add('info', `${small.map((c) => label(CHANNEL_LABELS, c.key)).join(', ')} ${small.length === 1 ? 'brings' : 'bring'} almost nothing`, `Under 3% of sales each. Either invest there or drop it.`, { page: 'sales' })

  // Customers
  const atRisk = customers.filter((c) => c.segment === 'risk')
  if (atRisk.length) add('warn', `${atRisk.length} regular ${atRisk.length === 1 ? 'customer has' : 'customers have'} gone quiet`, `They bought ${da(atRisk.reduce((t, c) => t + c.value, 0))} in total but nothing for 46–90 days. A message now can win them back.`, { page: 'customers' })
  if (loyalty.customers >= 20) add(loyalty.repeatRate >= 0.3 ? 'good' : 'info', `${Math.round(loyalty.repeatRate * 100)}% of named customers came back at least once`, `Returning customers bring ${Math.round(loyalty.repeatValueShare * 100)}% of named-customer sales.${loyalty.avgGap ? ` They come back every ${Math.round(loyalty.avgGap)} days on average.` : ''}`, { page: 'customers' })
  if (s.walkInOrders / s.orders > 0.4) add('info', `${pct(s.walkInOrders, s.orders)}% of sales have no customer name`, 'Asking for a phone number at the till lets you see who comes back and invite them again.', { page: 'customers', filters: { customer: 'walk-in' } })

  // Money
  if (receivables.total > 0) {
    const old = receivables.buckets.filter((b) => b.min > 30).reduce((t, b) => t + b.revenue, 0)
    add(old > 0 ? 'bad' : 'warn', `Customers owe you ${da(receivables.total)}`, old > 0 ? `${da(old)} of it is over a month old. Chase those first.` : `${num(receivables.orders.length)} orders are not fully paid.`, { page: 'money' })
  }
  if (bills.total > 0) add('warn', `You owe suppliers ${da(bills.total)}`, `${num(bills.list.length)} purchases are not fully paid.`, { page: 'money' })
  if (money.spent > 0 && s.revenue > 0) add('info', `Running costs took ${pct(money.spent, s.revenue)}% of sales`, `${da(money.spent)} of cash-outs, mostly ${money.byCategory[0]?.label || 'other'}.`, { page: 'money' })

  // Stock
  if (stock.counts.negative) add('bad', `${stock.counts.negative} ${stock.counts.negative === 1 ? 'product shows' : 'products show'} stock below zero`, 'Sales were recorded without stock received. Count them and correct the stock in Blossom.', { page: 'stock' })
  const reorder = stock.rows.filter((r) => r.tracked && r.reorder > 0 && r.daysCover != null && r.daysCover < 3)
  if (reorder.length) add('warn', `Reorder soon: ${reorder.slice(0, 4).map((r) => r.name).join(', ')}`, `${reorder.length === 1 ? 'It runs' : 'They run'} out in under 3 days at the current pace.`, { page: 'stock' })
  if (stock.counts.untracked >= 5) add('info', `${stock.counts.untracked} products have placeholder stock (like 9 999)`, 'Their stock is not really counted, so Bloom cannot warn you before they run out.', { page: 'stock' })
  if (slow.length) add('info', `${slow.length} active products have not sold for 30+ days`, slow.slice(0, 4).map((r) => r.name).join(', ') + '. Promote them, bundle them, or stop buying them.', { page: 'products' })
  if (!stock.lastWasteDay || daysBetween(stock.lastWasteDay, today(now)) > 21) add('info', stock.lastWasteDay ? `No waste recorded since ${stock.lastWasteDay}` : 'No waste recorded yet', 'Logging wilted stems in Blossom shows what spoilage really costs you.', { page: 'stock' })

  // Operations
  if (ops.overdue.length) add('bad', `${ops.overdue.length} ${ops.overdue.length === 1 ? 'order is' : 'orders are'} past the delivery date and not done`, 'Open them on the Operations page.', { page: 'operations' })
  if (ops.cancelRate > 0.05) add('warn', `${Math.round(ops.cancelRate * 100)}% of orders were cancelled`, `${da(ops.cancelledValue)} of sales lost.`, { page: 'operations' })

  // Data quality
  if (anomalies.length) add('bad', `${anomalies.length} supplier ${anomalies.length === 1 ? 'purchase looks' : 'purchases look'} mistyped`, anomalies.slice(0, 2).map((a) => a.text).join(' ') + ' Bloom leaves these out of costs.', { page: 'money' })

  const order = { bad: 0, warn: 1, good: 2, info: 3 }
  return out.sort((a, b) => order[a.tone] - order[b.tone])
}
