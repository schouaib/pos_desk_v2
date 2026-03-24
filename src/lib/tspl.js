/**
 * TSPL (TSC Printer Language) label builder
 *
 * For thermal label printers: TSC, Xprinter, Gainscha, etc.
 * 203 dpi = 8 dots/mm
 * Built-in fonts: "1"=8x12, "2"=12x20, "3"=16x24, "4"=24x32, "5"=32x48
 */

function encode(str) {
  return new TextEncoder().encode(str)
}

// Font char dimensions in dots
const F = {
  '1': { w: 8,  h: 12 },
  '2': { w: 12, h: 20 },
  '3': { w: 16, h: 24 },
  '4': { w: 24, h: 32 },
  '5': { w: 32, h: 48 },
}

/** Text width in dots */
function textW(text, font, xMul = 1) {
  return text.length * (F[font]?.w || 8) * xMul
}

/** Text height in dots */
function textH(font, yMul = 1) {
  return (F[font]?.h || 12) * yMul
}

/** Center X for text on label */
function cx(labelW, text, font, xMul = 1) {
  return Math.max(0, Math.floor((labelW - textW(text, font, xMul)) / 2))
}

/** Format price with space as thousands separator + currency */
function fmtPrice(price, currency = '') {
  const n = Number(price)
  if (isNaN(n)) return String(price)
  const parts = n.toFixed(2).split('.')
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const formatted = parts[1] === '00' ? intPart : `${intPart}.${parts[1]}`
  return currency ? `${formatted} ${currency}` : formatted
}

/** Common header */
function header(wMm, hMm) {
  return `SIZE ${wMm} mm, ${hMm} mm\nGAP 2 mm, 0\nSPEED 4\nDENSITY 8\nDIRECTION 1\nCLS\r\n`
}

/** Escape TSPL strings */
function esc(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 60)
}

export function buildTsplLabel({ model = '45x35', storeName = '', name = '', ref = '', barcode = '', price = '', currency = 'DA', copies = 1 } = {}) {
  switch (model) {
    case '40x20': return build40x20(name, barcode, price, currency, copies, storeName)
    case 'optic': return buildOptic(ref, price, currency, copies)
    case 'bijou': return buildBijou(storeName, name, ref, price, currency, copies)
    default:      return build45x35(storeName, name, barcode, price, currency, copies)
  }
}

/** ────────────────────────────────────────────
 *  45×35mm — Store + Name + Barcode + Price
 *  ──────────────────────────────────────────── */
function build45x35(storeName, name, barcode, price, currency, copies) {
  const W = 360, H = 280
  const GAP = 20
  let cmd = header(45, 35)

  const hasStore = !!storeName
  const nameStr = String(name)
  const isLongName = nameStr.length > 28
  const priceStr = fmtPrice(price, currency)

  // --- Calculate total content height ---
  let totalH = 0
  if (hasStore) totalH += textH('1') + GAP
  if (isLongName) {
    totalH += textH('1') + 4 + textH('1') + GAP
  } else {
    totalH += textH('2') + GAP
  }
  if (barcode) totalH += 55 + 14 + GAP
  totalH += textH('3') // price

  let y = Math.max(4, Math.floor((H - totalH) / 2))

  // --- Store name (font 1 — small) ---
  if (hasStore) {
    const s = String(storeName).slice(0, 40)
    cmd += `TEXT ${cx(W, s, '1')},${y},"1",0,1,1,"${esc(s)}"\r\n`
    y += textH('1') + GAP
  }

  // --- Product name (font 1 long / font 2 short) ---
  if (isLongName) {
    const mid = nameStr.lastIndexOf(' ', 38)
    const split = mid > 5 ? mid : 38
    const line1 = nameStr.slice(0, split).trim()
    const line2 = nameStr.slice(split).trim().slice(0, 38)
    cmd += `TEXT ${cx(W, line1, '1')},${y},"1",0,1,1,"${esc(line1)}"\r\n`
    y += textH('1') + 4
    if (line2) {
      cmd += `TEXT ${cx(W, line2, '1')},${y},"1",0,1,1,"${esc(line2)}"\r\n`
    }
    y += textH('1') + GAP
  } else {
    cmd += `TEXT ${cx(W, nameStr, '2')},${y},"2",0,1,1,"${esc(nameStr)}"\r\n`
    y += textH('2') + GAP
  }

  // --- Barcode ---
  if (barcode) {
    const bcStr = String(barcode).slice(0, 20)
    cmd += `BARCODE ${cx(W, bcStr, '1', 2)},${y},"128",55,1,0,2,3,"${esc(bcStr)}"\r\n`
    y += 55 + 14 + GAP
  }

  // --- Price (font 3, 1x size) ---
  cmd += `TEXT ${cx(W, priceStr, '3')},${y},"3",0,1,1,"${esc(priceStr)}"\r\n`

  cmd += `PRINT ${copies},1\r\n`
  return encode(cmd)
}

/** ────────────────────────────────────────────
 *  40×20mm — Name + Barcode + Price
 *  ──────────────────────────────────────────── */
function build40x20(name, barcode, price, currency, copies, storeName) {
  const W = 320, H = 160
  const GAP = 10
  let cmd = header(40, 20)

  const hasStore = !!storeName
  const nameStr = String(name).slice(0, 34)
  const priceStr = fmtPrice(price, currency)

  // --- Calculate total height ---
  let totalH = 0
  if (hasStore) totalH += textH('1') + GAP
  totalH += textH('1') + GAP // name
  if (barcode) totalH += 35 + 12 + 20 // barcode + text + 2.5mm space
  totalH += textH('3') // price

  let y = Math.max(2, Math.floor((H - totalH) / 2))

  // --- Store name (font 1 — small) ---
  if (hasStore) {
    const s = String(storeName).slice(0, 34)
    cmd += `TEXT ${cx(W, s, '1')},${y},"1",0,1,1,"${esc(s)}"\r\n`
    y += textH('1') + GAP
  }

  // --- Name (font 1 — small) ---
  cmd += `TEXT ${cx(W, nameStr, '1')},${y},"1",0,1,1,"${esc(nameStr)}"\r\n`
  y += textH('1') + GAP

  // --- Barcode ---
  if (barcode) {
    const bcStr = String(barcode).slice(0, 18)
    cmd += `BARCODE ${cx(W, bcStr, '1', 2)},${y},"128",35,1,0,2,2,"${esc(bcStr)}"\r\n`
    y += 35 + 12 + 20 // 2.5mm space after barcode
  }

  // --- Price (font 3, ~3mm height) ---
  cmd += `TEXT ${cx(W, priceStr, '3')},${y},"3",0,1,1,"${esc(priceStr)}"\r\n`

  cmd += `PRINT ${copies},1\r\n`
  return encode(cmd)
}

/** ────────────────────────────────────────────
 *  12×7mm Optic — Ref + Price
 *  ──────────────────────────────────────────── */
function buildOptic(ref, price, currency, copies) {
  const W = 96, H = 56
  const GAP = 4
  let cmd = header(12, 7)

  const priceStr = fmtPrice(price, currency)

  let totalH = 0
  if (ref) totalH += textH('1') + GAP
  totalH += textH('2')

  let y = Math.max(0, Math.floor((H - totalH) / 2))

  if (ref) {
    const refStr = String(ref).slice(0, 10)
    cmd += `TEXT ${cx(W, refStr, '1')},${y},"1",0,1,1,"${esc(refStr)}"\r\n`
    y += textH('1') + GAP
  }

  cmd += `TEXT ${cx(W, priceStr, '2')},${y},"2",0,1,1,"${esc(priceStr)}"\r\n`

  cmd += `PRINT ${copies},1\r\n`
  return encode(cmd)
}

/** ────────────────────────────────────────────
 *  30×20mm Bijou — Store + Name + Ref + Price
 *  ──────────────────────────────────────────── */
function buildBijou(storeName, name, ref, price, currency, copies) {
  const W = 240, H = 160
  const GAP = 6
  let cmd = header(30, 20)

  const nameStr = String(name)
  const isLongName = nameStr.length > 18
  const priceStr = fmtPrice(price, currency)

  // --- Total height ---
  let totalH = 0
  if (storeName) totalH += textH('1') + GAP
  if (isLongName) {
    totalH += textH('1') + 4 + textH('1') + GAP
  } else {
    totalH += textH('2') + GAP
  }
  if (ref) totalH += textH('1') + GAP
  totalH += textH('3')

  let y = Math.max(2, Math.floor((H - totalH) / 2))

  // --- Store ---
  if (storeName) {
    const s = String(storeName).slice(0, 18)
    cmd += `TEXT ${cx(W, s, '1')},${y},"1",0,1,1,"${esc(s)}"\r\n`
    y += textH('1') + GAP
  }

  // --- Name ---
  if (isLongName) {
    const mid = nameStr.lastIndexOf(' ', 22)
    const split = mid > 4 ? mid : 22
    const line1 = nameStr.slice(0, split).trim()
    const line2 = nameStr.slice(split).trim().slice(0, 22)
    cmd += `TEXT ${cx(W, line1, '1')},${y},"1",0,1,1,"${esc(line1)}"\r\n`
    y += textH('1') + 4
    if (line2) {
      cmd += `TEXT ${cx(W, line2, '1')},${y},"1",0,1,1,"${esc(line2)}"\r\n`
      y += textH('1') + GAP
    }
  } else {
    cmd += `TEXT ${cx(W, nameStr, '2')},${y},"2",0,1,1,"${esc(nameStr)}"\r\n`
    y += textH('2') + GAP
  }

  // --- Ref ---
  if (ref) {
    const refStr = String(ref).slice(0, 18)
    cmd += `TEXT ${cx(W, refStr, '1')},${y},"1",0,1,1,"${esc(refStr)}"\r\n`
    y += textH('1') + GAP
  }

  // --- Price (bold, 2x width) ---
  cmd += `TEXT ${cx(W, priceStr, '3', 2)},${y},"3",0,2,1,"${esc(priceStr)}"\r\n`

  cmd += `PRINT ${copies},1\r\n`
  return encode(cmd)
}
