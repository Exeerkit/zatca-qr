/**
 * اختبار العقد: يضمن أن ملف التعريفات index.d.ts مطابق للتنفيذ فعلاً.
 * Contract test: keeps the hand-written type definitions from drifting.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import * as api from '../src/index.js'

const declarations = readFileSync(new URL('../src/index.d.ts', import.meta.url), 'utf8')
const runtimeDeclarations = [
  ...declarations.matchAll(/export declare (?:function|class|const)\s+(\w+)/g),
].map((match) => match[1])

test('كل تصدير مذكور في التعريفات موجود في التنفيذ', () => {
  assert.ok(runtimeDeclarations.length >= 7, 'التعريفات يجب أن تُصدّر الواجهة العامة')
  for (const name of runtimeDeclarations) {
    assert.ok(name in api, `التعريف يذكر "${name}" وهو غير مُصدَّر من التنفيذ`)
  }
})

test('لا تصدير في التنفيذ خارج التعريفات', () => {
  const declared = new Set(runtimeDeclarations)
  for (const name of Object.keys(api)) {
    assert.ok(declared.has(name), `"${name}" مُصدَّر من التنفيذ بلا تعريف في index.d.ts`)
  }
})

test('أرقام العلامات في المكتبة مطابقة للمواصفة', () => {
  assert.deepEqual(api.ZATCA_TAGS, {
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
})
