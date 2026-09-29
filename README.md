<div dir="rtl" align="right">

# zatca-qr

**تولّد رمز QR لفواتير زاتكا السعودية وتقرأه. بدون مكتبات خارجية وبدون خادم.**

![tests](https://img.shields.io/badge/tests-38%20passing-brightgreen.svg)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![release](https://img.shields.io/github/v/release/exeerkit/zatca-qr)](https://github.com/exeerkit/zatca-qr/releases)

</div>

<div dir="rtl" align="right">

## المشكلة

في السعودية كل فاتورة ضريبية لازم يكون عليها رمز QR. الرمز مكتوب بصيغة اسمها **TLV** وبعدها
**Base64**. إذا كان الرمز غلط، نظام المشتري يرفض الفاتورة.

الخطأ المشهور هو حساب طول الحقل بعدد **الحروف**. لكن TLV يحسب الطول بعدد **البايتات**.
الحرف العربي = بايتين. لذلك:

| اسم البائع | عدد الحروف | عدد البايتات | النتيجة |
| --- | --- | --- | --- |
| `Acme Saudi` | 10 | 10 | ✅ سليم |
| `شركة النخبة` | 10 | 20 | ❌ الرمز يُرفض |
| `ش` × 128 | 128 | 256 | ❌ أكبر من حد TLV (255) |

هذه المكتبة تحسب البايتات صح، وتقرأ الرمز لو وصلك من جهة ثانية، وتفحص الفاتورة قبل ما ترسلها.

## التثبيت

```bash
npm install github:exeerkit/zatca-qr   # متاح الآن من المستودع
npm install zatca-qr                   # بعد نشر الحزمة على npm
```

بدون أي مكتبة خارجية. تعمل في Node 18 وأحدث، وفي المتصفح، وفي Cloudflare Workers وDeno وBun.

## الاستخدام

```ts
import { encodeZatcaTlv, toZatcaAmount, validateZatcaInvoice } from 'zatca-qr'

const invoice = {
  sellerName: 'مؤسسة النخبة التجارية',
  vatNumber: '300000000000003',        // 15 رقماً، يبدأ بـ3 وينتهي بـ3
  timestamp: new Date(),               // أو نص ISO 8601 مع منطقة زمنية
  totalWithVat: toZatcaAmount(1150),   // يطلع '1150.00'
  vatTotal: toZatcaAmount(150),        // يطلع '150.00'
}

// 1) افحص الفاتورة قبل الإرسال
const report = validateZatcaInvoice(invoice)
if (!report.valid) throw new Error(report.errors[0].message)

// 2) خذ نص الرمز
const payload = encodeZatcaTlv(invoice, { strict: true })

// 3) حطه في أي مولد QR
```

### مع React

```tsx
import { QRCodeSVG } from 'qrcode.react'
import { encodeZatcaTlv, type ZatcaInvoiceData } from 'zatca-qr'

export function InvoiceQr({ invoice }: { invoice: ZatcaInvoiceData }) {
  return <QRCodeSVG value={encodeZatcaTlv(invoice)} size={220} level="M" />
}
```

### على Cloudflare Workers

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

## اقرأ رمز وصل إليك

تنفع لما تفحص رمز من نظام ثاني، أو تكتشف رمز مكتوب يدوي غلط.

```ts
import { decodeZatcaTlv } from 'zatca-qr'

const decoded = decodeZatcaTlv(payloadFromScanner)
console.log(decoded.phase)            // 1 أو 2
console.log(decoded.data.sellerName)  // 'مؤسسة النخبة التجارية'
console.log(decoded.fields)           // كل حقل مع طوله بالبايتات
console.log(decoded.warnings)         // حقل مكرر؟ حقل ناقص؟ حقول غريبة؟
```

تقرأ المكتبة أيضاً Base64 الآمن للروابط، وترد الرموز الغريبة بدون ما تكسر الباقي.

## جدول الحقول

| الرقم | الحقل | النوع | المرحلة |
| --- | --- | --- | --- |
| `1` | اسم البائع | نص UTF-8 | الأولى (مطلوب) |
| `2` | الرقم الضريبي | 15 رقماً يبدأ وينتهي بـ3 | الأولى (مطلوب) |
| `3` | وقت الفاتورة | ISO 8601 مع منطقة زمنية | الأولى (مطلوب) |
| `4` | الإجمالي مع الضريبة | رقم بفاصلة نقطية | الأولى (مطلوب) |
| `5` | مبلغ الضريبة | رقم بفاصلة نقطية | الأولى (مطلوب) |
| `6` | بصمة ملف الفاتورة | Base64 (SHA-256) | الثانية (اختياري) |
| `7` | التوقيع الرقمي | Base64 (ECDSA) | الثانية (اختياري) |
| `8` | المفتاح العام | Base64 | الثانية (اختياري) |
| `9` | ختم الهيئة | Base64 | بعد الاعتماد فقط |

## المرحلة الثانية: وش تسوي المكتبة وش ما تسوي

**بصراحة:** المكتبة تغلّف الحمولة وتفكها فقط. ما تحسب لك بصمة الملف، وما توقّع، وما تتصل
بهيئة الزكاة. البصمة والتوقيع تجيبهم من شهادتك (CSID) وتعطيها للمكتبة:

```ts
const payload = encodeZatcaTlv({
  ...invoice,
  invoiceHash,   // بصمة ملف الفاتورة XML
  signature,     // التوقيع من شهادة CSID
  publicKey,     // المفتاح العام من نفس الشهادة
  // stamp تضيفه بعد اعتماد الهيئة
})
```

قاعدة بسيطة: الحقول 6 و7 و8 تجي مع بعض. وختم الهيئة ما ينقبل بدونهم.

## أخطاء ترفض الفاتورة

| الغلط | الصح |
| --- | --- |
| وقت بدون منطقة (`2026-04-18 13:30`) | `2026-04-18T13:30:00+03:00` أو `...Z` |
| فاصلة عربية (`1150,00`) أو فاصلة آلاف (`1,150.00`) | `1150.00` |
| مبلغ بدون منزلتين (`115`) | `115.00` استخدم `toZatcaAmount` |
| ترتيب الحقول غلط | المكتبة ترتبها صح دايم |
| رقم ضريبي من 14 رقماً | 15 رقماً يبدأ وينتهي بـ3 |

العملة في هذا الحقل ريال سعودي دايم، حتى لو الفاتورة بعملة ثانية في ملف XML.

## جرّبها

```bash
git clone https://github.com/exeerkit/zatca-qr
cd zatca-qr
python3 -m http.server 8080
# افتح http://localhost:8080/examples/demo.html
```

أو افتح النسخة الجاهزة: <https://exeerkit.github.io/zatca-qr/>

صفحة عربية تولّد الرمز قدامك وتفككه بايت بايت، وكل شي يصير في متصفحك بدون ما يطلع حرف من
جهازك.

```bash
node examples/node.mjs   # مثال سريع بدون تثبيت
node --test        # 38 اختبار بدون مكتبات
```

## الاختبارات

تشغل بدون أي تثبيت. فيها مثال جاهز لفاتورة بسيطة تحققنا منه بايت بايت (66 بايت):

```text
01 0A "Acme Saudi" 02 0F "300000000000003" 03 14 "2026-04-18T10:30:00Z" 04 06 "115.00" 05 05 "15.00"
→ AQpBY21lIFNhdWRpAg8zMDAwMDAwMDAwMDAwMDMDFDIwMjYtMDQtMThUMTA6MzA6MDBaBAYxMTUuMDAFBTE1LjAw
```

وفيه كمان اختبارات لطول الحروف العربية، والرموز المقطوعة، وBase64 الغلط، والتطابق بين
الملفات.

## أسئلة متكررة

**تكفي للمرحلة الثانية؟**
لا. هي تغلّف وتفك الرمز. التوقيع والشهادات شيء ثاني تتعامل معه بنفسك.

**ليش ESM فقط؟**
عشان تشتغل في المتصفح مباشرة بدون أدوات بناء. لو تستخدم CommonJS استخدم `await import('zatca-qr')`.

**ترسل بياناتي لخادم؟**
لا. ما فيها أي اتصال بالنت أصلاً.

**أقدر استخدمها في نظام تجاري؟**
نعم، الرخصة MIT. والتأكد أن فاتورتك مطابقة هو مسؤوليتك، ولهذا موجود `validateZatcaInvoice`.

## المراجع

- [دليل زاتكا الفني (PDF)](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/e-invoicing-detailed-technical-guideline.pdf)
- [بوابة مطوري الهيئة](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/default.aspx)

## الرخصة

MIT. استخدمها كيف ما تبي.

---

</div>

<div dir="rtl" align="right">

## مين اللي سواها؟

هذه المكتبة جزء صغير من قالب **[VibeIO](https://www.vibeio.dev)** لبناء تطبيقات SaaS عربية.
القالب يجهز لك: دخول، فوترة، دفع، بريد، وملف `AGENTS.md` يوجه وكيلك الذكي.

حطيناها مفتوحة المصدر لأن مشكلة رمز زاتكا تواجه كل مطور سعودي. إذا عجبك الكود هنا، الأصل
كله في [vibeio.dev](https://www.vibeio.dev).

</div>
