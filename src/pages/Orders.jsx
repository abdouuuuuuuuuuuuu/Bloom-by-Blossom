import { useMemo, useState } from 'react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Pill, Segmented } from '../components/ui.jsx'
import { DataTable } from '../components/DataTable.jsx'
import { da, num } from '../lib/format.js'
import { CHANNEL_LABELS, PAYMENT_LABELS, PAY_STATUS_LABELS, STATUS_LABELS, TYPE_LABELS, label } from '../lib/labels.js'
import { formatDateTime } from '../lib/time.js'

const STATUS_TONE = { done: 'sage', processing: 'amber', new: 'plum', cancelled: 'rose' }
const PAY_TONE = { paid: 'sage', partial: 'amber', unpaid: 'rose', refunded: 'muted' }

export default function Orders() {
  const { sel, period, open } = useApp()
  const [view, setView] = useState('sales')
  const rows = useMemo(() => {
    const list = sel.orders.map((o) => ({ ...o, key: o.id, muted: !o.counted }))
    if (view === 'sales') return list.filter((o) => o.counted)
    if (view === 'unpaid') return list.filter((o) => o.counted && o.due > 0)
    if (view === 'cancelled') return list.filter((o) => !o.counted)
    if (view === 'discount') return list.filter((o) => o.discount > 0)
    return list
  }, [sel, view])
  const counts = {
    sales: sel.counted.length,
    unpaid: sel.counted.filter((o) => o.due > 0).length,
    discount: sel.orders.filter((o) => o.discount > 0).length,
    cancelled: sel.orders.length - sel.counted.length,
    all: sel.orders.length,
  }

  return (
    <>
      <PageHeader title="Orders" subtitle={`${period.label} · every order, searchable. Click one for its items and payments.`} />
      <Card>
        <DataTable rows={rows} onRowClick={(o) => open('order', o.id)} exportName={`bloom-orders-${period.start}`} pageSize={30} initialSort={{ key: 'number', dir: 'desc' }}
          search={(o) => `${o.number} ${o.clientName} ${o.clientPhone} ${o.items.map((i) => i.name).join(' ')} ${o.staff} ${o.notes}`}
          toolbar={<Segmented label="Show" value={view} onChange={setView} options={[['sales', `Sales ${counts.sales}`], ['unpaid', `Not paid ${counts.unpaid}`], ['discount', `Discounted ${counts.discount}`], ['cancelled', `Cancelled ${counts.cancelled}`], ['all', `All ${counts.all}`]]} />}
          columns={[
            { key: 'number', label: 'Order', sort: (o) => o.at, csv: (o) => o.number, render: (o) => <><p className="font-medium">#{o.number}</p><p className="text-xs text-muted">{formatDateTime(o.at)} · {label(TYPE_LABELS, o.type)}</p></> },
            { key: 'clientName', label: 'Customer', render: (o) => <><p className="truncate">{o.clientName || 'Walk-in'}</p><p className="text-xs text-muted">{label(CHANNEL_LABELS, o.channel)} · {label(PAYMENT_LABELS, o.payment)}</p></> },
            { key: 'items', label: 'Items', sortable: false, csv: (o) => o.items.map((i) => `${i.qty}x ${i.name}`).join(', '), render: (o) => <span className="line-clamp-2 max-w-xs text-xs text-muted">{o.items.map((i) => `${num(i.qty)}× ${i.name}`).join(', ')}</span> },
            { key: 'staff', label: 'By' },
            { key: 'status', label: 'Status', csv: (o) => `${o.status} / ${o.payStatus}`, render: (o) => <div className="flex flex-wrap gap-1"><Pill tone={STATUS_TONE[o.status]}>{label(STATUS_LABELS, o.status)}</Pill><Pill tone={PAY_TONE[o.payStatus]}>{label(PAY_STATUS_LABELS, o.payStatus)}</Pill></div> },
            { key: 'value', label: 'Total', align: 'right', render: (o) => <>{da(o.value)}{o.due > 0 && o.counted && <p className="text-[11px] text-amber">owes {da(o.due)}</p>}{o.discount > 0 && <p className="text-[11px] text-muted">−{da(o.discount)} off</p>}</> },
          ]} />
      </Card>
    </>
  )
}
