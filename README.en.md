# zatca-qr

**ZATCA (Saudi FATOORA) e-invoice QR payloads — zero dependencies, no server, tested against the specification.**

[![npm](https://img.shields.io/npm/v/zatca-qr)](https://www.npmjs.com/package/zatca-qr)
[![CI](https://github.com/Exeerkit/zatca-qr/actions/workflows/ci.yml/badge.svg)](https://github.com/Exeerkit/zatca-qr/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![release](https://img.shields.io/github/v/release/exeerkit/zatca-qr)](https://github.com/exeerkit/zatca-qr/releases)

> The Arabic-first README is the primary one: [README.md](README.md).

## The problem

Every tax invoice in Saudi Arabia must carry a QR payload built as a **TLV** sequence and then
**Base64** encoded. The most common — and hardest to spot — bug is measuring field length in
**characters** instead of **UTF-8 bytes**:

| Seller name | Characters | UTF-8 bytes | Result |
| --- | --- | --- | --- |
| `Acme Saudi` | 10 | 10 | ✅ valid |
| `شركة النخبة` | 10 | 20 | ❌ payload rejected |
| `ش` × 128 | 128 | 256 | ❌ exceeds the 255-byte TLV limit |

This library counts bytes correctly, decodes payloads for verification, and validates the invoice
before you issue it.

## Install

```bash
npm install zatca-qr
# or straight from the repository
npm install github:exeerkit/zatca-qr
```

Zero dependencies. ESM only. Runs in Node 18+, browsers, Cloudflare Workers, Deno and Bun.

## Usage

```ts
import { encodeZatcaTlv, toZatcaAmount, validateZatcaInvoice } from 'zatca-qr'

const invoice = {
  sellerName: 'النخبة Trading Est.',
  vatNumber: '300000000000003',        // 15 digits, starts and ends with 3
  timestamp: new Date(),               // or an ISO 8601 string with a time zone
  totalWithVat: toZatcaAmount(1150),   // '1150.00'
  vatTotal: toZatcaAmount(150),        // '150.00'
}

const report = validateZatcaInvoice(invoice) // errors block, warnings inform
const payload = encodeZatcaTlv(invoice, { strict: true }) // pass to any QR renderer
```

### Verify a payload you received

```ts
import { decodeZatcaTlv } from 'zatca-qr'

const decoded = decodeZatcaTlv(payloadFromScanner)
decoded.phase        // 1 or 2
decoded.data         // { sellerName, vatNumber, timestamp, totalWithVat, vatTotal, ... }
decoded.fields       // each field: tag, name, value, byteLength
decoded.warnings     // duplicate tags, missing required tags, out-of-spec tags
```

## Tags

| Tag | Field | Phase |
| --- | --- | --- |
| `1` | Seller name (UTF-8) | 1 (required) |
| `2` | VAT registration number (15 digits) | 1 (required) |
| `3` | Invoice timestamp (ISO 8601 with zone) | 1 (required) |
| `4` | Invoice total including VAT (dot decimal) | 1 (required) |
| `5` | VAT amount | 1 (required) |
| `6` | Invoice XML hash (Base64 SHA-256) | 2 (optional) |
| `7` | Digital signature (Base64 ECDSA) | 2 (optional) |
| `8` | Public key (Base64) | 2 (optional) |
| `9` | ZATCA stamp | after clearance only |

## Phase 2: what this library does and does not do

It packs and unpacks the payload. It does **not** hash your XML, sign anything, call the FATOORA
platform, or manage CSID certificates — you supply `invoiceHash`, `signature` and `publicKey` from
your own stack. Tags 6, 7 and 8 must be provided together; `stamp` is only accepted alongside them.

## Try it

```bash
git clone https://github.com/exeerkit/zatca-qr
cd zatca-qr
python3 -m http.server 8080   # open http://localhost:8080/examples/demo.html
node examples/node.mjs        # CLI example, nothing to install
node --test             # 38 tests, zero dependencies
```

## References

- [ZATCA detailed technical guideline (PDF)](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf)
- [ZATCA developers portal](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/default.aspx)

## License

MIT. Built by [VibeIO](https://www.vibeio.dev).
