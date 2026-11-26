import { useMemo, useState } from 'react'
import { Users, Wallet, HandCoins, CalendarDays, Plus, Pencil, ChevronLeft, ChevronRight, XCircle, Lock } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Stat, Pill, Segmented, Empty } from '../components/ui.jsx'
import { DataTable } from '../components/DataTable.jsx'
import { Dialog, Field, Input, Textarea, Money, Select, Button, Toggle, Confirm, useDialog } from '../components/Form.jsx'
import { SetupNotice } from '../components/SetupNotice.jsx'
import * as A from '../data/actions.js'
import { payroll, employedIn, attendanceSummary, ATTENDANCE, PAY_KINDS, METHODS, METHOD_LABEL } from '../model/backoffice.js'
import { da, num } from '../lib/format.js'
import { currentMonth, daysInMonth, monthLabel, shiftMonth, today, weekdayOf, WEEKDAYS, dayLabel } from '../lib/time.js'

export default function Staff() {
  const { bo, setupNeeded, restricted, saved } = useApp()
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [month, setMonth] = useState(currentMonth())
  const [tab, setTab] = useState('pay')
  const dlg = useDialog()
  const sheet = useMemo(() => payroll(bo, month), [bo, month])

  const notOnPayroll = bo.team.filter((t) => !t.onPayroll)
  if (setupNeeded) {
    return (
      <>
        <PageHeader title="Staff & payroll" subtitle="Your team, what they earn, what they were paid, who came in" />
        <div className="mb-4"><SetupNotice what="Payroll and attendance" /></div>
        <TeamFromBlossom team={bo.team} />
      </>
    )
  }
  const payHidden = restricted.includes('staffPayments')

  return (
    <>
      <PageHeader title="Staff & payroll" subtitle="Your team, what they earn, what they were paid, who came in">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-xl border border-line bg-paper p-0.5 shadow-sm">
            <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-plum-soft hover:text-plum"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-36 text-center font-display text-[15px]">{monthLabel(month)}</span>
            <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-plum-soft hover:text-plum disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <Button variant="outline" icon={Plus} onClick={() => dlg.open('person', {})}>Add a person</Button>
          {isOwner && <Button icon={HandCoins} onClick={() => dlg.open('pay', { month })} disabled={!bo.staff.some((s) => s.active)}>Record a payment</Button>}
        </div>
      </PageHeader>

      {payHidden && <p className="mb-4 flex items-center gap-2 rounded-2xl border border-amber/30 bg-amber-soft/70 p-3 text-sm text-amber"><Lock className="h-4 w-4" /> Salaries and payments are visible to owner accounts only.</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={Users} label="On the payroll" value={num(sheet.rows.length)}>{monthLabel(month)}</Stat>
        <Stat icon={Wallet} tone="plum" label="Earned this month" value={payHidden ? '—' : da(sheet.earned)} info="Monthly salary + bonuses − deductions, for everyone employed that month." />
        <Stat icon={HandCoins} tone="sage" label="Already handed over" value={payHidden ? '—' : da(sheet.handed)} info="Advances and salary payments recorded for this month." />
        <Stat icon={HandCoins} tone="rose" label="Still to pay" value={payHidden ? '—' : da(sheet.owed)}>{sheet.overpaid ? `${da(sheet.overpaid)} paid ahead` : ''}</Stat>
      </div>

      {notOnPayroll.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-plum/20 bg-plum-soft/60 p-3 text-sm">
          <span className="text-ink"><b>{notOnPayroll.length}</b> {notOnPayroll.length === 1 ? 'person' : 'people'} from your Blossom team {notOnPayroll.length === 1 ? 'is' : 'are'} not on the payroll yet: {notOnPayroll.map((t) => t.name).join(', ')}</span>
          <Button icon={Plus} onClick={() => dlg.open('import', {})}>Add them</Button>
        </div>
      )}

      <div className="mb-4"><Segmented label="View" value={tab} onChange={setTab} options={[['pay', 'Pay sheet'], ['attendance', 'Attendance'], ['team', 'Team'], ['payments', 'Payments']]} /></div>

      {tab === 'pay' && (
        <Card title={`Pay sheet · ${monthLabel(month)}`} hint="Click a person to pay them">
          <DataTable rows={sheet.rows} onRowClick={isOwner ? (r) => dlg.open('pay', { month, staffId: r.id, amount: Math.max(r.owed, 0) }) : undefined} exportName={`bloom-payroll-${month}`}
            empty="No one on the payroll this month. Add your team in the Team tab."
            columns={[
              { key: 'name', label: 'Person', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.jobTitle}</p></> },
              { key: 'worked', label: 'Days worked', align: 'right', sort: (r) => r.attendance.worked, render: (r) => (r.attendance.marked ? <span title={`${r.attendance.absent} absent · ${r.attendance.leave} leave`}>{num(r.attendance.worked)}{r.attendance.absent ? <span className="ml-1 text-xs text-rose">({r.attendance.absent} absent)</span> : ''}</span> : <span className="text-muted">not marked</span>), csv: (r) => r.attendance.worked },
              { key: 'salary', label: 'Salary', align: 'right', render: (r) => da(r.salary) },
              { key: 'bonus', label: 'Bonus', align: 'right', render: (r) => (r.bonus ? <span className="text-sage">+{da(r.bonus)}</span> : '—') },
              { key: 'deduction', label: 'Deducted', align: 'right', render: (r) => (r.deduction ? <span className="text-rose">−{da(r.deduction)}</span> : '—') },
              { key: 'advance', label: 'Advances', align: 'right', render: (r) => (r.advance ? da(r.advance) : '—') },
              { key: 'paid', label: 'Paid', align: 'right', render: (r) => (r.paid ? da(r.paid) : '—') },
              { key: 'owed', label: 'Still to pay', align: 'right', render: (r) => (r.owed > 0 ? <span className="font-medium text-rose">{da(r.owed)}</span> : r.owed < 0 ? <Pill tone="amber">{da(-r.owed)} ahead</Pill> : <Pill tone="sage">Paid</Pill>) },
            ]} />
          <p className="mt-3 text-xs text-muted">Absences do not cut the salary automatically. To take a day off the pay, add a deduction (one day ≈ salary ÷ 26).</p>
        </Card>
      )}

      {tab === 'attendance' && <Attendance month={month} />}

      {tab === 'team' && (
        <Card title="Team" hint="Everyone you pay, with or without a Blossom login">
          <DataTable rows={bo.staff.map((s) => ({ ...s, muted: !s.active }))} onRowClick={(s) => dlg.open('person', s.raw)} exportName="bloom-team" search={(s) => `${s.name} ${s.jobTitle} ${s.phone}`}
            empty="No one yet. Add the people you pay."
            columns={[
              { key: 'name', label: 'Name', render: (s) => <><p className="font-medium">{s.name}</p><p className="text-xs text-muted">{s.jobTitle}</p></> },
              { key: 'phone', label: 'Phone' },
              { key: 'login', label: 'Blossom login', render: (s) => s.login || <span className="text-muted">—</span> },
              { key: 'startedOn', label: 'Started', render: (s) => (s.startedOn ? dayLabel(s.startedOn, { day: 'numeric', month: 'short', year: 'numeric' }) : '—') },
              { key: 'salary', label: 'Monthly salary', align: 'right', render: (s) => (payHidden ? '—' : da(s.salary)) },
              { key: 'active', label: 'Status', render: (s) => <Pill tone={s.active ? 'sage' : 'muted'}>{s.active ? 'Active' : 'Left'}</Pill>, csv: (s) => (s.active ? 'Active' : 'Left') },
            ]} />
        </Card>
      )}

      {tab === 'payments' && (
        <Card title="Payments" hint={`For ${monthLabel(month)}`}>
          <DataTable rows={bo.staffPayments.filter((p) => p.month === month).map((p) => ({ ...p, name: bo.staff.find((s) => s.id === p.staffId)?.name || '—' }))}
            exportName={`bloom-staff-payments-${month}`} initialSort={{ key: 'day', dir: 'desc' }} empty="No payments recorded for this month."
            columns={[
              { key: 'day', label: 'Paid on', render: (p) => dayLabel(p.day, { day: 'numeric', month: 'short' }) },
              { key: 'name', label: 'Person' },
              { key: 'kind', label: 'Type', render: (p) => <Pill tone={PAY_KINDS[p.kind].tone}>{PAY_KINDS[p.kind].label}</Pill>, csv: (p) => PAY_KINDS[p.kind].label },
              { key: 'method', label: 'How', render: (p) => (p.kind === 'deduction' ? '—' : `${METHOD_LABEL[p.method] || p.method}${p.fromRegister ? ' · from the till' : ''}`) },
              { key: 'notes', label: 'Note' },
              { key: 'amount', label: 'Amount', align: 'right', render: (p) => da(p.amount) },
              { key: 'x', label: '', sortable: false, csv: false, render: (p) => (isOwner ? <button onClick={() => dlg.open('voidPay', p)} aria-label="Cancel payment" className="rounded-lg p-1 text-muted hover:bg-rose-soft hover:text-rose"><XCircle className="h-4 w-4" /></button> : null) },
            ]} />
        </Card>
      )}

      {dlg.is('person') && <PersonDialog data={dlg.state.data} onClose={dlg.close} />}
      {dlg.is('import') && <ImportDialog people={notOnPayroll} onClose={dlg.close} />}
      {dlg.is('pay') && <PayDialog data={dlg.state.data} onClose={dlg.close} />}
      {dlg.is('voidPay') && <Confirm title="Cancel this payment?" askReason="Why?" confirmLabel="Cancel payment" onClose={dlg.close}
        onConfirm={async (reason) => { await A.voidStaffPayment(dlg.state.data.id, reason); await saved('Payment cancelled') }}>
        {PAY_KINDS[dlg.state.data.kind].label} of {da(dlg.state.data.amount)} to {dlg.state.data.name}.
      </Confirm>}
    </>
  )
}

function Attendance({ month }) {
  const { bo, saved, notify } = useApp()
  const [busy, setBusy] = useState(null)
  const people = bo.staff.filter((s) => employedIn(s, month))
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
  const order = [null, 'present', 'half', 'absent', 'leave', 'off']

  const cycle = async (staffId, day) => {
    const cur = bo.attendance.get(`${staffId}|${day}`)?.status ?? null
    const next = order[(order.indexOf(cur) + 1) % order.length]
    setBusy(`${staffId}|${day}`)
    try { await A.setAttendance(staffId, day, next); await saved(next ? `${ATTENDANCE[next].label} · ${dayLabel(day, { day: 'numeric', month: 'short' })}` : 'Day cleared') } catch (err) { notify(err.message, 'rose') } finally { setBusy(null) }
  }
  const markAllPresent = async (day) => {
    setBusy(day)
    try {
      for (const p of people) if (!bo.attendance.get(`${p.id}|${day}`)) await A.setAttendance(p.id, day, 'present')
      await saved(`Everyone present · ${dayLabel(day, { day: 'numeric', month: 'short' })}`)
    } catch (err) { notify(err.message, 'rose') } finally { setBusy(null) }
  }

  if (!people.length) return <Card><Empty title="No one on the payroll this month">Add your team in the Team tab first.</Empty></Card>
  return (
    <Card title={`Attendance · ${monthLabel(month)}`} hint="Click a box to change it: Present → Half day → Absent → Paid leave → Day off → empty. Click a date to mark everyone present.">
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-paper pr-3 text-left font-medium text-muted">Person</th>
              {days.map((d) => (
                <th key={d} className="px-0.5 pb-1 font-normal">
                  <button disabled={d > today() || busy} onClick={() => markAllPresent(d)} title="Mark everyone present"
                    className={`flex w-7 flex-col items-center rounded-md py-0.5 hover:bg-plum-soft disabled:opacity-40 ${d === today() ? 'bg-plum-soft text-plum' : weekdayOf(d) === 4 ? 'text-rose' : 'text-muted'}`}>
                    <span>{WEEKDAYS[weekdayOf(d)][0]}</span><span className="font-medium text-ink">{Number(d.slice(8))}</span>
                  </button>
                </th>
              ))}
              <th className="pl-3 text-right font-medium text-muted">Worked</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              return (
                <tr key={p.id}>
                  <td className="sticky left-0 whitespace-nowrap bg-paper py-1 pr-3 text-sm text-ink">{p.name}</td>
                  {days.map((d) => {
                    const a = bo.attendance.get(`${p.id}|${d}`)
                    const meta = a ? ATTENDANCE[a.status] : null
                    const tones = { sage: 'bg-sage-soft text-sage', amber: 'bg-amber-soft text-amber', rose: 'bg-rose-soft text-rose', sky: 'bg-sky-soft text-sky', muted: 'bg-[#f2edf3] text-muted' }
                    return (
                      <td key={d} className="px-0.5 py-1">
                        <button disabled={d > today() || busy === `${p.id}|${d}`} onClick={() => cycle(p.id, d)} title={`${p.name}, ${dayLabel(d)}: ${meta ? meta.label : 'not marked'}`}
                          className={`grid h-7 w-7 place-items-center rounded-md border text-[11px] font-semibold transition disabled:opacity-30 ${meta ? `${tones[meta.tone]} border-transparent` : 'border-dashed border-line text-transparent hover:border-plum'}`}>
                          {meta ? meta.short : '·'}
                        </button>
                      </td>
                    )
                  })}
                  <td className="tabular pl-3 text-right text-sm">{num(attendanceSummary(bo, p.id, month).worked)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        {Object.entries(ATTENDANCE).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1"><Pill tone={v.tone}>{v.short}</Pill>{v.label}</span>)}
      </div>
    </Card>
  )
}

const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', florist: 'Florist', cashier: 'Cashier', delivery: 'Courier', courier: 'Courier' }
const roleLabel = (r) => ROLE_LABEL[r] || (r ? r[0].toUpperCase() + r.slice(1) : '')

/** The team as Blossom knows it (logins), shown even before the payroll is set up. */
function TeamFromBlossom({ team }) {
  return (
    <Card title="Your team in Blossom" hint="Everyone with an active Blossom login. Run the setup above to add salaries, advances and attendance.">
      <DataTable rows={team} exportName="bloom-blossom-team" empty="No active Blossom logins found." columns={[
        { key: 'name', label: 'Name', render: (t) => <span className="font-medium">{t.name}</span> },
        { key: 'username', label: 'Username' },
        { key: 'role', label: 'Role', render: (t) => <Pill tone="plum">{roleLabel(t.role)}</Pill>, csv: (t) => roleLabel(t.role) },
      ]} />
    </Card>
  )
}

/** Put Blossom logins on the payroll in one go, with their salary. */
function ImportDialog({ people, onClose }) {
  const { saved } = useApp()
  const { profile } = useAuth()
  const [rows, setRows] = useState(() => people.map((p) => ({ ...p, pick: p.role !== 'owner', salary: '' })))
  const set = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const chosen = rows.filter((r) => r.pick)
  return (
    <Dialog wide title="Add your Blossom team to the payroll" subtitle="Tick who you pay. The salary can be filled in later." submitLabel={`Add ${chosen.length}`} disabled={!chosen.length} onClose={onClose}
      onSubmit={async () => {
        for (const r of chosen) await A.saveStaff({ full_name: r.name, job_title: roleLabel(r.role), profile_id: r.id, monthly_salary: r.salary || 0, started_on: null })
        onClose(); await saved(`${chosen.length} added to the payroll`)
      }}>
      <ul className="divide-y divide-line/60">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <input type="checkbox" checked={r.pick} onChange={(e) => set(r.id, { pick: e.target.checked })} aria-label={`Add ${r.name}`} className="h-4 w-4 accent-[#462c7d]" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{r.name}</span><span className="text-xs text-muted">{roleLabel(r.role)}{r.username ? ` · ${r.username}` : ''}</span></span>
            {profile?.role === 'owner' && <span className="w-40"><Money aria-label={`Monthly salary of ${r.name}`} value={r.salary} onChange={(v) => set(r.id, { salary: v })} placeholder="Monthly salary" disabled={!r.pick} /></span>}
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

function PersonDialog({ data, onClose }) {
  const { saved, ds } = useApp()
  const { profile } = useAuth()
  const [f, setF] = useState({ full_name: '', job_title: '', phone: '', profile_id: '', monthly_salary: '', started_on: '', ended_on: '', is_active: true, notes: '', ...data, monthly_salary: data?.monthly_salary != null ? String(data.monthly_salary) : '' })
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }))
  const logins = [...ds.staffName.entries()].map(([id, name]) => [id, name])
  return (
    <Dialog title={f.id ? `Edit ${f.full_name}` : 'Add a person'} onClose={onClose}
      onSubmit={async () => { await A.saveStaff(f); onClose(); await saved(f.id ? 'Saved' : `${f.full_name} added`) }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name" className="col-span-2"><Input value={f.full_name} onChange={set('full_name')} required maxLength={100} /></Field>
        <Field label="Job"><Input value={f.job_title} onChange={set('job_title')} placeholder="Florist, courier…" maxLength={60} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} inputMode="tel" maxLength={30} /></Field>
        {profile?.role === 'owner' && <Field label="Monthly salary"><Money value={f.monthly_salary} onChange={set('monthly_salary')} /></Field>}
        <Field label="Blossom login (optional)"><Select value={f.profile_id || ''} onChange={set('profile_id')} placeholder="None" options={logins} /></Field>
        <Field label="Started on"><Input type="date" value={f.started_on || ''} onChange={set('started_on')} /></Field>
        <Field label="Left on" hint="Leave empty while they work here"><Input type="date" value={f.ended_on || ''} onChange={(e) => setF((x) => ({ ...x, ended_on: e.target.value, is_active: !e.target.value || e.target.value >= today() }))} /></Field>
      </div>
      <Field label="Notes"><Textarea value={f.notes} onChange={set('notes')} maxLength={500} /></Field>
      {f.id && <Toggle checked={f.is_active} onChange={set('is_active')} label="Still works here" hint="People who left stay in past pay sheets." />}
    </Dialog>
  )
}

function PayDialog({ data, onClose }) {
  const { bo, saved } = useApp()
  const people = bo.staff.filter((s) => s.active || s.id === data?.staffId)
  const [f, setF] = useState({ staffId: data?.staffId ?? '', kind: 'salary', month: data?.month || currentMonth(), amount: data?.amount ? String(Math.round(data.amount)) : '', day: today(), method: 'cash', fromRegister: false, notes: '' })
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }))
  const row = payroll(bo, f.month).rows.find((r) => r.id === Number(f.staffId))
  const months = [0, -1, -2, 1].map((n) => shiftMonth(currentMonth(), n)).sort().reverse()
  return (
    <Dialog title="Record a payment" submitLabel={f.amount ? `Save ${da(f.amount)}` : 'Save'} tone={f.kind === 'deduction' ? 'rose' : 'sage'} disabled={!f.staffId || !(Number(f.amount) > 0)} onClose={onClose}
      onSubmit={async () => { await A.saveStaffPayment({ ...f, staffId: Number(f.staffId) }); onClose(); await saved(`${PAY_KINDS[f.kind].label} of ${da(f.amount)} saved`) }}>
      <Field label="Person"><Select value={f.staffId} onChange={set('staffId')} placeholder="Choose" options={people.map((s) => [s.id, s.name])} /></Field>
      <Field label="Type">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-plum-soft/60 p-1">
          {Object.entries(PAY_KINDS).map(([k, v]) => (
            <button type="button" key={k} onClick={() => set('kind')(k)} aria-pressed={f.kind === k}
              className={`rounded-lg py-1.5 text-sm font-medium ${f.kind === k ? 'bg-paper text-plum shadow-sm' : 'text-muted'}`}>{v.label}</button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount"><Money value={f.amount} onChange={set('amount')} /></Field>
        <Field label="For the month of"><Select value={f.month} onChange={set('month')} options={months.map((m) => [m, monthLabel(m)])} /></Field>
      </div>
      {row && <p className="-mt-2 text-xs text-muted">{monthLabel(f.month)}: earned {da(row.earned)}, already handed {da(row.handed)}, <span className={row.owed > 0 ? 'text-rose' : ''}>still to pay {da(Math.max(row.owed, 0))}</span>{row.owed > 0 && f.kind === 'salary' && <button type="button" onClick={() => set('amount')(String(Math.round(row.owed)))} className="ml-2 font-medium text-plum hover:underline">pay the rest</button>}</p>}
      {f.kind !== 'deduction' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid on"><Input type="date" value={f.day} max={today()} onChange={set('day')} /></Field>
            <Field label="How"><Select value={f.method} onChange={set('method')} options={METHODS} /></Field>
          </div>
          <Toggle checked={f.fromRegister} onChange={set('fromRegister')} label="This cash was taken from the till" hint="Tick it if it is already a cash-out in Blossom, so Accounting does not count it twice." />
        </>
      )}
      <Field label="Note (optional)"><Input value={f.notes} onChange={set('notes')} placeholder={f.kind === 'deduction' ? 'e.g. 2 days absent' : ''} maxLength={300} /></Field>
    </Dialog>
  )
}
