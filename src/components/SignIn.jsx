import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { BloomMark } from './BloomMark.jsx'

export function SignIn() {
  const { signIn } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await signIn(identifier, password) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <img src={`${import.meta.env.BASE_URL}wallpaper.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-plum/70 via-plum/10 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <p className="font-display text-5xl leading-tight">Every bouquet,<br />counted with care.</p>
          <p className="mt-4 max-w-md text-white/80">Your month at Blossom: what sold, who bought it and what it brought in.</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="rise w-full max-w-sm">
          <div className="flex items-center gap-3">
            <BloomMark className="h-11 w-11" />
            <div>
              <h1 className="font-display text-3xl text-plum">Bloom</h1>
              <p className="text-sm text-muted">Monthly activity for Blossom</p>
            </div>
          </div>

          <p className="mt-10 text-sm text-muted">Sign in with your Blossom account.</p>
          <label className="mt-5 block text-sm font-medium">Username or email
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required autoFocus
              className="mt-1.5 h-11 w-full rounded-xl border border-line bg-paper px-3.5 outline-none transition focus:border-plum focus:ring-4 focus:ring-plum/10" />
          </label>
          <label className="mt-4 block text-sm font-medium">Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required
              className="mt-1.5 h-11 w-full rounded-xl border border-line bg-paper px-3.5 outline-none transition focus:border-plum focus:ring-4 focus:ring-plum/10" />
          </label>
          {error && <p role="alert" className="mt-4 rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm text-rose">{error}</p>}
          <button disabled={busy}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-plum font-medium text-white shadow-lg shadow-plum/20 transition hover:bg-plum/90 disabled:opacity-60">
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />} Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
