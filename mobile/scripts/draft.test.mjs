import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyDraft, addLine, setQuantity, totals, validate, buildPayload, whatsappNumber } from '../src/lib/orderDraft.js'
import { stage, urgency, isOpen } from '../src/lib/orders.js'

const rose = { id: 7, name: 'RED FLOWERS', price: 400, category: 'Flowers', flower_type: 'Rose' }
const box = { id: 30, name: 'Heart box', price: 1850, category: 'Gifts' }
const NOW = new Date('2026-11-25T10:00:00Z')

const draftWith = (patch = {}) => {
  let d = emptyDraft()
  d.lines = addLine(addLine(addLine(d.lines, rose, 10), box), rose, 2) // 12 roses + 1 box
  return { ...d, name: 'Amina', phone: '0555 12 34 56', ...patch }
}

test('lines merge and quantities go to zero to remove', () => {
  const d = draftWith()
  assert.equal(d.lines.length, 2)
  assert.equal(d.lines[0].quantity, 12)
  assert.equal(setQuantity(d.lines, 30, 0).length, 1)
})

test('totals follow create_order arithmetic', () => {
  const t = totals(draftWith({ adjustment: -300 }))
  assert.deepEqual([t.subtotal, t.adjustment, t.total, t.paid, t.due, t.payStatus], [6650, -300, 6350, 6350, 0, 'paid'])
  const later = totals(draftWith({ pay: 'later' }))
  assert.deepEqual([later.paid, later.due, later.payStatus], [0, 6650, 'unpaid'])
  const part = totals(draftWith({ pay: 'part', paidAmount: '2000' }))
  assert.deepEqual([part.paid, part.due, part.payStatus], [2000, 4650, 'partial'])
  assert.equal(totals(draftWith({ adjustment: -99999 })).total, 0) // discount never below zero
})

test('validation mirrors checkout and server rules', () => {
  assert.deepEqual(validate(draftWith(), { now: NOW }), {})
  assert.ok(validate(draftWith({ phone: '0555' }), { now: NOW }).phone)
  assert.ok(validate({ ...draftWith(), lines: [] }, { now: NOW }).lines)
  const delivery = validate(draftWith({ fulfilment: 'motorcycle' }), { now: NOW })
  assert.ok(delivery.date && delivery.town)
  assert.ok(validate(draftWith({ fulfilment: 'motorcycle', date: '2026-11-24', town: 'Batna' }), { now: NOW }).date)
  assert.deepEqual(validate(draftWith({ fulfilment: 'motorcycle', date: '2026-11-25', town: 'Batna' }), { now: NOW }), {})
  assert.ok(validate(draftWith({ pay: 'part', paidAmount: '6650' }), { now: NOW }).paidAmount)
  // A counter sale needs no customer, unless it is sold on credit.
  assert.deepEqual(validate(draftWith({ kind: 'quick', name: '', phone: '' }), { now: NOW }), {})
  assert.ok(validate(draftWith({ kind: 'quick', name: '', phone: '', pay: 'later' }), { now: NOW }).phone)
})

test('payload matches what Blossom POS sends', () => {
  const { order, items } = buildPayload(draftWith({ fulfilment: 'dhd', date: '2026-11-26', town: 'Sétif', wilaya: 'Sétif', pay: 'part', paidAmount: '1000', method: 'baridimob', source: 'whatsapp' }))
  assert.equal(order.status, 'new')
  assert.equal(order.order_type, 'standard')
  assert.equal(order.delivery_method, 'dhd')
  assert.equal(order.delivery_city, 'Sétif')
  assert.equal(order.total_amount, 6650)
  assert.equal(order.amount_paid, 1000)
  assert.equal(order.payment_status, 'partial')
  assert.equal(order.payment_method, 'baridimob')
  assert.equal(order.client_source, 'whatsapp')
  assert.equal(order.price_adjustment, 0)
  assert.equal(order.delivery_latitude, '')       // never half a coordinate pair
  assert.deepEqual(items[0], { product_id: 7, quantity: 12, unit_price: 400, total_price: 4800, product_name: 'RED FLOWERS', product_image: '', color: '', flower_type: 'Rose', category: 'Flowers' })
  for (const i of items) assert.ok(Number.isInteger(i.unit_price) && i.quantity > 0)

  const quick = buildPayload(draftWith({ kind: 'quick', name: '', phone: '', fulfilment: 'motorcycle', date: '2026-11-26' })).order
  assert.deepEqual([quick.status, quick.order_type, quick.delivery_method, quick.delivery_date, quick.client_name, quick.client_source], ['done', 'quick_sale', 'pickup', '', 'Walk-in Customer', 'inhouse'])
})

test('WhatsApp numbers', () => {
  assert.equal(whatsappNumber('0555 12 34 56'), '213555123456')
  assert.equal(whatsappNumber('+33 7 53 78 95 48'), '33753789548')
  assert.equal(whatsappNumber('213661987654'), '213661987654')
})

test('order stages and urgency', () => {
  const base = { status: 'new', voided_at: null, payment_status: 'paid', created_at: '2026-11-20T10:00:00Z', delivery_method: 'motorcycle', delivery_date: '2026-11-25' }
  assert.equal(stage(base).key, 'new')
  assert.equal(stage({ ...base, status: 'processing', delivery_handed_off_at: 'x' }).key, 'courier')
  assert.equal(stage({ ...base, delivered_at: 'x', status: 'done' }).key, 'delivered')
  assert.equal(stage({ ...base, delivery_method: 'pickup', status: 'done' }).key, 'done')
  assert.equal(stage({ ...base, voided_at: 'x' }).key, 'cancelled')
  assert.equal(urgency(base, NOW), 'today')
  assert.equal(urgency({ ...base, delivery_date: '2026-11-24' }, NOW), 'late')
  assert.equal(urgency({ ...base, delivery_date: '2026-11-26' }, NOW), 'tomorrow')
  assert.equal(isOpen({ ...base, status: 'done' }), false)
})
