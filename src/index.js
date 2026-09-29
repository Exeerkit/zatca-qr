/**
 * zatca-qr — رمز الاستجابة السريعة لفواتير هيئة الزكاة والضريبة والجمارك (ZATCA).
 * ---------------------------------------------------------------------------
 * مكتبة بلا أي تبعية، تُنتج وتقرأ حمولة رمز QR كما تفرضها الهيئة على كل فاتورة
 * ضريبية في المملكة: تسلسل TLV ثم ترميز Base64.
 *
 * Zero-dependency ZATCA (Saudi FATOORA) e-invoice QR payloads.
 * Encodes and decodes the TLV sequence mandated on every tax invoice in Saudi
 * Arabia (Phase 1, with optional Phase 2 integration fields).
 *
 * Works in: Node 18+, browsers, Cloudflare Workers, Deno, Bun. ESM only.
 */

/**
 * أرقام العلامات (Tags) كما تعرّفها مواصفة الهيئة.
 * 1..5 إلزامية في المرحلة الأولى، و6..9 تُضاف في مرحلة الربط.
 */
export const ZATCA_TAGS = Object.freeze({
  SELLER_NAME: 1,
  VAT_NUMBER: 2,
  TIMESTAMP: 3,
  TOTAL_WITH_VAT: 4,
  VAT_TOTAL: 5,
  INVOICE_HASH: 6,
  SIGNATURE: 7,
  PUBLIC_KEY: 8,
  STAMP: 9,
})

/** أسماء الحقول المقابلة لكل علامة (تُستخدم في فك الترميز). */
export const ZATCA_TAG_NAMES = Object.freeze({
  1: 'sellerName',
  2: 'vatNumber',
  3: 'timestamp',
  4: 'totalWithVat',
  5: 'vatTotal',
  6: 'invoiceHash',
  7: 'signature',
  8: 'publicKey',
  9: 'stamp',
})

/** أقصى طول لقيمة واحدة: بايت واحد للطول يعني 255 بايتاً كحد أعلى. */
const MAX_FIELD_BYTES = 255

/** الحقول الخمسة الإلزامية بترتيب علاماتها. */
const REQUIRED_FIELDS = Object.freeze([
  ['sellerName', ZATCA_TAGS.SELLER_NAME],
  ['vatNumber', ZATCA_TAGS.VAT_NUMBER],
  ['timestamp', ZATCA_TAGS.TIMESTAMP],
  ['totalWithVat', ZATCA_TAGS.TOTAL_WITH_VAT],
  ['vatTotal', ZATCA_TAGS.VAT_TOTAL],
])

/** حقول مرحلة الربط: الثلاثة الأولى تُضاف معاً أو لا تُضاف إطلاقاً. */
const PHASE_2_REQUIRED_FIELDS = Object.freeze([
  ['invoiceHash', ZATCA_TAGS.INVOICE_HASH],
  ['signature', ZATCA_TAGS.SIGNATURE],
  ['publicKey', ZATCA_TAGS.PUBLIC_KEY],
])

/** ختم الهيئة يُضاف بعد التخليص فقط، فيأتي وحده من غير إخوته. */
const PHASE_2_OPTIONAL_FIELDS = Object.freeze([['stamp', ZATCA_TAGS.STAMP]])

/** الرقم الضريبي السعودي: 15 رقماً يبدأ بـ3 وينتهي بـ3. */
const VAT_NUMBER_PATTERN = /^3\d{13}3$/

/** طابع زمني ISO 8601 مع منطقة زمنية صريحة (Z أو +03:00). */
const ISO_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/

/** رقم عشري بفاصلة نقطية، بلا فواصل آلاف وبلا فاصلة عشرية عربية. */
const PLAIN_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/

/** حجم يُنبّه عنده: رموز QR الطويلة تفشل مع بعض الماسحات الميدانية. */
const PAYLOAD_SIZE_WARNING_BYTES = 1000

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** خطأ المكتبة الوحيد، يحمل رمزاً برمجياً لتفرّع المعالجة في تطبيقك. */
export class ZatcaQrError extends Error {
  /**
   * @param {string} message وصف إنجليزي واضح للسبب.
   * @param {string} [code] رمز الخطأ (FIELD_TOO_LONG، PHASE2_INCOMPLETE، ...).
   */
  constructor(message, code = 'ZATCA_QR_ERROR') {
    super(message)
    this.name = 'ZatcaQrError'
    this.code = code
  }
}

/* -------------------------------------------------------------------------- */
/*                                 أدوات داخلية                                */
/* -------------------------------------------------------------------------- */

/** الحقول التي يُقبل فيها الرقم مباشرة: المبالغ فقط. */
const NUMERIC_FIELDS = new Set(['totalWithVat', 'vatTotal'])

/**
 * يحوّل قيمة حقل إلى النص الذي سيُشفَّر.
 * التواريخ تتحول إلى ISO 8601 بـ UTC، وهو ما تقبله الهيئة دائماً.
 * الأرقام تُقبل في حقلي المبالغ فقط، حتى لا يتحول اسم بائع بالخطأ إلى رقم.
 */
function toFieldText(field, value) {
  if (value === undefined || value === null || value === '') {
    throw new ZatcaQrError(`Field "${field}" is required.`, 'MISSING_FIELD')
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ZatcaQrError(`Field "${field}" is an invalid Date.`, 'INVALID_FIELD')
    }
    return value.toISOString()
  }
  if (typeof value === 'number') {
    if (!NUMERIC_FIELDS.has(field)) {
      throw new ZatcaQrError(
        `Field "${field}" must be a string, not a number.`,
        'INVALID_FIELD',
      )
    }
    if (!Number.isFinite(value)) {
      throw new ZatcaQrError(
        `Field "${field}" must be a finite number.`,
        'INVALID_FIELD',
      )
    }
    return String(value)
  }
  if (typeof value === 'string') return value
  throw new ZatcaQrError(
    `Field "${field}" must be a string${NUMERIC_FIELDS.has(field) ? ', number' : ''} or Date (got ${typeof value}).`,
    'INVALID_FIELD',
  )
}

/**
 * يرمّز حقلاً واحداً بصيغة TLV: [Tag, Length, ...Value].
 * الطول يُحسب بالبايتات لا بالأحرف — وهذا موضع الخطأ الأشهر مع النص العربي.
 */
function encodeField(tag, text) {
  const valueBytes = textEncoder.encode(text)
  if (valueBytes.length > MAX_FIELD_BYTES) {
    throw new ZatcaQrError(
      `Tag ${tag} is ${valueBytes.length} UTF-8 bytes long, but the TLV length byte allows at most ${MAX_FIELD_BYTES}.`,
      'FIELD_TOO_LONG',
    )
  }
  const field = new Uint8Array(2 + valueBytes.length)
  field[0] = tag
  field[1] = valueBytes.length
  field.set(valueBytes, 2)
  return field
}

/** يحوّل بايتات إلى Base64 (يعمل في المتصفح وNode معاً). */
function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000 // تقسيم لتفادي تجاوز حد وسائط String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/** يقرأ Base64 إلى بايتات، ويتسامح مع Base64 الآمن للروابط وبعض المسافات. */
function base64ToBytes(base64) {
  if (typeof base64 !== 'string') {
    throw new ZatcaQrError('Payload must be a Base64 string.', 'INVALID_BASE64')
  }
  // نتسامح مع Base64 الآمن للروابط ومع الحشو المحذوف: بعض الماسحات تحذفهما.
  const compact = base64
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const body = compact.replace(/=+$/, '')
  if (body.length === 0) {
    throw new ZatcaQrError('Payload is empty.', 'INVALID_BASE64')
  }
  if (!/^[A-Za-z0-9+/]+$/.test(body)) {
    throw new ZatcaQrError('Payload contains characters outside Base64.', 'INVALID_BASE64')
  }
  if (body.length % 4 === 1) {
    throw new ZatcaQrError('Payload is not valid Base64 (impossible length).', 'INVALID_BASE64')
  }
  const normalized = body.padEnd(Math.ceil(body.length / 4) * 4, '=')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** يجمع حقول الفاتورة في قائمة [tag, text] مرتّبة تصاعدياً بالعلامة. */
function collectFields(data) {
  if (data === null || typeof data !== 'object') {
    throw new ZatcaQrError('Invoice data must be an object.', 'INVALID_FIELD')
  }

  const entries = REQUIRED_FIELDS.map(([field, tag]) => [tag, toFieldText(field, data[field])])

  const hasPhase2 = PHASE_2_REQUIRED_FIELDS.some(
    ([field]) => data[field] !== undefined && data[field] !== null,
  )
  // ختم الهيئة بلا إخوته خطأ بنيوي: لا معنى لختم على فاتورة غير موقّعة.
  const hasStampAlone =
    data.stamp !== undefined && data.stamp !== null && !hasPhase2

  if (hasStampAlone) {
    throw new ZatcaQrError(
      'Field "stamp" requires "invoiceHash", "signature" and "publicKey" as well.',
      'PHASE2_INCOMPLETE',
    )
  }

  if (hasPhase2) {
    const missing = PHASE_2_REQUIRED_FIELDS.filter(
      ([field]) => data[field] === undefined || data[field] === null || data[field] === '',
    )
    if (missing.length > 0) {
      throw new ZatcaQrError(
        `Phase 2 fields must be provided together; missing: ${missing
          .map(([field]) => field)
          .join(', ')}.`,
        'PHASE2_INCOMPLETE',
      )
    }
    for (const [field, tag] of PHASE_2_REQUIRED_FIELDS) {
      entries.push([tag, toFieldText(field, data[field])])
    }
    if (data.stamp !== undefined && data.stamp !== null && data.stamp !== '') {
      for (const [field, tag] of PHASE_2_OPTIONAL_FIELDS) {
        entries.push([tag, toFieldText(field, data[field])])
      }
    }
  }

  return entries.sort((a, b) => a[0] - b[0])
}

/* -------------------------------------------------------------------------- */
/*                              الواجهة العامة                                 */
/* -------------------------------------------------------------------------- */

/**
 * يبني بايتات TLV الخام من بيانات الفاتورة.
 * تُفيد في الاختبارات وفي الفحص البايتي عند رفض الرمز من نظام محاسبي.
 *
 * @param {import('./index.d.ts').ZatcaInvoiceData} data
 * @returns {Uint8Array}
 */
export function buildTlvBytes(data) {
  const parts = collectFields(data).map(([tag, text]) => encodeField(tag, text))
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    buffer.set(part, offset)
    offset += part.length
  }
  return buffer
}

/**
 * الدالة الرئيسية: يحوّل بيانات الفاتورة إلى نص Base64 يُمرَّر لمولّد QR.
 *
 * @param {import('./index.d.ts').ZatcaInvoiceData} data
 * @param {{ strict?: boolean }} [options] مع `strict` تُرفض الفاتورة إن خالفت
 *   المواصفة (رقم ضريبي غير صحيح، طابع زمني بلا منطقة، فاصلة عشرية عربية...).
 * @returns {string} حمولة Base64 جاهزة لرمز QR.
 */
export function encodeZatcaTlv(data, options = {}) {
  if (options.strict === true) {
    const { errors } = validateZatcaInvoice(data)
    if (errors.length > 0) {
      throw new ZatcaQrError(errors[0].message, errors[0].code)
    }
  }
  return bytesToBase64(buildTlvBytes(data))
}

/**
 * يفكّ ترميز حمولة Base64 إلى بايتات TLV ثم إلى حقول مقروءة.
 * يتسامح مع العلامات غير المعروفة (يضعها في `unknown`) بدل أن يرفض الرمز.
 *
 * @param {string} base64 حمولة رمز QR.
 * @returns {import('./index.d.ts').DecodedZatcaQr}
 */
export function decodeZatcaTlv(base64) {
  const bytes = base64ToBytes(base64)
  const fields = []
  const unknown = []
  const seen = new Set()
  const warnings = []

  let offset = 0
  while (offset < bytes.length) {
    if (offset + 2 > bytes.length) {
      throw new ZatcaQrError(
        `Truncated TLV: found ${bytes.length - offset} trailing byte(s) where a tag and length were expected.`,
        'TRUNCATED_TLV',
      )
    }
    const tag = bytes[offset]
    const length = bytes[offset + 1]
    const start = offset + 2
    const end = start + length

    if (end > bytes.length) {
      throw new ZatcaQrError(
        `Truncated TLV: tag ${tag} declares ${length} bytes but only ${bytes.length - start} remain.`,
        'TRUNCATED_TLV',
      )
    }
    if (tag === 0) {
      throw new ZatcaQrError('Invalid TLV: tag 0 is not defined.', 'INVALID_TLV')
    }
    if (seen.has(tag)) {
      warnings.push({
        code: 'DUPLICATE_TAG',
        message: `Tag ${tag} appears more than once; validators may reject the payload.`,
      })
    }
    seen.add(tag)

    const value = textDecoder.decode(bytes.subarray(start, end))
    const name = ZATCA_TAG_NAMES[tag]
    const field = { tag, name: name ?? null, value, byteLength: length }
    if (name) fields.push(field)
    else unknown.push(field)

    offset = end
  }

  const data = {}
  for (const field of fields) data[field.name] = field.value

  const isPhase2 = [6, 7, 8].every((tag) => seen.has(tag))
  for (const tag of [1, 2, 3, 4, 5]) {
    if (!seen.has(tag)) {
      warnings.push({
        code: 'MISSING_REQUIRED_TAG',
        message: `Tag ${tag} (${ZATCA_TAG_NAMES[tag]}) is missing; the payload is not a valid Phase 1 QR.`,
      })
    }
  }
  if (unknown.length > 0) {
    warnings.push({
      code: 'UNKNOWN_TAGS',
      message: `Payload contains ${unknown.length} tag(s) outside the specification: ${unknown
        .map((field) => field.tag)
        .join(', ')}.`,
    })
  }

  return { phase: isPhase2 ? 2 : 1, fields, unknown, data, warnings, byteLength: bytes.length }
}

/**
 * يفحص البيانات مقابل المواصفة قبل الإصدار، ويفصل الأخطاء عن التنبيهات.
 * الأخطاء تمنع الفاتورة من القبول، والتنبيهات تُصدر لكنها تستحق مراجعة.
 *
 * @param {import('./index.d.ts').ZatcaInvoiceData} data
 * @returns {import('./index.d.ts').ZatcaValidationResult}
 */
export function validateZatcaInvoice(data) {
  /** @type {import('./index.d.ts').ZatcaValidationIssue[]} */
  const errors = []
  /** @type {import('./index.d.ts').ZatcaValidationIssue[]} */
  const warnings = []

  if (data === null || typeof data !== 'object') {
    errors.push({ code: 'INVALID_FIELD', field: null, message: 'Invoice data must be an object.' })
    return { valid: false, errors, warnings }
  }

  for (const [field] of REQUIRED_FIELDS) {
    const value = data[field]
    if (value === undefined || value === null || value === '') {
      errors.push({ code: 'MISSING_FIELD', field, message: `Field "${field}" is required.` })
      continue
    }
    // الطول بالبايتات: 130 حرفاً عربياً = 260 بايتاً، وهذا يتجاوز حد TLV.
    try {
      const bytes = textEncoder.encode(toFieldText(field, value)).length
      if (bytes > MAX_FIELD_BYTES) {
        errors.push({
          code: 'FIELD_TOO_LONG',
          field,
          message: `Field "${field}" is ${bytes} UTF-8 bytes long; the TLV limit is ${MAX_FIELD_BYTES}.`,
        })
      }
    } catch (error) {
      errors.push({ code: error.code ?? 'INVALID_FIELD', field, message: error.message })
    }
  }

  const vatNumber = data.vatNumber
  if (typeof vatNumber === 'string' && vatNumber !== '' && !VAT_NUMBER_PATTERN.test(vatNumber)) {
    errors.push({
      code: 'VAT_NUMBER_FORMAT',
      field: 'vatNumber',
      message:
        'VAT number must be exactly 15 digits, starting and ending with 3 (e.g. 300000000000003).',
    })
  }

  const timestamp = data.timestamp
  if (timestamp instanceof Date) {
    // toISOString يرمي استثناءً على تاريخ غير صحيح، لذلك نفحصه قبل الاستدعاء
    if (Number.isNaN(timestamp.getTime())) {
      errors.push({
        code: 'TIMESTAMP_FORMAT',
        field: 'timestamp',
        message: 'Timestamp Date is invalid.',
      })
    }
  } else if (
    typeof timestamp === 'string' &&
    timestamp !== '' &&
    !ISO_WITH_ZONE_PATTERN.test(timestamp)
  ) {
    errors.push({
      code: 'TIMESTAMP_FORMAT',
      field: 'timestamp',
      message:
        'Timestamp must be ISO 8601 with an explicit time zone, e.g. 2026-04-18T10:30:00Z or 2026-04-18T13:30:00+03:00.',
    })
  }

  for (const field of ['totalWithVat', 'vatTotal']) {
    const value = data[field]
    if (value === undefined || value === null || value === '') continue
    if (typeof value !== 'string' && typeof value !== 'number') {
      errors.push({
        code: 'AMOUNT_FORMAT',
        field,
        message: `Field "${field}" must be a decimal amount as a string or a number (got ${
          Array.isArray(value) ? 'array' : typeof value
        }).`,
      })
      continue
    }
    const text = String(value).trim()
    if (!PLAIN_DECIMAL_PATTERN.test(text)) {
      errors.push({
        code: 'AMOUNT_FORMAT',
        field,
        message: `Field "${field}" must use a dot decimal separator with no thousands separators (got "${text}").`,
      })
      continue
    }
    const decimals = text.includes('.') ? text.split('.')[1].length : 0
    if (decimals !== 2) {
      warnings.push({
        code: 'AMOUNT_PRECISION',
        field,
        message: `Field "${field}" has ${decimals} decimal place(s); the specification examples use exactly 2.`,
      })
    }
  }

  const total = Number(data.totalWithVat)
  const vat = Number(data.vatTotal)
  if (Number.isFinite(total) && Number.isFinite(vat) && vat > total) {
    warnings.push({
      code: 'VAT_EXCEEDS_TOTAL',
      field: 'vatTotal',
      message: 'VAT amount is greater than the invoice total including VAT.',
    })
  }

  const phase2Missing = PHASE_2_REQUIRED_FIELDS.filter(
    ([field]) => data[field] === undefined || data[field] === null || data[field] === '',
  )
  const hasAnyPhase2 = PHASE_2_REQUIRED_FIELDS.some(
    ([field]) => data[field] !== undefined && data[field] !== null && data[field] !== '',
  )
  if (hasAnyPhase2 && phase2Missing.length > 0) {
    errors.push({
      code: 'PHASE2_INCOMPLETE',
      field: phase2Missing[0][0],
      message: `Phase 2 fields must be provided together; missing: ${phase2Missing
        .map(([field]) => field)
        .join(', ')}.`,
    })
  }
  if (
    (data.stamp !== undefined && data.stamp !== null && data.stamp !== '') &&
    phase2Missing.length > 0
  ) {
    errors.push({
      code: 'PHASE2_INCOMPLETE',
      field: 'stamp',
      message: 'Field "stamp" requires "invoiceHash", "signature" and "publicKey" as well.',
    })
  }

  if (errors.length === 0) {
    const size = buildTlvBytes(data).length
    if (size > PAYLOAD_SIZE_WARNING_BYTES) {
      warnings.push({
        code: 'PAYLOAD_TOO_LARGE',
        field: null,
        message: `TLV payload is ${size} bytes; long payloads can fail on field scanners.`,
      })
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * ينسّق مبلغاً بالصيغة التي تتوقعها الهيئة: فاصلة نقطية وبمنزلتين.
 * الأرقام تُقرَّب إلى منزلتين، والنصوص تُترك كما هي بعد إزالة الفراغات.
 *
 * @param {number|string} value
 * @returns {string}
 */
export function toZatcaAmount(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ZatcaQrError('Amount must be a finite number.', 'AMOUNT_FORMAT')
    }
    return value.toFixed(2)
  }
  if (typeof value === 'string') return value.trim()
  throw new ZatcaQrError(
    `Amount must be a number or a string (got ${typeof value}).`,
    'AMOUNT_FORMAT',
  )
}
