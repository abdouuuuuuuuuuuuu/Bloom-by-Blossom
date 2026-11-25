import { useEffect, useState } from 'react'
import { LogOut, Share, SquarePlus, Store, RefreshCw, ShieldCheck } from 'lucide-react'
import { useApp } from '../state/app.jsx'
import { Screen, Section, Button } from '../components/ui.jsx'
import { ROLE_LABELS } from '../lib/labels.js'
import { can } from '../lib/permissions.js'

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

export default function Me() {
  const { profile, role, shop, signOut, sync, refresh } = useApp()
  const [installPrompt, setInstallPrompt] = useState(() => window.__blossomInstallPrompt || null)
  const [installed, setInstalled] = useState(isStandalone)
  const rights = can(role)

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); window.__blossomInstallPrompt = e; setInstallPrompt(e) }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  const install = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  return (
    <Screen title="Me">
      <div className="card rise mb-5 flex items-center gap-4 p-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-plum text-xl font-semibold text-white">{(profile?.full_name || '?').slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="truncate font-display text-xl text-ink">{profile?.full_name}</p>
          <p className="text-sm text-muted">{ROLE_LABELS[role] || role}{profile?.username ? ` · @${profile.username}` : ''}</p>
        </div>
      </div>

      {!installed && (
        <Section title="Put Blossom on your home screen">
          <div className="card p-4 text-sm text-ink">
            {installPrompt ? (
              <Button icon={SquarePlus} className="w-full" onClick={install}>Install Blossom</Button>
            ) : isIOS ? (
              <ol className="space-y-2">
                <li className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-plum-soft text-xs font-bold text-plum">1</span> In Safari, tap <Share className="inline h-4 w-4 text-plum" /> Share.</li>
                <li className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-plum-soft text-xs font-bold text-plum">2</span> Choose <strong>Add to Home Screen</strong>.</li>
              </ol>
            ) : (
              <p>In Chrome, open the ⋮ menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
            )}
            <p className="mt-3 text-xs text-muted">It then opens full screen like an app, with the Blossom icon.</p>
          </div>
        </Section>
      )}

      <Section title="What you can do here">
        <ul className="card divide-y divide-line/70 text-sm">
          <Item ok={rights.create} text="Take new orders and counter sales" />
          <Item ok={rights.status} text="Move orders through preparing and done" />
          <Item ok={rights.deliver} text="Hand deliveries to the courier, mark them delivered" />
          <Item ok={rights.payment} text="Record payments" />
          <Item ok={rights.cancel} text="Cancel orders" />
        </ul>
        <p className="mt-2 px-1 text-xs text-muted">Stock, the cash register, suppliers, printing and reports stay on the shop PC.</p>
      </Section>

      <Section title="Shop">
        <div className="card divide-y divide-line/70 text-sm">
          <div className="flex items-center gap-3 px-4 py-3"><Store className="h-5 w-5 text-plum" /><span className="flex-1">{shop}</span></div>
          <button onClick={() => refresh({ products: true })} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-cream">
            <RefreshCw className={`h-5 w-5 text-plum ${sync.loading ? 'animate-spin' : ''}`} />
            <span className="flex-1">Refresh orders and products</span>
            {sync.at && <span className="text-xs text-muted">{sync.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          </button>
        </div>
      </Section>

      <Button variant="danger" size="lg" icon={LogOut} className="w-full" onClick={signOut}>Sign out</Button>
      <p className="mt-6 flex items-center justify-center gap-1 text-center text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5" /> Blossom Mobile 1.0 · same account and data as the shop PC</p>
    </Screen>
  )
}

function Item({ ok, text }) {
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${ok ? 'text-ink' : 'text-muted line-through decoration-muted/40'}`}>
      <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${ok ? 'bg-sage-soft text-sage' : 'bg-[#f2edf3] text-muted'}`}>{ok ? '✓' : '–'}</span>{text}
    </li>
  )
}
