/**
 * تعريفات الأنواع — zatca-qr
 * Types for the ZATCA e-invoice QR encoder/decoder.
 */

/** العلامات المعرَّفة في المواصفة. */
export type ZatcaTag = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** حقول المرحلة الأولى: إلزامية على كل فاتورة ضريبية. */
export interface ZatcaPhase1Fields {
  /** اسم البائع كما في السجل التجاري (Tag 1) — عربي أو لاتيني. */
  sellerName: string
  /** الرقم الضريبي: 15 رقماً يبدأ وينتهي بـ3 (Tag 2). */
  vatNumber: string
  /** طابع زمني ISO 8601 مع منطقة زمنية، أو كائن Date (Tag 3). */
  timestamp: string | Date
  /** إجمالي الفاتورة شامل الضريبة (Tag 4). */
  totalWithVat: string | number
  /** إجمالي الضريبة (Tag 5). */
  vatTotal: string | number
}

/**
 * حقول مرحلة الربط: تُقدَّم الثلاثة الأولى معاً.
 * المكتبة لا توقّع ولا تتصل بالهيئة، بل تنقل القيم التي ينتجها مخزنك (CSID).
 */
export interface ZatcaPhase2Fields {
  /** Tag 6 — بصمة SHA-256 لملف الفاتورة XML بترميز Base64. */
  invoiceHash?: string
  /** Tag 7 — التوقيع الرقمي ECDSA بترميز Base64. */
  signature?: string
  /** Tag 8 — المفتاح العام للشهادة بترميز Base64. */
  publicKey?: string
  /** Tag 9 — ختم الهيئة، يُضاف بعد التخليص فقط. */
  stamp?: string
}

export type ZatcaInvoiceData = ZatcaPhase1Fields & ZatcaPhase2Fields

/** حقل واحد بعد فك ترميز TLV. */
export interface ZatcaDecodedField {
  tag: number
  /** اسم الحقل المعروف، أو null للعلامات خارج المواصفة. */
  name: string | null
  value: string
  byteLength: number
}

/** ملاحظة واحدة من الفحص: خطأ مانع أو تنبيه. */
export interface ZatcaValidationIssue {
  code: string
  field: string | null
  message: string
}

export interface ZatcaValidationResult {
  valid: boolean
  errors: ZatcaValidationIssue[]
  warnings: ZatcaValidationIssue[]
}

export interface ZatcaDecodeWarning {
  code: string
  message: string
}

/** ناتج فك ترميز حمولة رمز QR. */
export interface DecodedZatcaQr {
  /** 2 إن كانت العلامات 6 و7 و8 موجودة، وإلا 1. */
  phase: 1 | 2
  fields: ZatcaDecodedField[]
  unknown: ZatcaDecodedField[]
  data: Record<string, string>
  warnings: ZatcaDecodeWarning[]
  byteLength: number
}

/** أرقام العلامات كما في المواصفة. */
export declare const ZATCA_TAGS: Readonly<{
  SELLER_NAME: 1
  VAT_NUMBER: 2
  TIMESTAMP: 3
  TOTAL_WITH_VAT: 4
  VAT_TOTAL: 5
  INVOICE_HASH: 6
  SIGNATURE: 7
  PUBLIC_KEY: 8
  STAMP: 9
}>

/** أسماء الحقول المقابلة لكل علامة. */
export declare const ZATCA_TAG_NAMES: Readonly<Record<number, string>>

/** خطأ المكتبة، يحمل رمزاً برمجياً في `code`. */
export declare class ZatcaQrError extends Error {
  readonly code: string
  constructor(message: string, code?: string)
}

/** يبني بايتات TLV الخام. */
export declare function buildTlvBytes(data: ZatcaInvoiceData): Uint8Array

/** يرمّز البيانات إلى حمولة Base64 جاهزة لرمز QR. */
export declare function encodeZatcaTlv(
  data: ZatcaInvoiceData,
  options?: { strict?: boolean },
): string

/** يفكّ ترميز حمولة Base64 إلى حقول مقروءة. */
export declare function decodeZatcaTlv(base64: string): DecodedZatcaQr

/** يفحص البيانات مقابل المواصفة ويفصل الأخطاء عن التنبيهات. */
export declare function validateZatcaInvoice(data: ZatcaInvoiceData): ZatcaValidationResult

/** ينسّق مبلغاً بفاصلة نقطية وبمنزلتين. */
export declare function toZatcaAmount(value: number | string): string
