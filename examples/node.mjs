/**
 * مثال تشغيلي بلا أي تبعية: node examples/node.mjs
 * Runnable example: prints the QR payload, the decoded fields and the report.
 */

import {
  ZATCA_TAGS,
  decodeZatcaTlv,
  encodeZatcaTlv,
  toZatcaAmount,
  validateZatcaInvoice,
} from '../src/index.js'

const invoice = {
  sellerName: 'مؤسسة النخبة التجارية',
  vatNumber: '300000000000003',
  timestamp: new Date('2026-04-18T13:30:00+03:00'),
  totalWithVat: toZatcaAmount(1150),
  vatTotal: toZatcaAmount(150),
}

const report = validateZatcaInvoice(invoice)
console.log('الفحص:', report.valid ? 'مطابق للمواصفة' : 'مخالف')
for (const issue of [...report.errors, ...report.warnings]) {
  console.log(`  - [${issue.code}] ${issue.field ?? '-'}: ${issue.message}`)
}

const payload = encodeZatcaTlv(invoice, { strict: true })
console.log('\nحمولة رمز QR (Base64):')
console.log(payload)

const decoded = decodeZatcaTlv(payload)
console.log(`\nالمرحلة: ${decoded.phase} · الحجم: ${decoded.byteLength} بايتاً`)
console.table(
  decoded.fields.map((field) => ({
    العلامة: field.tag,
    الحقل: field.name,
    القيمة: field.value,
    البايتات: field.byteLength,
  })),
)

console.log('\nأرقام العلامات:', ZATCA_TAGS)
