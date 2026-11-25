// The real shop database, or (only while developing, with ?demo in the
// address) a made-up shop in memory. Builds always use the real one:
// import.meta.env.DEV is false there, so the demo module is dropped.
import * as real from './supabaseApi.js'

const demoWanted = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')
export const api = demoWanted ? await import('./demoApi.js') : real
export const isDemo = demoWanted
