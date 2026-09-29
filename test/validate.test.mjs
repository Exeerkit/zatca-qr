/**
 * اختبارات الفحص — كل قاعدة مواصفة لها اختبار يفشل إن أُزيلت.
 * Validation tests: every specification rule is covered by a failing case.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { validateZatcaInvoice } from '../src/index.js'

const VALID_INVOICE = {
  sellerName: 'مؤسسة النخبة التجارية',
  vatNumber: '300000000000003',
  timestamp: '2026-04-18T13:30:00+03:00',
  totalWithVat: '1150.00',
  vatTotal: '150.00',
}

/** يعيد رموز الأخطاء وحدها، لتكون التوقعات قصيرة ومقروءة. */
const codes = (issues) => issues.map((issue) => issue.code)

test('يقبل فاتورة مطابقة للمواصفة بلا أخطاء ولا تنبيهات', () => {
  const result = validateZatcaInvoice(VALID_INVOICE)
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.warnings, [])
})

test('يعدّد الحقول الإلزامية الناقصة', () => {
  const result = validateZatcaInvoice({ sellerName: 'شركة', timestamp: '2026-04-18T10:30:00Z' })
  assert.equal(result.valid, false)
  assert.deepEqual(codes(result.errors), ['MISSING_FIELD', 'MISSING_FIELD', 'MISSING_FIELD'])
})

test('يرفض الرقم الضريبي المخالف للصيغة', () => {
  for (const vatNumber of ['30000000000000', '123456789012345', '30000000000000A']) {
    const result = validateZatcaInvoice({ ...VALID_INVOICE, vatNumber })
    assert.equal(result.valid, false, `يجب رفض ${vatNumber}`)
    assert.ok(codes(result.errors).includes('VAT_NUMBER_FORMAT'))
  }
})

test('يرفض الطابع الزمني بلا منطقة زمنية صريحة', () => {
  const result = validateZatcaInvoice({ ...VALID_INVOICE, timestamp: '2026-04-18 13:30' })
  assert.equal(result.valid, false)
  assert.ok(codes(result.errors).includes('TIMESTAMP_FORMAT'))
  // والصيغة الصحيحة بمنطقة +03:00 تمر
  assert.equal(validateZatcaInvoice(VALID_INVOICE).valid, true)
})

test('يقبل كائن Date صحيحاً كطابع زمني', () => {
  const result = validateZatcaInvoice({ ...VALID_INVOICE, timestamp: new Date('2026-04-18T10:30:00Z') })
  assert.equal(result.valid, true)
})

test('يرفض تاريخاً غير صحيح دون أن يرمي استثناءً', () => {
  const result = validateZatcaInvoice({ ...VALID_INVOICE, timestamp: new Date('ليس تاريخاً') })
  assert.equal(result.valid, false)
  assert.ok(codes(result.errors).includes('TIMESTAMP_FORMAT'))
})

test('يرفض المبالغ غير النصية وغير الرقمية', () => {
  for (const totalWithVat of [[115], { value: 115 }, true, null]) {
    const result = validateZatcaInvoice({ ...VALID_INVOICE, totalWithVat })
    assert.equal(result.valid, false, `يجب رفض ${JSON.stringify(totalWithVat)}`)
    assert.ok(codes(result.errors).some((code) => ['AMOUNT_FORMAT', 'MISSING_FIELD'].includes(code)))
  }
})

test('يرفض الفواصل العشرية العربية وفواصل الآلاف', () => {
  for (const total of ['1150,00', '1,150.00', '1150٫00']) {
    const result = validateZatcaInvoice({ ...VALID_INVOICE, totalWithVat: total })
    assert.equal(result.valid, false, `يجب رفض ${total}`)
    assert.ok(codes(result.errors).includes('AMOUNT_FORMAT'))
  }
})

test('ينبّه على المبلغ بلا منزلتين عشريتين', () => {
  const result = validateZatcaInvoice({ ...VALID_INVOICE, totalWithVat: 1150 })
  assert.equal(result.valid, true, 'التنبيه لا يمنع الإصدار')
  assert.ok(codes(result.warnings).includes('AMOUNT_PRECISION'))
})

test('ينبّه حين تتجاوز الضريبة إجمالي الفاتورة', () => {
  const result = validateZatcaInvoice({ ...VALID_INVOICE, totalWithVat: '100.00', vatTotal: '150.00' })
  assert.equal(result.valid, true)
  assert.ok(codes(result.warnings).includes('VAT_EXCEEDS_TOTAL'))
})

test('يرفض اسم بائع يتجاوز 255 بايتاً مع أنه أقل من 255 حرفاً', () => {
  const sellerName = 'ش'.repeat(130) // 260 بايتاً
  const result = validateZatcaInvoice({ ...VALID_INVOICE, sellerName })
  assert.equal(sellerName.length, 130)
  assert.equal(result.valid, false)
  assert.ok(codes(result.errors).includes('FIELD_TOO_LONG'))
})

test('يرفض حقول مرحلة الربط الناقصة أو الختم وحده', () => {
  const partial = validateZatcaInvoice({ ...VALID_INVOICE, invoiceHash: 'aGFzaA==' })
  assert.equal(partial.valid, false)
  assert.ok(codes(partial.errors).includes('PHASE2_INCOMPLETE'))

  const stampOnly = validateZatcaInvoice({ ...VALID_INVOICE, stamp: 'c3RhbXA=' })
  assert.equal(stampOnly.valid, false)
  assert.ok(codes(stampOnly.errors).includes('PHASE2_INCOMPLETE'))

  const complete = validateZatcaInvoice({
    ...VALID_INVOICE,
    invoiceHash: 'aGFzaA==',
    signature: 'c2ln',
    publicKey: 'cHVibGlj',
  })
  assert.equal(complete.valid, true)
})

test('يرفض مدخلاً ليس كائناً', () => {
  assert.equal(validateZatcaInvoice(null).valid, false)
  assert.equal(validateZatcaInvoice('نص').valid, false)
  assert.deepEqual(codes(validateZatcaInvoice(42).errors), ['INVALID_FIELD'])
})

test('ينبّه على الحمولة الطويلة التي قد تفشل مع الماسحات الميدانية', () => {
  const result = validateZatcaInvoice({
    ...VALID_INVOICE,
    sellerName: 'س'.repeat(120), // 240 بايتاً
    invoiceHash: 'x'.repeat(250),
    signature: 'y'.repeat(250),
    publicKey: 'z'.repeat(250),
  })
  assert.equal(result.valid, true)
  assert.ok(codes(result.warnings).includes('PAYLOAD_TOO_LARGE'))
})
