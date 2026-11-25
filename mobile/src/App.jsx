import { useEffect } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useApp, navigate } from './state/app.jsx'
import { TabBar } from './components/TabBar.jsx'
import { Toast, Button } from './components/ui.jsx'
import { can } from './lib/permissions.js'
import SignIn from './screens/SignIn.jsx'
import Today from './screens/Today.jsx'
import Orders from './screens/Orders.jsx'
import OrderDetail from './screens/OrderDetail.jsx'
import NewOrder from './screens/NewOrder.jsx'
import Me from './screens/Me.jsx'

export default function App() {
  const { auth, route, role, signOut } = useApp()

  // Scroll to the top when the screen changes.
  useEffect(() => { window.scrollTo(0, 0) }, [route.name, route.id])

  if (auth.status === 'loading') {
    return <div className="grid h-full place-items-center"><img src="./logo-small.png" alt="" className="h-24 w-24 animate-pulse object-contain" /></div>
  }
  if (auth.status === 'signed-out') return <SignIn />
  if (auth.status !== 'ready') {
    return (
      <div className="pt-safe flex h-full flex-col items-center justify-center px-8 text-center">
        <ShieldAlert className="h-10 w-10 text-rose" />
        <h1 className="mt-4 font-display text-2xl">{auth.status === 'blocked' ? 'This account cannot use Blossom' : 'Could not load your account'}</h1>
        <p className="mt-2 text-sm text-muted">{auth.status === 'blocked' ? 'It is not active. Ask the owner to switch it on.' : 'Check the internet, then sign in again.'}</p>
        <Button variant="secondary" className="mt-6" onClick={signOut}>Sign out</Button>
      </div>
    )
  }

  let screen
  switch (route.name) {
    case 'orders': screen = route.id ? <OrderDetail key={route.id} id={route.id} /> : <Orders key={route.query.toString()} />; break
    case 'new': screen = can(role).create ? <NewOrder /> : <Today />; break
    case 'me': screen = <Me />; break
    case 'today': screen = <Today />; break
    default: setTimeout(() => navigate('today', { replace: true })); screen = <Today />
  }

  return (
    <>
      {screen}
      {route.name !== 'new' && <TabBar />}
      <Toast />
    </>
  )
}
