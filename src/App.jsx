import { lazy, Suspense } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import { SignIn } from './components/SignIn.jsx'
import { BloomMark } from './components/BloomMark.jsx'
import { Shell } from './components/Shell.jsx'
import { DrawerHost } from './components/Drawers.jsx'
import { Skeleton } from './components/ui.jsx'
import { AppStateProvider, useApp } from './state/AppState.jsx'
import Overview from './pages/Overview.jsx'
import { Toast } from './components/Toast.jsx'

const PAGES = {
  overview: Overview,
  sales: lazy(() => import('./pages/Sales.jsx')),
  products: lazy(() => import('./pages/Products.jsx')),
  customers: lazy(() => import('./pages/Customers.jsx')),
  money: lazy(() => import('./pages/Money.jsx')),
  operations: lazy(() => import('./pages/Operations.jsx')),
  stock: lazy(() => import('./pages/Stock.jsx')),
  orders: lazy(() => import('./pages/Orders.jsx')),
  journal: lazy(() => import('./pages/Journal.jsx')),
  purchasing: lazy(() => import('./pages/Purchasing.jsx')),
  accounting: lazy(() => import('./pages/Accounting.jsx')),
  staff: lazy(() => import('./pages/Staff.jsx')),
  settings: lazy(() => import('./pages/Settings.jsx')),
}

export default function App() {
  const auth = useAuth()
  if (auth.status === 'loading') return <Splash />
  if (auth.status === 'signed-out') return <SignIn />
  if (auth.status !== 'ready') return <Blocked status={auth.status} onSignOut={auth.signOut} />
  return (
    <AppStateProvider>
      <Shell><Page /></Shell>
      <DrawerHost />
      <Toast />
    </AppStateProvider>
  )
}

function Page() {
  const { ds, page, status, refresh } = useApp()
  if (!ds) {
    if (status.error) {
      return (
        <div className="card mx-auto mt-16 max-w-md p-8 text-center">
          <BloomMark className="mx-auto h-12 w-12 opacity-70" />
          <h1 className="mt-4 font-display text-2xl text-ink">Could not reach Blossom's data</h1>
          <p className="mt-2 text-sm text-muted">{status.error}. Check the internet connection.</p>
          <button onClick={refresh} className="mt-6 h-10 rounded-xl bg-plum px-5 text-sm font-medium text-white">Try again</button>
        </div>
      )
    }
    return <Loading />
  }
  const Current = PAGES[page] || Overview
  return <Suspense fallback={<Loading />}><Current key={page} /></Suspense>
}

function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-12 w-72" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-72" />
      <p className="text-center text-sm text-muted">Gathering every order, purchase and cash entry…</p>
    </div>
  )
}

function Splash() {
  return <div className="grid h-screen place-items-center"><BloomMark className="h-14 w-14 animate-pulse" /></div>
}

function Blocked({ status, onSignOut }) {
  return (
    <div className="grid h-screen place-items-center p-6">
      <div className="card rise max-w-sm p-8 text-center">
        <BloomMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 font-display text-2xl text-plum">{status === 'forbidden' ? 'Owners and managers only' : 'Could not load your account'}</h1>
        <p className="mt-2 text-sm text-muted">
          {status === 'forbidden' ? 'Bloom shows the whole shop’s money, so it opens for owner and manager accounts.' : 'Check your connection, then sign in again.'}
        </p>
        <button onClick={onSignOut} className="mt-6 h-10 rounded-xl bg-plum px-5 text-sm font-medium text-white">Sign out</button>
      </div>
    </div>
  )
}
