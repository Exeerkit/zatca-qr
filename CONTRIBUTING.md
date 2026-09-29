<div dir="rtl" align="right">

# المساهمة في zatca-qr

## قواعد ثابتة

1. **صفر تبعيات.** لا تُضِف حزمة إنتاجية ولا أداة بناء. المكتبة يجب أن تعمل بـ`node --test`
   مباشرة، وبلا `npm install`.
2. **كل سلوك له اختبار يفشل قبل الإصلاح.** أضف الحالة في `test/` أولاً، ثم أصلح.
3. **الالتزام بالمواصفة.** أي قاعدة جديدة تحتاج إشارة إلى مصدرها من وثائق الهيئة في وصف
   الطلب، لا إلى «هكذا رأيت في تطبيق آخر».
4. **الطول بالبايتات دائماً.** أي تعامل مع النص يمرّ عبر `TextEncoder`، ولا يُستعمل
   `String.length` في حساب TLV.
5. **`src/index.d.ts` جزء من الكود.** أي تغيير في الواجهة العامة يُحدّثه في نفس الطلب؛
   واختبار `test/exports.test.mjs` يفشل إن تباعدا.

## قبل أن تفتح طلب دمج

```bash
node --test        # يجب أن تمر كلها
node examples/node.mjs   # يجب أن يعمل المثال
```

## نطاق مقبول

مُرحَّب به: تصحيح قواعد المواصفة، تحسين رسائل الأخطاء، حالات حدّية جديدة، تحسين الصفحة
التجريبية، ترجمة التوثيق.

خارج النطاق: التوقيع الرقمي، إدارة شهادات CSID، الاتصال بمنصة فاتورة: هذه طبقات أخرى لا
تنتمي إلى مكتبة تغليف الحمولة.

</div>

---

# Contributing to zatca-qr

Hard rules: **zero dependencies**, no build step (`node --test` must work with no install), every
behaviour needs a failing test first, every specification rule needs a citation in the issue, byte
lengths always go through `TextEncoder`, and `src/index.d.ts` must stay in sync with the runtime
exports (enforced by `test/exports.test.mjs`).

Out of scope by design: digital signing, CSID certificate management, and FATOORA API calls.
