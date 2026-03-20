/**
 * Receipt — Browser-printed thermal receipt (80mm style)
 *
 * Renders a narrow receipt layout and prints via hidden iframe.
 * Works in Tauri WebView without popup.
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtNum(n, lang = 'fr') {
  const loc = lang === 'ar' ? 'ar-DZ' : lang === 'en' ? 'en-US' : 'fr-FR'
  return Number(n || 0).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function printReceipt({ store = {}, sale = {}, labels = {}, client = null, lang = 'fr' } = {}) {
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
    qty:        labels.qty        || 'Qty',
    unitPrice:  labels.unitPrice  || 'Price',
    total:      labels.total      || 'Total',
  }

  const rtl = lang === 'ar'
  const dir = rtl ? 'rtl' : 'ltr'
  const currency = store.currency || 'DA'

  const d = new Date(sale.created_at)
  const dateStr = d.toLocaleDateString(lang === 'ar' ? 'ar-DZ' : lang === 'en' ? 'en-US' : 'fr-FR') +
    '  ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const lines = (sale.lines || []).map(ln => {
    const name = esc(ln.product_name || ln.name || '—')
    const qty = ln.qty ?? 1
    const price = ln.unit_price ?? ln.price ?? 0
    const disc = ln.discount ?? 0
    const total = ln.total_ttc ?? (qty * price * (1 - disc / 100))
    return { name, qty, price, disc, total }
  })

  const totalHT = sale.total_ht ?? sale.total ?? 0
  const totalVAT = (sale.total ?? 0) - (sale.total_ht ?? sale.total ?? 0)
  const totalTTC = sale.total ?? 0
  const paid = sale.amount_paid ?? totalTTC
  const change = sale.change ?? 0

  const html = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    width: 80mm;
    padding: 4mm;
    color: #000;
    direction: ${dir};
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: 16px; font-weight: bold; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .sep2 { border-top: 2px solid #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; line-height: 1.6; }
  .row-right { text-align: ${rtl ? 'left' : 'right'}; }
  .items { width: 100%; margin: 4px 0; }
  .items .item-name { font-weight: 500; }
  .items .item-detail { display: flex; justify-content: space-between; padding-${rtl ? 'right' : 'left'}: 8px; color: #333; font-size: 11px; }
  .total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; padding: 4px 0; }
  .footer { text-align: center; margin-top: 8px; font-size: 11px; color: #555; }
  @media print {
    body { width: 80mm; }
  }
</style>
</head>
<body>

<!-- Store Header -->
<div class="center">
  ${store.logo_url ? `<img src="${esc(store.logo_url)}" style="max-width:50mm;max-height:16mm;margin:0 auto 4px;" />` : ''}
  <div class="big">${esc(store.name || 'Store')}</div>
  ${store.address ? `<div>${esc(store.address)}</div>` : ''}
  ${store.phone ? `<div>Tel: ${esc(store.phone)}</div>` : ''}
</div>

<div class="sep2"></div>

<!-- Date & Cashier -->
<div class="row"><span>${esc(L.date)}</span><span>${esc(dateStr)}</span></div>
${sale.cashier_email ? `<div class="row"><span>${esc(L.cashier)}</span><span>${esc(sale.cashier_email)}</span></div>` : ''}
${client ? `<div class="row"><span>Client</span><span>${esc(client.name)}</span></div>` : ''}

<div class="sep"></div>

<!-- Items -->
<div class="items">
${lines.map(ln => `
  <div class="item-name">${ln.name}</div>
  <div class="item-detail">
    <span>${ln.qty} x ${fmtNum(ln.price, lang)}${ln.disc > 0 ? ` (-${ln.disc}%)` : ''}</span>
    <span>${fmtNum(ln.total, lang)}</span>
  </div>
`).join('')}
</div>

<div class="sep"></div>

<!-- Totals -->
<div class="row"><span>${esc(L.subtotalHT)}</span><span>${fmtNum(totalHT, lang)} ${esc(currency)}</span></div>
${totalVAT > 0 ? `<div class="row"><span>${esc(L.vat)}</span><span>${fmtNum(totalVAT, lang)} ${esc(currency)}</span></div>` : ''}

<div class="sep2"></div>

<div class="total-row"><span>${esc(L.totalTTC)}</span><span>${fmtNum(totalTTC, lang)} ${esc(currency)}</span></div>

<div class="sep"></div>

<div class="row"><span>${esc(L.paid)}</span><span>${fmtNum(paid, lang)} ${esc(currency)}</span></div>
${change > 0 ? `<div class="row"><span>${esc(L.change)}</span><span>${fmtNum(change, lang)} ${esc(currency)}</span></div>` : ''}

<div class="sep2"></div>

<!-- Footer -->
<div class="footer">
  <div>${esc(L.thanks)}</div>
  ${store.rc ? `<div>RC: ${esc(store.rc)}</div>` : ''}
  ${store.nif ? `<div>NIF: ${esc(store.nif)}</div>` : ''}
</div>

</body>
</html>`

  printViaIframe(html)
}

function printViaIframe(html) {
  let iframe = document.getElementById('__print_frame')
  if (iframe) iframe.remove()
  iframe = document.createElement('iframe')
  iframe.id = '__print_frame'
  iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()
  iframe.contentWindow.focus()
  setTimeout(() => {
    iframe.contentWindow.print()
    setTimeout(() => iframe.remove(), 1000)
  }, 300)
}
