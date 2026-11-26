import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'

export function Toast() {
  const { toast } = useApp()
  if (!toast) return null
  const Icon = toast.tone === 'rose' ? AlertTriangle : CheckCircle2
  return (
    <div role="status" aria-live="polite" key={toast.id}
      className="no-print fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-2xl"
      style={{ animation: 'rise 320ms cubic-bezier(.2,.8,.2,1) both' }}>
      <Icon className={`h-4 w-4 ${toast.tone === 'rose' ? 'text-rose' : 'text-[#8fd1ad]'}`} /> {toast.text}
    </div>
  )
}
