/**
 * اختبار التوثيق: يمنع أن يضيف أحد رمز خطأ في الكود وينسى توثيقه، أو العكس.
 * Documentation test: keeps the published error-code table in sync with the code.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

/** كل الرموز تحتوي شرطة سفلية، وهذا يفصلها عن أسماء الأنواع مثل CSID أو TLV. */
const inSource = new Set(
  [...source.matchAll(/'([A-Z][A-Z0-9]*_[A-Z0-9_]+)'/g)].map((match) => match[1]),
)
const inReadme = new Set(
  [...readme.matchAll(/`([A-Z][A-Z0-9]*_[A-Z0-9_]+)`/g)].map((match) => match[1]),
)

test('كل رمز خطأ أو تنبيه في الكود موثّق في README', () => {
  assert.ok(inSource.size >= 15, 'استخراج الرموز من المصدر لم ينجح')
  const missing = [...inSource].filter((code) => !inReadme.has(code))
  assert.deepEqual(missing, [], `رموز بلا توثيق في README: ${missing.join(', ')}`)
})

test('التوثيق لا يذكر رموزاً غير موجودة في الكود', () => {
  const unknown = [...inReadme].filter((code) => !inSource.has(code))
  assert.deepEqual(unknown, [], `رموز موثّقة وغير موجودة في الكود: ${unknown.join(', ')}`)
})
