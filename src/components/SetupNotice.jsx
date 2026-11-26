import { Database } from 'lucide-react'
import { Card } from './ui.jsx'
import { useApp } from '../state/AppState.jsx'

/** Shown where a back-office feature needs supabase/bloom-back-office.sql applied first. */
export function SetupNotice({ what }) {
  const { go } = useApp()
  return (
    <Card>
      <div className="flex items-start gap-4 p-2">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-soft text-amber"><Database className="h-5 w-5" /></span>
        <div>
          <h2 className="font-display text-xl text-ink">{what} needs a one-time setup</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Bloom keeps expenses, staff, payroll, attendance and purchase orders in a few new tables. They do not exist yet in your Supabase project.
            Open <b>Settings → Back office setup</b>, copy the SQL and run it once in the Supabase SQL Editor. Nothing in the till changes.
          </p>
          <button onClick={() => go('settings')} className="mt-3 h-9 rounded-xl bg-plum px-4 text-sm font-medium text-white">Open the setup</button>
        </div>
      </div>
    </Card>
  )
}
