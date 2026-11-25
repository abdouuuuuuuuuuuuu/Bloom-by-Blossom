import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '../api/index.js'
import { Button, Field, inputClass } from '../components/ui.jsx'

export default function SignIn() {
  const [identifier, setIdentifier] = useState(() => localStorage.getItem('blossom-mobile-last-user') || '')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api.signIn(identifier, password)
      localStorage.setItem('blossom-mobile-last-user', identifier.trim())
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="pt-safe pb-safe relative flex min-h-full flex-col overflow-hidden">
      <img src="./wallpaper.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-b from-cream/40 via-cream/80 to-cream" />
      <div className="relative flex flex-1 flex-col justify-center px-6 py-10">
        <div className="rise mx-auto w-full max-w-sm">
          <img src="./logo-small.png" alt="Blossom Flower Store" className="mx-auto h-36 w-36 object-contain drop-shadow-sm" />
          <p className="mt-2 text-center text-sm text-muted">Orders, on your phone</p>

          <form onSubmit={submit} className="card mt-8 space-y-4 p-5">
            <Field label="Username or email">
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" required className={inputClass()} />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className={`${inputClass()} pr-12`} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-xl text-muted">
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </Field>
            {error && <p role="alert" className="rounded-2xl bg-rose-soft px-4 py-3 text-sm font-medium text-rose">{error}</p>}
            <Button type="submit" size="lg" busy={busy} className="w-full">Sign in</Button>
          </form>
          <p className="mt-5 text-center text-xs text-muted">Use the same account as Blossom on the shop PC.</p>
        </div>
      </div>
    </div>
  )
}
