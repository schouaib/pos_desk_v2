const ESC = 0x1B
const GS  = 0x1D
const LF  = 0x0A

// ── Receipt builder ───────────────────────────────────────────────────────────

const WIDTH_80MM = 48  // chars per line on 80 mm paper

/** Encode string to UTF-8 bytes + LF. Supports Arabic, Latin, etc. */
function strLine(text, maxLen = WIDTH_80MM) {
  const s = String(text ?? '').slice(0, maxLen)
  const encoded = new TextEncoder().encode(s)
  const out = Array.from(encoded)
  out.push(LF)
  return out
}

/** Right-pad a string to `width` chars with `padChar` then append value. */
function rowBytes(label, value, width = WIDTH_80MM, padChar = '.') {
  const v = String(value ?? '')
  const pad = Math.max(1, width - label.length - v.length)
  return strLine(label + padChar.repeat(pad) + v, width + 2)
}

/**
 * Build an ESC/POS sales receipt.
 *
 * @param {object} store   { name, address, phone }
 * @param {object} sale    sale document with lines[], total_ht, total, amount_paid, change, cashier_email, created_at
 * @param {object} labels  translated label strings
 * @param {number} width   chars per line (default 48 for 80 mm)
 * @returns {Uint8Array}
 */
export function buildReceipt({ store = {}, sale = {}, labels = {}, width = WIDTH_80MM } = {}) {
  const L = {
    date:       labels.date       || 'Date',
    cashier:    labels.cashier    || 'Cashier',
    subtotalHT: labels.subtotalHT || 'Subtotal HT',
    vat:        labels.vat        || 'VAT',
    totalTTC:   labels.totalTTC   || 'TOTAL TTC',
    timbre:     labels.timbre     || 'Timbre',
    paid:       labels.paid       || 'Paid',
    change:     labels.change     || 'Change',
    discount:   labels.discount   || 'Discount',
    thanks:     labels.thanks     || 'Thank you for your visit!',
  }

  const out = []
  const sep = (ch = '-') => out.push(...strLine(ch.repeat(width)))

  // ── Init ──────────────────────────────────────────────────────────────────
  out.push(ESC, 0x40)          // initialize
  out.push(ESC, 0x74, 0xFF)    // select UTF-8 code page (supported by most modern POS printers)

  // ── Store header ──────────────────────────────────────────────────────────
  out.push(ESC, 0x61, 0x01)   // center
  out.push(ESC, 0x45, 0x01)   // bold on
  out.push(GS,  0x21, 0x01)   // double height
  out.push(...strLine(String(store.name || 'Store').slice(0, Math.floor(width / 2))))
  out.push(GS,  0x21, 0x00)   // normal size
  out.push(ESC, 0x45, 0x00)   // bold off
  if (store.address) out.push(...strLine(String(store.address).slice(0, width)))
  if (store.phone)   out.push(...strLine(('Tel: ' + store.phone).slice(0, width)))
  out.push(LF)

  // ── Sale meta ─────────────────────────────────────────────────────────────
  out.push(ESC, 0x61, 0x00)   // left
  sep('=')
  const d = new Date(sale.created_at)
  const dateStr = L.date + ': ' +
    d.toLocaleDateString() + '  ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  out.push(...strLine(dateStr, width))
  if (sale.cashier_email) {
    out.push(...strLine((L.cashier + ': ' + sale.cashier_email).slice(0, width)))
  }
  sep('=')

  // ── Lines ─────────────────────────────────────────────────────────────────
  for (const l of (sale.lines || [])) {
    out.push(ESC, 0x45, 0x01)  // bold
    out.push(...strLine(String(l.product_name || '').slice(0, width)))
    out.push(ESC, 0x45, 0x00)  // bold off
    const qtyPart = `  ${l.qty} x ${Number(l.unit_price).toFixed(2)}`
    out.push(...rowBytes(qtyPart, Number(l.total_ttc).toFixed(2), width))
    if ((l.discount ?? 0) > 0) {
      out.push(...rowBytes('  ' + L.discount, '-' + Number(l.discount).toFixed(2), width))
    }
  }

  sep('-')

  // ── Totals ────────────────────────────────────────────────────────────────
  out.push(...rowBytes(L.subtotalHT, Number(sale.total_ht).toFixed(2), width))
  const vatAmt = Math.round(((sale.total ?? 0) - (sale.total_ht ?? 0)) * 100) / 100
  if (vatAmt > 0.001) {
    out.push(...rowBytes(L.vat, vatAmt.toFixed(2), width))
  }
  sep('=')
  out.push(ESC, 0x45, 0x01)   // bold
  out.push(...rowBytes(L.totalTTC, Number(sale.total).toFixed(2), width, ' '))
  out.push(ESC, 0x45, 0x00)   // bold off
  if ((sale.timbre ?? 0) > 0) {
    out.push(...rowBytes(L.timbre, Number(sale.timbre).toFixed(2), width))
  }
  sep('=')
  out.push(...rowBytes(L.paid,   Number(sale.amount_paid).toFixed(2), width))
  out.push(...rowBytes(L.change, Math.max(0, sale.change ?? 0).toFixed(2), width))
  out.push(LF)

  // ── Footer ────────────────────────────────────────────────────────────────
  out.push(ESC, 0x61, 0x01)   // center
  out.push(...strLine(String(L.thanks).slice(0, width)))
  out.push(ESC, 0x64, 4)      // feed 4 lines
  out.push(GS,  0x56, 0x42, 0x03)  // partial cut

  return new Uint8Array(out)
}

/**
 * Build an ESC/POS command to open the cash drawer.
 * Uses pin 2 (standard), 100ms on, 100ms off.
 * @returns {Uint8Array}
 */
/**
 * Label models:
 *   'standard' — Full label: store name, product name, barcode, price (80mm thermal)
 *   'optic'    — Tiny 12x7mm label for glasses: just ref + price, minimal feed
 *   'bijou'    — Small jewelry label: store name, ref, price, compact
 */

/**
 * Build ESC/POS barcode label(s).
 *
 * @param {string} model     Label model: 'standard' | 'optic' | 'bijou'
 * @param {string} storeName Store name
 * @param {string} name      Product name
 * @param {string} ref       Product reference
 * @param {string} barcode   Barcode value (CODE128)
 * @param {string|number} price  Price to display
 * @param {number} copies    Number of copies (default 1)
 * @param {number} width     Chars per line (default 48)
 * @returns {Uint8Array}
 */
export function buildBarcodeLabel({ model = 'standard', storeName = '', name = '', ref = '', barcode = '', price = '', copies = 1, width = WIDTH_80MM } = {}) {
  if (model === 'optic') return buildOpticLabel({ ref, price, copies, width })
  if (model === 'bijou') return buildBijouLabel({ storeName, name, ref, price, copies, width })
  if (model === '45x35') return build45x35Label({ name, barcode, price, copies, width })
  if (model === '40x20') return build40x20Label({ name, barcode, price, copies, width })
  return buildStandardLabel({ storeName, name, barcode, price, copies, width })
}

/** Standard label: store name → product name → barcode → price */
function buildStandardLabel({ storeName, name, barcode, price, copies, width }) {
  const out = []
  const productName = String(name)
  const nameIsLong = productName.length > Math.floor(width * 0.6)

  for (let c = 0; c < copies; c++) {
    out.push(ESC, 0x40) // initialize

    // Store name (small font)
    if (storeName) {
      out.push(ESC, 0x61, 0x01) // center
      out.push(ESC, 0x4D, 0x01) // font B
      out.push(...strLine(String(storeName).slice(0, width)))
      out.push(ESC, 0x4D, 0x00) // font A
    }

    out.push(ESC, 0x61, 0x01)
    out.push(...strLine('-'.repeat(Math.min(width, 32))))

    // Product name (auto-shrink)
    out.push(ESC, 0x61, 0x01, ESC, 0x45, 0x01) // center + bold
    if (nameIsLong) {
      out.push(ESC, 0x4D, 0x01) // font B
      const maxChars = Math.floor(width * 1.3)
      if (productName.length > maxChars) {
        const mid = productName.lastIndexOf(' ', maxChars)
        const split = mid > 0 ? mid : maxChars
        out.push(...strLine(productName.slice(0, split).trim()))
        out.push(...strLine(productName.slice(split).trim().slice(0, maxChars)))
      } else {
        out.push(...strLine(productName.slice(0, maxChars)))
      }
      out.push(ESC, 0x4D, 0x00)
    } else {
      out.push(...strLine(productName.slice(0, width)))
    }
    out.push(ESC, 0x45, 0x00) // bold off

    // Barcode
    if (barcode) {
      out.push(LF)
      out.push(GS, 0x68, 0x50) // height 80 dots
      out.push(GS, 0x77, 0x02) // width medium
      out.push(GS, 0x48, 0x02) // HRI below
      out.push(GS, 0x66, 0x01) // HRI font B
      const barcodeBytes = []
      for (const ch of String(barcode)) {
        const code = ch.charCodeAt(0)
        if (code >= 0x20 && code <= 0x7E) barcodeBytes.push(code)
      }
      out.push(GS, 0x6B, 73, barcodeBytes.length, ...barcodeBytes)
      out.push(LF)
    }

    // Price (double size)
    out.push(LF, ESC, 0x61, 0x01, ESC, 0x45, 0x01)
    out.push(GS, 0x21, 0x11) // double w+h
    out.push(...strLine(String(price)))
    out.push(GS, 0x21, 0x00, ESC, 0x45, 0x00)

    // Feed & cut
    out.push(LF, LF, LF)
    if (c < copies - 1) out.push(GS, 0x56, 0x01) // partial cut
  }
  out.push(GS, 0x56, 0x00) // full cut
  return new Uint8Array(out)
}

/**
 * Optic label — 12mm x 7mm for glasses/lunettes
 * Ultra compact: just ref + price, minimal feed
 * Uses smallest font, tight line spacing
 */
function buildOpticLabel({ ref, price, copies, width }) {
  const out = []
  for (let c = 0; c < copies; c++) {
    out.push(ESC, 0x40) // initialize
    // Set minimal line spacing (16 dots = ~2mm)
    out.push(ESC, 0x33, 16)
    // Font B (smaller) for everything
    out.push(ESC, 0x4D, 0x01)
    out.push(ESC, 0x61, 0x01) // center

    // Ref (small, one line)
    if (ref) {
      out.push(...strLine(String(ref).slice(0, 20)))
    }

    // Price (bold, slightly larger — double width only, not height)
    out.push(ESC, 0x45, 0x01) // bold
    out.push(GS, 0x21, 0x10)  // double width only (keeps height small)
    out.push(...strLine(String(price)))
    out.push(GS, 0x21, 0x00)  // normal
    out.push(ESC, 0x45, 0x00)
    out.push(ESC, 0x4D, 0x00) // font A

    // Minimal feed — just enough to clear the label (7mm ≈ 4 lines at 8 dots/line)
    out.push(LF)
    if (c < copies - 1) out.push(GS, 0x56, 0x01)
  }
  out.push(GS, 0x56, 0x00)
  return new Uint8Array(out)
}

/**
 * Bijouterie label — compact jewelry label
 * Store name (tiny) → Product name (tiny) → Ref → Price (bold)
 * Designed for small sticker labels on jewelry
 */
function buildBijouLabel({ storeName, name, ref, price, copies, width }) {
  const out = []
  for (let c = 0; c < copies; c++) {
    out.push(ESC, 0x40) // initialize
    // Tighter line spacing (20 dots ≈ 2.5mm)
    out.push(ESC, 0x33, 20)
    out.push(ESC, 0x61, 0x01) // center

    // Store name (font B, tiny)
    if (storeName) {
      out.push(ESC, 0x4D, 0x01) // font B
      out.push(...strLine(String(storeName).slice(0, 24)))
      out.push(ESC, 0x4D, 0x00)
    }

    // Product name (font B, bold, auto-shrink)
    const prodName = String(name)
    out.push(ESC, 0x4D, 0x01) // font B
    out.push(ESC, 0x45, 0x01) // bold
    if (prodName.length > 24) {
      // Split long name into 2 lines
      const mid = prodName.lastIndexOf(' ', 24)
      const split = mid > 0 ? mid : 24
      out.push(...strLine(prodName.slice(0, split).trim()))
      out.push(...strLine(prodName.slice(split).trim().slice(0, 24)))
    } else {
      out.push(...strLine(prodName.slice(0, 24)))
    }
    out.push(ESC, 0x45, 0x00)
    out.push(ESC, 0x4D, 0x00)

    // Ref (font B, small)
    if (ref) {
      out.push(ESC, 0x4D, 0x01)
      out.push(...strLine(String(ref).slice(0, 20)))
      out.push(ESC, 0x4D, 0x00)
    }

    // Price (bold, double width)
    out.push(ESC, 0x45, 0x01)
    out.push(GS, 0x21, 0x10) // double width only (keeps it compact)
    out.push(...strLine(String(price)))
    out.push(GS, 0x21, 0x00)
    out.push(ESC, 0x45, 0x00)

    // Small feed
    out.push(LF, LF)
    if (c < copies - 1) out.push(GS, 0x56, 0x01)
  }
  out.push(GS, 0x56, 0x00)
  return new Uint8Array(out)
}

/**
 * 45x35mm thermal label: product name + barcode (taller) + price
 */
function build45x35Label({ name, barcode, price, copies, width }) {
  const out = []
  const productName = String(name)
  const nameIsLong = productName.length > Math.floor(width * 0.6)

  for (let c = 0; c < copies; c++) {
    out.push(ESC, 0x40) // init
    out.push(ESC, 0x61, 0x01) // center

    // Product name (bold, auto-shrink)
    out.push(ESC, 0x45, 0x01)
    if (nameIsLong) {
      out.push(ESC, 0x4D, 0x01) // font B
      const max = Math.floor(width * 1.3)
      if (productName.length > max) {
        const mid = productName.lastIndexOf(' ', max)
        const split = mid > 0 ? mid : max
        out.push(...strLine(productName.slice(0, split).trim()))
        out.push(...strLine(productName.slice(split).trim().slice(0, max)))
      } else {
        out.push(...strLine(productName.slice(0, max)))
      }
      out.push(ESC, 0x4D, 0x00)
    } else {
      out.push(...strLine(productName.slice(0, width)))
    }
    out.push(ESC, 0x45, 0x00)

    // Barcode (taller for 45x35)
    if (barcode) {
      out.push(LF)
      out.push(GS, 0x68, 0x5A) // height 90 dots
      out.push(GS, 0x77, 0x02) // width medium
      out.push(GS, 0x48, 0x02) // HRI below
      out.push(GS, 0x66, 0x01) // HRI font B
      const bb = []
      for (const ch of String(barcode)) {
        const code = ch.charCodeAt(0)
        if (code >= 0x20 && code <= 0x7E) bb.push(code)
      }
      out.push(GS, 0x6B, 73, bb.length, ...bb)
      out.push(LF)
    }

    // Price (double size)
    out.push(LF, ESC, 0x61, 0x01, ESC, 0x45, 0x01)
    out.push(GS, 0x21, 0x11)
    out.push(...strLine(String(price)))
    out.push(GS, 0x21, 0x00, ESC, 0x45, 0x00)

    out.push(LF, LF, LF)
    if (c < copies - 1) out.push(GS, 0x56, 0x01)
  }
  out.push(GS, 0x56, 0x00)
  return new Uint8Array(out)
}

/**
 * 40x20mm thermal label: compact name + smaller barcode + price
 */
function build40x20Label({ name, barcode, price, copies, width }) {
  const out = []
  const productName = String(name)

  for (let c = 0; c < copies; c++) {
    out.push(ESC, 0x40) // init
    // Tighter line spacing
    out.push(ESC, 0x33, 22)
    out.push(ESC, 0x61, 0x01) // center

    // Product name (font B, bold, always small)
    out.push(ESC, 0x4D, 0x01) // font B
    out.push(ESC, 0x45, 0x01)
    const max = Math.floor(width * 1.3)
    out.push(...strLine(productName.slice(0, max)))
    out.push(ESC, 0x45, 0x00)
    out.push(ESC, 0x4D, 0x00)

    // Barcode (shorter height for 40x20)
    if (barcode) {
      out.push(GS, 0x68, 0x30) // height 48 dots
      out.push(GS, 0x77, 0x01) // width narrow
      out.push(GS, 0x48, 0x02) // HRI below
      out.push(GS, 0x66, 0x01) // HRI font B
      const bb = []
      for (const ch of String(barcode)) {
        const code = ch.charCodeAt(0)
        if (code >= 0x20 && code <= 0x7E) bb.push(code)
      }
      out.push(GS, 0x6B, 73, bb.length, ...bb)
      out.push(LF)
    }

    // Price (double width only, not height — keeps it compact)
    out.push(ESC, 0x61, 0x01, ESC, 0x45, 0x01)
    out.push(GS, 0x21, 0x10) // double width only
    out.push(...strLine(String(price)))
    out.push(GS, 0x21, 0x00, ESC, 0x45, 0x00)

    out.push(LF, LF)
    if (c < copies - 1) out.push(GS, 0x56, 0x01)
  }
  out.push(GS, 0x56, 0x00)
  return new Uint8Array(out)
}

export function buildCashDrawerKick() {
  // ESC p m t1 t2 — pulse on pin m for t1*2ms on, t2*2ms off
  return new Uint8Array([ESC, 0x70, 0x00, 0x32, 0x32])
}
