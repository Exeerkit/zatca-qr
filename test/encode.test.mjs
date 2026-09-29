/**
 * اختبارات الترميز — بما فيها فيكتور مرجعي من مراجع الهيئة.
 * Encoding tests, including a reference vector cross-checked byte by byte.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ZatcaQrError,
  buildTlvBytes,
  encodeZatcaTlv,
  toZatcaAmount,
} from '../src/index.js'

/** فيكتور مرجعي: فاتورة مبسّطة بأبسط صورة. */
const REFERENCE_INVOICE = {
  sellerName: 'Acme Saudi',
  vatNumber: '300000000000003',
  timestamp: '2026-04-18T10:30:00Z',
  totalWithVat: '115.00',
  vatTotal: '15.00',
}

/** الترميز المتوقع للفيكتور: TLV ثم Base64. */
const REFERENCE_BASE64 =
  'AQpBY21lIFNhdWRpAg8zMDAwMDAwMDAwMDAwMDMDFDIwMjYtMDQtMThUMTA6MzA6MDBaBAYxMTUuMDAFBTE1LjAw'

/** الترميز السادس عشري المتوقع لنفس الفيكتور. */
const REFERENCE_HEX =
  '010a41636d65205361756469020f3330303030303030303030303030330314323032362d30342d31385431303a33303a30305a04063131352e3030050531352e3030'

test('يطابق الفيكتور المرجعي حرفاً بحرف', () => {
  assert.equal(encodeZatcaTlv(REFERENCE_INVOICE), REFERENCE_BASE64)
})

test('يبني بايتات TLV المطابقة للفيكتور المرجعي', () => {
  const bytes = buildTlvBytes(REFERENCE_INVOICE)
  assert.equal(bytes.length, 66)
  assert.equal(Buffer.from(bytes).toString('hex'), REFERENCE_HEX)
})

test('يرتّب العلامات تصاعدياً ويضع الطول بالبايتات', () => {
  const bytes = buildTlvBytes(REFERENCE_INVOICE)
  assert.deepEqual(
    Array.from(bytes).slice(0, 2),
    [1, 10],
    'العلامة 1 ثم طول اسم البائع بالبايتات',
  )
  assert.equal(bytes[12], 2, 'العلامة 2 تبدأ بعد 2 + 10 بايتات')
  assert.equal(bytes[13], 15, 'طول الرقم الضريبي 15 بايتاً')
})

test('يحسب الطول بالبايتات لا بالأحرف مع النص العربي', () => {
  const sellerName = 'شركة أكمي' // 9 أحرف، لكن 17 بايتاً بترميز UTF-8
  const bytes = buildTlvBytes({ ...REFERENCE_INVOICE, sellerName })
  assert.equal(sellerName.length, 9, 'عدد الأحرف')
  assert.equal(bytes[1], 17, 'الطول المكتوب في TLV هو عدد البايتات')
})

test('يقبل حرفاً عربياً عند حد 254 بايتاً ويرفض ما يتجاوزه', () => {
  // الحرف العربي بايتان، فـ127 حرفاً = 254 بايتاً (داخل الحد)
  assert.doesNotThrow(() =>
    encodeZatcaTlv({ ...REFERENCE_INVOICE, sellerName: 'ش'.repeat(127) }),
  )
  // و128 حرفاً = 256 بايتاً (يتجاوز بايت الطول الواحد)
  assert.throws(
    () => encodeZatcaTlv({ ...REFERENCE_INVOICE, sellerName: 'ش'.repeat(128) }),
    (error) => {
      assert.ok(error instanceof ZatcaQrError)
      assert.equal(error.code, 'FIELD_TOO_LONG')
      return true
    },
  )
})

test('يحوّل كائن Date إلى ISO 8601 بمنطقة UTC', () => {
  const base64 = encodeZatcaTlv({
    ...REFERENCE_INVOICE,
    timestamp: new Date('2026-04-18T10:30:00Z'),
  })
  const bytes = buildTlvBytes({
    ...REFERENCE_INVOICE,
    timestamp: new Date('2026-04-18T10:30:00Z'),
  })
  assert.ok(base64.length > 0)
  // العلامة الثالثة تبدأ عند 29: بايت العلامة 29، وطولها 30، وقيمتها من 31
  assert.equal(bytes[29], 3, 'بايت العلامة الثالثة')
  const length = bytes[30]
  assert.equal(length, 24, 'طول الطابع الزمني بالبايتات')
  const value = new TextDecoder().decode(bytes.subarray(31, 31 + length))
  assert.equal(value, '2026-04-18T10:30:00.000Z')
})

test('يضيف علامات مرحلة الربط 6 و7 و8 ثم 9 عند وجودها', () => {
  const bytes = buildTlvBytes({
    ...REFERENCE_INVOICE,
    invoiceHash: 'aGFzaA==',
    signature: 'c2ln',
    publicKey: 'cHVibGlj',
    stamp: 'c3RhbXA=',
  })
  const tags = []
  let offset = 0
  while (offset < bytes.length) {
    tags.push(bytes[offset])
    offset += 2 + bytes[offset + 1]
  }
  assert.deepEqual(tags, [1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('يرفض حقول مرحلة الربط الناقصة', () => {
  assert.throws(
    () => encodeZatcaTlv({ ...REFERENCE_INVOICE, invoiceHash: 'aGFzaA==' }),
    (error) => error.code === 'PHASE2_INCOMPLETE',
  )
  assert.throws(
    () => encodeZatcaTlv({ ...REFERENCE_INVOICE, stamp: 'c3RhbXA=' }),
    (error) => error.code === 'PHASE2_INCOMPLETE',
  )
})

test('يرفض الحقول الإلزامية الناقصة', () => {
  const { vatNumber, ...rest } = REFERENCE_INVOICE
  assert.throws(
    () => encodeZatcaTlv(rest),
    (error) => error.code === 'MISSING_FIELD',
  )
  assert.throws(
    () => encodeZatcaTlv({ ...REFERENCE_INVOICE, sellerName: '' }),
    (error) => error.code === 'MISSING_FIELD',
  )
})

test('يرفض أنواعاً غير مدعومة وقيم NaN', () => {
  assert.throws(
    () => encodeZatcaTlv({ ...REFERENCE_INVOICE, totalWithVat: Number.NaN }),
    (error) => error.code === 'INVALID_FIELD',
  )
  assert.throws(
    () => encodeZatcaTlv({ ...REFERENCE_INVOICE, sellerName: 42 }),
    (error) => error.code === 'INVALID_FIELD',
  )
})

test('الوضع الصارم يرفض فاتورة مخالفة للمواصفة', () => {
  const invalid = { ...REFERENCE_INVOICE, vatNumber: '30000000000000' } // 14 رقماً
  assert.doesNotThrow(() => encodeZatcaTlv(invalid), 'بلا strict ترمّز كما هي')
  assert.throws(
    () => encodeZatcaTlv(invalid, { strict: true }),
    (error) => error.code === 'VAT_NUMBER_FORMAT',
  )
})

test('ينسّق المبالغ بمنزلتين وبفاصلة نقطية', () => {
  assert.equal(toZatcaAmount(115), '115.00')
  assert.equal(toZatcaAmount(115.5), '115.50')
  assert.equal(toZatcaAmount(' 115.00 '), '115.00')
  assert.throws(() => toZatcaAmount(Number.POSITIVE_INFINITY), (e) => e.code === 'AMOUNT_FORMAT')
})
