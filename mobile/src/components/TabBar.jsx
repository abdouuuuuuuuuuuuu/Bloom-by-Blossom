import { CalendarDays, ClipboardList, Plus, UserRound } from 'lucide-react'
import { useApp, navigate } from '../state/app.jsx'
import { can } from '../lib/permissions.js'
import { isOpen, urgency } from '../lib/orders.js'

export function TabBar() {
  const { route, role, orders } = useApp()
  const late = (orders || []).filter((o) => isOpen(o) && urgency(o) === 'late').length
  const tabs = [
    { id: 'today', label: 'Today', icon: CalendarDays, badge: late },
    { id: 'orders', label: 'Orders', icon: ClipboardList },
    ...(can(role).create ? [{ id: 'new', label: 'New', icon: Plus, primary: true }] : []),
    { id: 'me', label: 'Me', icon: UserRound },
  ]
  const current = route.name || 'today'
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-paper/92 backdrop-blur-xl">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1.5">
        {tabs.map(({ id, label, icon: Icon, badge, primary }) => {
          const on = current === id || (id === 'orders' && current === 'orders')
          return (
            <li key={id} className="flex-1">
              <button onClick={() => navigate(id)} aria-current={on ? 'page' : undefined}
                className="press relative flex w-full flex-col items-center gap-0.5 pb-1.5 pt-1 text-[11px] font-semibold">
                {primary ? (
                  <span className={`grid h-11 w-11 -translate-y-1 place-items-center rounded-2xl shadow-lg ${on ? 'bg-plum-2' : 'bg-plum'} text-white shadow-plum/30`}><Icon className="h-6 w-6" /></span>
                ) : (
                  <span className={`grid h-8 w-14 place-items-center rounded-full transition ${on ? 'bg-plum-soft text-plum' : 'text-muted'}`}><Icon className="h-[22px] w-[22px]" /></span>
                )}
                <span className={primary ? '-mt-1 text-plum' : on ? 'text-plum' : 'text-muted'}>{label}</span>
                {badge > 0 && <span className="absolute right-[calc(50%-24px)] top-0 grid h-5 min-w-5 place-items-center rounded-full bg-rose px-1 text-[10px] font-bold text-white">{badge}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
