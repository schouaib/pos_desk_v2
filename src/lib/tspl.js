/**
 * TSPL (TSC Printer Language) label builder
 *
 * For thermal label printers: TSC, Xprinter, Gainscha, etc.
 * Sends text-based commands via raw printing (Tauri print_raw).
 *
 * TSPL reference: https://www.tscprinters.com/EN/DownloadFile/TSPL_TSPL2
 */

function encode(str) {
  const encoder = new TextEncoder()
  return encoder.encode(str)
}

/**
 * Build TSPL label commands.
 *
 * @param {string} model     '45x35' | '40x20' | 'optic' | 'bijou'
 * @param {string} storeName Store name
 * @param {string} name      Product name
 * @param {string} ref       Product reference
 * @param {string} barcode   Barcode value
 * @param {string|number} price  Price to display
 * @param {number} copies    Number of copies
 * @returns {Uint8Array}
 */
export function buildTsplLabel({ model = '45x35', storeName = '', name = '', ref = '', barcode = '', price = '', copies = 1 } = {}) {
  switch (model) {
    case '40x20': return build40x20(name, barcode, price, copies)
    case 'optic': return buildOptic(ref, price, copies)
    case 'bijou': return buildBijou(storeName, name, ref, price, copies)
    default:      return build45x35(storeName, name, barcode, price, copies)
  }
}

/** 45×35mm — Store name + product name + barcode + price */
function build45x35(storeName, name, barcode, price, copies) {
  // Size in mm, gap between labels
  let cmd = `SIZE 45 mm, 35 mm\n`
  cmd += `GAP 2 mm, 0\n`
  cmd += `DIRECTION 1\n`
  cmd += `CLS\n`

  // All coordinates in dots (203 dpi = 8 dots/mm)
  // Label area: 360 x 280 dots

  let y = 8

  // Store name (small, centered)
  if (storeName) {
    const storeX = Math.max(0, Math.floor((360 - storeName.length * 8) / 2))
    cmd += `TEXT ${storeX},${y},"1",0,1,1,"${tsplEsc(storeName)}"\n`
    y += 20
  }

  // Product name (bold, centered, auto-size)
  const nameStr = String(name)
  if (nameStr.length > 24) {
    // Long name: smaller font "2", split into 2 lines
    const mid = nameStr.lastIndexOf(' ', 30)
    const split = mid > 0 ? mid : 30
    const line1 = nameStr.slice(0, split).trim()
    const line2 = nameStr.slice(split).trim().slice(0, 30)
    const x1 = Math.max(0, Math.floor((360 - line1.length * 10) / 2))
    const x2 = Math.max(0, Math.floor((360 - line2.length * 10) / 2))
    cmd += `TEXT ${x1},${y},"2",0,1,1,"${tsplEsc(line1)}"\n`
    y += 22
    cmd += `TEXT ${x2},${y},"2",0,1,1,"${tsplEsc(line2)}"\n`
    y += 24
  } else {
    // Normal name: font "3" (larger)
    const nameX = Math.max(0, Math.floor((360 - nameStr.length * 12) / 2))
    cmd += `TEXT ${nameX},${y},"3",0,1,1,"${tsplEsc(nameStr)}"\n`
    y += 30
  }

  // Barcode (CODE128, centered)
  if (barcode) {
    const bcWidth = Math.min(320, barcode.length * 14 + 40)
    const bcX = Math.floor((360 - bcWidth) / 2)
    cmd += `BARCODE ${bcX},${y},"128",70,1,0,2,4,"${tsplEsc(barcode)}"\n`
    y += 90
  }

  // Price (large, bold, centered)
  const priceStr = String(price)
  const priceX = Math.max(0, Math.floor((360 - priceStr.length * 18) / 2))
  cmd += `TEXT ${priceX},${y},"4",0,2,2,"${tsplEsc(priceStr)}"\n`

  cmd += `PRINT ${copies},1\n`

  return encode(cmd)
}

/** 40×20mm — Compact: name + barcode + price */
function build40x20(name, barcode, price, copies) {
  let cmd = `SIZE 40 mm, 20 mm\n`
  cmd += `GAP 2 mm, 0\n`
  cmd += `DIRECTION 1\n`
  cmd += `CLS\n`

  // 320 x 160 dots
  let y = 4

  // Product name (small font "1")
  const nameStr = String(name).slice(0, 30)
  const nameX = Math.max(0, Math.floor((320 - nameStr.length * 8) / 2))
  cmd += `TEXT ${nameX},${y},"1",0,1,1,"${tsplEsc(nameStr)}"\n`
  y += 18

  // Barcode (shorter)
  if (barcode) {
    const bcWidth = Math.min(280, barcode.length * 12 + 30)
    const bcX = Math.floor((320 - bcWidth) / 2)
    cmd += `BARCODE ${bcX},${y},"128",45,1,0,1,3,"${tsplEsc(barcode)}"\n`
    y += 62
  }

  // Price (bold)
  const priceStr = String(price)
  const priceX = Math.max(0, Math.floor((320 - priceStr.length * 16) / 2))
  cmd += `TEXT ${priceX},${y},"3",0,2,1,"${tsplEsc(priceStr)}"\n`

  cmd += `PRINT ${copies},1\n`

  return encode(cmd)
}

/** Optic 12×7mm — Tiny: ref + price only */
function buildOptic(ref, price, copies) {
  let cmd = `SIZE 12 mm, 7 mm\n`
  cmd += `GAP 2 mm, 0\n`
  cmd += `DIRECTION 1\n`
  cmd += `CLS\n`

  // 96 x 56 dots
  // Ref (tiny font "1")
  if (ref) {
    const refStr = String(ref).slice(0, 12)
    const refX = Math.max(0, Math.floor((96 - refStr.length * 8) / 2))
    cmd += `TEXT ${refX},2,"1",0,1,1,"${tsplEsc(refStr)}"\n`
  }

  // Price (font "2", bold, centered)
  const priceStr = String(price)
  const priceX = Math.max(0, Math.floor((96 - priceStr.length * 10) / 2))
  cmd += `TEXT ${priceX},${ref ? 22 : 12},"2",0,1,1,"${tsplEsc(priceStr)}"\n`

  cmd += `PRINT ${copies},1\n`

  return encode(cmd)
}

/** Bijouterie — Compact: store + name + ref + price */
function buildBijou(storeName, name, ref, price, copies) {
  let cmd = `SIZE 30 mm, 20 mm\n`
  cmd += `GAP 2 mm, 0\n`
  cmd += `DIRECTION 1\n`
  cmd += `CLS\n`

  // 240 x 160 dots
  let y = 4

  // Store name (tiny)
  if (storeName) {
    const storeStr = String(storeName).slice(0, 20)
    const storeX = Math.max(0, Math.floor((240 - storeStr.length * 8) / 2))
    cmd += `TEXT ${storeX},${y},"1",0,1,1,"${tsplEsc(storeStr)}"\n`
    y += 18
  }

  // Product name (font "2", auto-shrink)
  const nameStr = String(name)
  if (nameStr.length > 20) {
    // 2 lines, font "1"
    const mid = nameStr.lastIndexOf(' ', 24)
    const split = mid > 0 ? mid : 24
    const line1 = nameStr.slice(0, split).trim()
    const line2 = nameStr.slice(split).trim().slice(0, 24)
    const x1 = Math.max(0, Math.floor((240 - line1.length * 8) / 2))
    const x2 = Math.max(0, Math.floor((240 - line2.length * 8) / 2))
    cmd += `TEXT ${x1},${y},"1",0,1,1,"${tsplEsc(line1)}"\n`
    y += 16
    cmd += `TEXT ${x2},${y},"1",0,1,1,"${tsplEsc(line2)}"\n`
    y += 18
  } else {
    const nameX = Math.max(0, Math.floor((240 - nameStr.length * 10) / 2))
    cmd += `TEXT ${nameX},${y},"2",0,1,1,"${tsplEsc(nameStr)}"\n`
    y += 24
  }

  // Ref (tiny)
  if (ref) {
    const refStr = String(ref).slice(0, 20)
    const refX = Math.max(0, Math.floor((240 - refStr.length * 8) / 2))
    cmd += `TEXT ${refX},${y},"1",0,1,1,"${tsplEsc(refStr)}"\n`
    y += 18
  }

  // Price (bold, larger)
  const priceStr = String(price)
  const priceX = Math.max(0, Math.floor((240 - priceStr.length * 16) / 2))
  cmd += `TEXT ${priceX},${y},"3",0,2,1,"${tsplEsc(priceStr)}"\n`

  cmd += `PRINT ${copies},1\n`

  return encode(cmd)
}

/** Escape special characters for TSPL strings */
function tsplEsc(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .slice(0, 60)
}
