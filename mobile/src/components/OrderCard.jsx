import { Bike, Package, Store, Truck, Clock } from 'lucide-react'
import { Pill } from './ui.jsx'
import { da } from '../lib/format.js'
import { PAY_STATUS } from '../lib/labels.js'
import { relativeDay, shortTime, formatTime } from '../lib/time.js'
import { dueDay, isCancelled, isDelivery, isQuick, itemSummary, stage, urgency } from '../lib/orders.js'
import { navigate } from '../state/app.jsx'

const STAGE_TONE = { new: 'plum', preparing: 'amber', courier: 'sky', delivered: 'sage', done: 'sage', cancelled: 'rose' }
const URGENCY = { late: { text: 'Late', tone: 'rose' }, today: { text: 'Today', tone: 'solid' }, tomorrow: { text: 'Tomorrow', tone: 'plum' } }

export function FulfilmentIcon({ order, className = 'h-4 w-4' }) {
  if (isQuick(order)) return <Store className={className} aria-hidden="true" />
  if (order.delivery_method === 'dhd') return <Truck className={className} aria-hidden="true" />
  if (isDelivery(order)) return <Bike className={className} aria-hidden="true" />
  return <Package className={className} aria-hidden="true" />
}

export function OrderCard({ order: o, showDay = true }) {
  const s = stage(o)
  const u = urgency(o)
  const pay = PAY_STATUS[o.payment_status]
  const when = isQuick(o)
    ? `Sold ${formatTime(o.created_at)}`
    : `${showDay ? relativeDay(dueDay(o)) : ''}${o.delivery_time ? `${showDay ? ' · ' : ''}${shortTime(o.delivery_time)}` : ''}` || (showDay ? 'No date' : '')
  return (
    <button onClick={() => navigate(`orders/${o.id}`)}
      className={`press card w-full p-4 text-left ${isCancelled(o) ? 'opacity-60' : ''} ${u === 'late' ? 'ring-1 ring-rose/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted">
            <span className="tabular">#{o.order_number}</span>
            {u && URGENCY[u] && <Pill tone={URGENCY[u].tone}>{URGENCY[u].text}</Pill>}
          </p>
          <p className="mt-1 truncate text-[17px] font-semibold text-ink">{isQuick(o) && /walk-?in/i.test(o.client_name || '') ? 'Counter sale' : o.client_name || 'Customer'}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-[17px] font-semibold text-ink">{da(o.total_amount)}</p>
          {Number(o.amount_due) > 0 && !isCancelled(o)
            ? <p className="tabular text-xs font-semibold text-rose">owes {da(o.amount_due)}</p>
            : pay && <p className="text-xs text-muted">{pay.label}</p>}
        </div>
      </div>
      {o.items?.length > 0 && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{itemSummary(o)}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Pill tone={STAGE_TONE[s.key]}>{s.label}</Pill>
        <span className="inline-flex items-center gap-1"><FulfilmentIcon order={o} className="h-3.5 w-3.5" />{isDelivery(o) ? o.delivery_city || o.delivery_wilaya || 'Delivery' : isQuick(o) ? 'Counter' : 'Pickup'}</span>
        {when && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{when}</span>}
      </div>
    </button>
  )
}
