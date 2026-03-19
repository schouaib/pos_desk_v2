const ESC = 0x1B
const GS  = 0x1D
const LF  = 0x0A

// ── Receipt builder ───────────────────────────────────────────────────────────

const WIDTH_80MM = 48  // chars per line on 80 mm paper

/**
 * Convert string to printable ASCII bytes + LF (same as label builder).
 * Non-ASCII chars are replaced with '?'.
 */
function strLine(text, maxLen = WIDTH_80MM) {
  const s = String(text ?? '').slice(0, maxLen)
  const out = []
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    out.push(c >= 0x20 && c <= 0x7E ? c : 0x3F)
  }
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
    paid:       labels.paid       || 'Paid',
    change:     labels.change     || 'Change',
    discount:   labels.discount   || 'Discount',
    thanks:     labels.thanks     || 'Thank you for your visit!',
  }

  const out = []
  const sep = (ch = '-') => out.push(...strLine(ch.repeat(width)))

  // ── Init ──────────────────────────────────────────────────────────────────
  out.push(ESC, 0x40)          // initialize

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
export function buildCashDrawerKick() {
  return new Uint8Array([ESC, 0x70, 0x00, 0x32, 0x32])
}
