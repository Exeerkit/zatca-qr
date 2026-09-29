/**
 * اختبارات فك الترميز — بما فيها الحمولات المعطوبة التي تصل من الماسحات.
 * Decoding tests, including malformed payloads produced by real scanners.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { ZatcaQrError, buildTlvBytes, decodeZatcaTlv, encodeZatcaTlv } from '../src/index.js'

const INVOICE = {
  sellerName: 'شركة أكمي للتقنية',
  vatNumber: '300000000000003',
  timestamp: '2026-04-18T10:30:00Z',
  totalWithVat: '115.00',
  vatTotal: '15.00',
}

/** يحوّل بايتات إلى Base64 عبر Buffer، لبناء حمولات مخصصة في الاختبارات. */
const toBase64 = (bytes) => Buffer.from(bytes).toString('base64')

test('يعيد بناء الحقول بعد فك ترميز حمولة المرحلة الأولى', () => {
  const decoded = decodeZatcaTlv(encodeZatcaTlv(INVOICE))
  assert.equal(decoded.phase, 1)
  assert.equal(decoded.data.sellerName, INVOICE.sellerName)
  assert.equal(decoded.data.vatNumber, INVOICE.vatNumber)
  assert.equal(decoded.data.timestamp, INVOICE.timestamp)
  assert.equal(decoded.data.totalWithVat, '115.00')
  assert.equal(decoded.data.vatTotal, '15.00')
  assert.deepEqual(decoded.warnings, [])
  assert.equal(decoded.byteLength, buildTlvBytes(INVOICE).length)
})

test('يرفع المرحلة إلى 2 عند وجود العلامات 6 و7 و8', () => {
  const decoded = decodeZatcaTlv(
    encodeZatcaTlv({
      ...INVOICE,
      invoiceHash: 'aGFzaA==',
      signature: 'c2ln',
      publicKey: 'cHVibGlj',
      stamp: 'c3RhbXA=',
    }),
  )
  assert.equal(decoded.phase, 2)
  assert.equal(decoded.data.invoiceHash, 'aGFzaA==')
  assert.equal(decoded.data.stamp, 'c3RhbXA=')
})

test('يحفظ ترتيب العلامات وأسماءها وطول كل حقل بالبايتات', () => {
  const decoded = decodeZatcaTlv(encodeZatcaTlv(INVOICE))
  assert.deepEqual(
    decoded.fields.map((field) => field.tag),
    [1, 2, 3, 4, 5],
  )
  assert.deepEqual(
    decoded.fields.map((field) => field.name),
    ['sellerName', 'vatNumber', 'timestamp', 'totalWithVat', 'vatTotal'],
  )
  // اسم البائع العربي: 17 حرفاً لكن 32 بايتاً بترميز UTF-8
  assert.equal(decoded.fields[0].byteLength, 32)
})

test('يضع العلامات خارج المواصفة في unknown بدل أن يرفض الرمز', () => {
  const bytes = buildTlvBytes(INVOICE)
  const extra = new Uint8Array([42, 3, 120, 121, 122]) // tag 42 = "xyz"
  const payload = toBase64(new Uint8Array([...bytes, ...extra]))

  const decoded = decodeZatcaTlv(payload)
  assert.equal(decoded.unknown.length, 1)
  assert.equal(decoded.unknown[0].tag, 42)
  assert.equal(decoded.unknown[0].name, null)
  assert.equal(decoded.unknown[0].value, 'xyz')
  assert.ok(decoded.warnings.some((warning) => warning.code === 'UNKNOWN_TAGS'))
})

test('ينبّه على العلامة المكرّرة والعلامة الإلزامية الناقصة', () => {
  const bytes = buildTlvBytes(INVOICE)
  const duplicate = new Uint8Array([1, 2, 65, 66]) // tag 1 = "AB" مرة ثانية
  const decoded = decodeZatcaTlv(toBase64(new Uint8Array([...bytes, ...duplicate])))
  assert.ok(decoded.warnings.some((warning) => warning.code === 'DUPLICATE_TAG'))

  const onlyName = new Uint8Array([1, 3, 65, 66, 67]) // اسم البائع وحده
  const incomplete = decodeZatcaTlv(toBase64(onlyName))
  assert.ok(incomplete.warnings.some((warning) => warning.code === 'MISSING_REQUIRED_TAG'))
  assert.equal(incomplete.data.sellerName, 'ABC')
})

test('يرفض الحمولة المقتطعة بخطأ واضح', () => {
  const bytes = buildTlvBytes(INVOICE)
  const truncatedValue = toBase64(bytes.subarray(0, bytes.length - 1))
  assert.throws(
    () => decodeZatcaTlv(truncatedValue),
    (error) => error instanceof ZatcaQrError && error.code === 'TRUNCATED_TLV',
  )

  const truncatedHeader = toBase64(bytes.subarray(0, 1))
  assert.throws(
    () => decodeZatcaTlv(truncatedHeader),
    (error) => error.code === 'TRUNCATED_TLV',
  )
})

test('يرفض Base64 غير صحيح وعلامة صفرية', () => {
  assert.throws(
    () => decodeZatcaTlv('ليست base64!!'),
    (error) => error.code === 'INVALID_BASE64',
  )
  assert.throws(() => decodeZatcaTlv(''), (error) => error.code === 'INVALID_BASE64')
  assert.throws(() => decodeZatcaTlv('AAAA'), (error) => error.code === 'INVALID_TLV')
})

test('يتسامح مع Base64 الآمن للروابط ومع الحشو المحذوف', () => {
  // حمولة تحتوي حرفي + و / في Base64 لإثبات التسامح
  const invoice = { ...INVOICE, sellerName: '~~~???', totalWithVat: '1.00' }
  const standard = encodeZatcaTlv(invoice)
  assert.match(standard, /[+/]/, 'الفيكتور يحتوي حرف Base64 غير آمن للروابط')

  const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  assert.deepEqual(decodeZatcaTlv(urlSafe), decodeZatcaTlv(standard))
})

test('يتعامل مع مبلغ بلا منازل عشرية كما هو', () => {
  const decoded = decodeZatcaTlv(
    encodeZatcaTlv({ ...INVOICE, totalWithVat: 115, vatTotal: 15 }),
  )
  assert.equal(decoded.data.totalWithVat, '115')
  assert.equal(decoded.data.vatTotal, '15')
})
