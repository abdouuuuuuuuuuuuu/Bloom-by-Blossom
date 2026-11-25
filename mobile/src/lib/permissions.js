// Same role matrix as Blossom POS (src/lib/permissions.js there).
// The database enforces it; this only hides buttons a person cannot use.
const ACTIONS = {
  owner:    { create: true,  status: true,  cancel: true,  payment: true,  deliver: true,  sales: true },
  manager:  { create: true,  status: true,  cancel: true,  payment: true,  deliver: true,  sales: true },
  florist:  { create: true,  status: true,  cancel: false, payment: true,  deliver: true,  sales: false },
  cashier:  { create: true,  status: false, cancel: false, payment: true,  deliver: false, sales: false },
  delivery: { create: false, status: false, cancel: false, payment: false, deliver: true,  sales: false },
}

export const STAFF_ROLES = Object.keys(ACTIONS)
export const can = (role) => ACTIONS[role] || ACTIONS.delivery
