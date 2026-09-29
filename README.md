<div dir="rtl" align="right">

# zatca-qr

**رمز QR لفاتورة ZATCA الضريبية — بلا تبعيات، بلا خادم، ومختبر مقابل المواصفة.**

[![CI](https://github.com/exeerkit/zatca-qr/actions/workflows/ci.yml/badge.svg)](https://github.com/exeerkit/zatca-qr/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/zatca-qr.svg)](https://www.npmjs.com/package/zatca-qr)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

</div>

<div dir="rtl" align="right">

## المشكلة التي تحلها هذه المكتبة

كل فاتورة ضريبية في السعودية يجب أن تحمل رمز QR مبنيّاً بمعيار **TLV** ثم **Base64**، وإلا
رفضها نظام المشتري المحاسبي وسقط حقّه في خصم الضريبة. والخطأ الأشهر — والأصعب في الاكتشاف —
هو حساب طول الحقل بعدد **الحروف** بدل عدد **البايتات**:

| اسم البائع | عدد الأحرف | عدد البايتات (UTF-8) | النتيجة |
| --- | --- | --- | --- |
| `Acme Saudi` | 10 | 10 | ✅ سليم |
| `شركة النخبة` | 10 | 20 | ❌ الرمز يُرفض |
| `ش` × 128 | 128 | 256 | ❌ يتجاوز حد بايت الطول (255) |

هذه المكتبة تحسب البايتات بدقة، وتفكّ الترميز للتحقق، وتفحص الفاتورة قبل الإصدار.

## التثبيت

```bash
npm install zatca-qr
# أو مباشرة من المستودع
npm install github:exeerkit/zatca-qr
```

بلا أي تبعية، ESM فقط، وتعمل في Node 18+ والمتصفح وCloudflare Workers وDeno وBun.

## الاستخدام

```ts
import { encodeZatcaTlv, toZatcaAmount, validateZatcaInvoice } from 'zatca-qr'

const invoice = {
  sellerName: 'مؤسسة النخبة التجارية',
  vatNumber: '300000000000003',        // 15 رقماً، يبدأ وينتهي بـ3
  timestamp: new Date(),               // أو نص ISO 8601 مع منطقة زمنية
  totalWithVat: toZatcaAmount(1150),   // '1150.00'
  vatTotal: toZatcaAmount(150),        // '150.00'
}

// 1) افحص قبل الإصدار: أخطاء تمنع القبول، وتنبيهات تستحق مراجعة
const report = validateZatcaInvoice(invoice)
if (!report.valid) throw new Error(report.errors[0].message)

// 2) حمولة Base64 جاهزة لرمز QR
const payload = encodeZatcaTlv(invoice, { strict: true })

// 3) مرّرها لمولّد QR الذي تستخدمه
```

### مع React

```tsx
import { QRCodeSVG } from 'qrcode.react'
import { encodeZatcaTlv, type ZatcaInvoiceData } from 'zatca-qr'

export function InvoiceQr({ invoice }: { invoice: ZatcaInvoiceData }) {
  return <QRCodeSVG value={encodeZatcaTlv(invoice)} size={220} level="M" />
}
```

### على Cloudflare Workers أو أي حافة

```ts
import { encodeZatcaTlv } from 'zatca-qr'

export default {
  fetch(request: Request) {
    const url = new URL(request.url)
    const payload = encodeZatcaTlv({
      sellerName: url.searchParams.get('seller') ?? '',
      vatNumber: url.searchParams.get('vat') ?? '',
      timestamp: new Date(),
      totalWithVat: url.searchParams.get('total') ?? '0.00',
      vatTotal: url.searchParams.get('vat_amount') ?? '0.00',
    })
    return Response.json({ qrPayloadBase64: payload })
  },
}
```

## فك الترميز: تحقّق من رمز وصل إليك

مفيد في التشخيص، وفي اختبارات الأنظمة المحاسبية، وفي كشف الرموز المصنوعة يدوياً.

```ts
import { decodeZatcaTlv } from 'zatca-qr'

const decoded = decodeZatcaTlv(payloadFromScanner)
console.log(decoded.phase)            // 1 أو 2
console.log(decoded.data.sellerName)  // 'مؤسسة النخبة التجارية'
console.log(decoded.fields)           // كل حقل: العلامة، الاسم، القيمة، وطولها بالبايتات
console.log(decoded.warnings)         // علامة مكرّرة؟ علامة ناقصة؟ علامات خارج المواصفة؟
```

يفكّ الترميز حمولات Base64 الآمنة للروابط، ويتسامح مع الحشو (`=`) المحذوف، ويضع العلامات
غير المعروفة في `unknown` بدل أن يرفض الرمز كاملاً.

## علامات المواصفة

| العلامة | الحقل | النوع | المرحلة |
| --- | --- | --- | --- |
| `1` | اسم البائع | نص UTF-8 | الأولى (إلزامي) |
| `2` | الرقم الضريبي | 15 رقماً يبدأ وينتهي بـ3 | الأولى (إلزامي) |
| `3` | الطابع الزمني | ISO 8601 مع منطقة زمنية | الأولى (إلزامي) |
| `4` | الإجمالي شامل الضريبة | رقم عشري بفاصلة نقطية | الأولى (إلزامي) |
| `5` | إجمالي الضريبة | رقم عشري بفاصلة نقطية | الأولى (إلزامي) |
| `6` | بصمة ملف الفاتورة XML | Base64 (SHA-256) | الثانية (اختياري) |
| `7` | التوقيع الرقمي | Base64 (ECDSA) | الثانية (اختياري) |
| `8` | المفتاح العام للشهادة | Base64 | الثانية (اختياري) |
| `9` | ختم الهيئة | Base64 | بعد التخليص فقط |

## المرحلة الثانية: ما تفعله المكتبة وما لا تفعله

**بصراحة كاملة:** هذه المكتبة تُغلّف الحمولة وتفكّها فقط. هي **لا** تحسب بصمة XML، و**لا**
توقّع، و**لا** تتصل بمنصة فاتورة، و**لا** تدير شهادات CSID. هذه عمليات تعتمد على مخزنك
وشهادتك، فتمرّر ناتجها كما هو:

```ts
const payload = encodeZatcaTlv({
  ...invoice,
  invoiceHash,   // SHA-256 لملف الفاتورة XML بترميز Base64
  signature,     // التوقيع من شهادة CSID
  publicKey,     // المفتاح العام من نفس الشهادة
  // stamp يأتي بعد التخليص، ويُضاف وحده لاحقاً
})
```

وتفرض المكتبة قاعدة المواصفة: العلامات 6 و7 و8 تُقدَّم معاً أو لا تُقدَّم، والختم لا يُقبل بلا
إخوته، لأن ختماً على فاتورة غير موقّعة خطأ بنيوي.

## أخطاء تُرفض لأجلها الفاتورة

| الخطأ | الصواب |
| --- | --- |
| طابع زمني بلا منطقة (`2026-04-18 13:30`) | `2026-04-18T13:30:00+03:00` أو `...Z` |
| فاصلة عشرية عربية (`1150,00`) أو فاصلة آلاف (`1,150.00`) | `1150.00` |
| مبلغ بمنزلة عشرية واحدة (`115`) | `115.00` — استخدم `toZatcaAmount` |
| ترتيب الحقول متعثر | المكتبة ترتّب العلامات تصاعدياً دائماً |
| رقم ضريبي من 14 رقماً | 15 رقماً يبدأ وينتهي بـ3 |

العملة ضمنية في هذا الحقل: الريال السعودي، حتى لو كانت الفاتورة بعملة أخرى في XML.

## جرّبها فوراً

```bash
git clone https://github.com/exeerkit/zatca-qr
cd zatca-qr
python3 -m http.server 8080
# افتح http://localhost:8080/examples/demo.html
```

صفحة تجريبية عربية كاملة: تولّد الرمز، وتفكّكه بايتاً بايتاً أمامك، وتفحص الفاتورة — كل ذلك
في متصفحك بلا إرسال حرف واحد إلى أي خادم.

```bash
node examples/node.mjs   # مثال سطري بلا تثبيت أي شيء
node --test test/        # 38 اختباراً بلا أي تبعية
```

## الاختبارات

المجموعة تعمل بلا تبعيات ولا خطوة بناء، وتشمل فيكتوراً مرجعياً لفاتورة مبسّطة تحققنا منه
بايتاً بايتاً (‏66 بايتاً، العلامات 1→5):

```text
01 0A "Acme Saudi" 02 0F "300000000000003" 03 14 "2026-04-18T10:30:00Z" 04 06 "115.00" 05 05 "15.00"
→ AQpBY21lIFNhdWRpAg8zMDAwMDAwMDAwMDAwMDMDFDIwMjYtMDQtMThUMTA6MzA6MDBaBAYxMTUuMDAFBTE1LjAw
```

وتشمل أيضاً: حدود الطول بالبايتات مع النص العربي، والحمولات المقتطعة، وBase64 غير الصحيح،
والتنبيهات، وتطابق ملف الأنواع مع التنفيذ. أي إضافة تحتاج اختباراً يفشل قبلها.

## الأسئلة الشائعة

**هل تكفي للمرحلة الثانية (الربط)؟**
تُغلّف الحمولة الكاملة وتفكّها، لكن التوقيع والتخليص وإدارة الشهادات خارج نطاقها بحكم التصميم.

**لماذا ESM فقط؟**
لأنها تعمل في المتصفح مباشرة بلا أداة بناء. في بيئة CommonJS استخدم `await import('zatca-qr')`.

**هل ترسل بياناتي إلى خادم؟**
لا. لا يوجد أي اتصال شبكي في المكتبة، ولا حتى لتوليد الرمز نفسه.

**هل أستطيع استخدامها في نظام محاسبي تجاري؟**
نعم، رخصة MIT. ومسؤولية مطابقة فاتورتك للمواصفة تبقى عليك، ولهذا وُجد `validateZatcaInvoice`.

## المراجع

- [دليل ZATCA الفني التفصيلي (PDF)](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf) — المواصفة الأصلية للـTLV وفكّ الرمز.
- [معيار تنفيذ XML للفاتورة الإلكترونية](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20220624_ZATCA_Electronic_Invoice_XML_Implementation_Standard_vF.pdf)
- [بوابة مطوري الهيئة](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/default.aspx)

## الرخصة

MIT — استخدمها في مشروعك التجاري بلا قيود.

---

</div>

<div dir="rtl" align="right">

## من يبني هذا؟

هذه المكتبة وحدة صغيرة من قالب **[VibeIO](https://www.vibeio.dev)** لبناء تطبيقات SaaS عربية:
مصادقة جاهزة، فوترة، دفع، بريد، ووسيط ذكاء اصطناعي — مع `AGENTS.md` يقود وكيلك الذكي داخل
بنية سليمة بدل أن يخمّنها. أُخرجت هذه الوحدة كمصدر مفتوح لأن رمز ZATCA مشكلة يواجهها كل
مطوّر سعودي، ولأن الكود المختبر أفضل إعلان.

إن أعجبتك الدقة هنا، فالأصل كله في [vibeio.dev](https://www.vibeio.dev).

</div>
