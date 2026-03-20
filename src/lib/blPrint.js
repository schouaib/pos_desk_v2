/**
 * Bon de Livraison — A4 HTML printer (enhanced)
 *
 * Opens a new browser window with the formatted BL and triggers window.print().
 * No external dependencies — uses inline CSS only.
 * Supports RTL layout when lang === 'ar'.
 *
 * Usage:
 *   import { printBL } from './blPrint'
 *   printBL({ store, sale, labels, lang })
 */

/** Format a BL number from a sale */
function blNumber(sale) {
  const d = new Date(sale.created_at)
  const ymd = d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  const suffix = String(sale.id || '').slice(-6).toUpperCase()
  return `BL-${ymd}-${suffix}`
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(n, lang) {
  if (lang === 'ar') {
    return Number(n ?? 0).toLocaleString('ar-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return Number(n ?? 0).toFixed(2)
}


/**
 * Build and print an A4 Bon de Livraison.
 *
 * @param {object} store    { name, address, phone, logo_url, brand_color, rc, nif, nis, nart, compte_rib, currency }
 * @param {object} sale     { id, lines[], total_ht, total_vat, total, amount_paid, change, cashier_email, payment_method, created_at }
 * @param {object} labels   Translated strings (see defaults inside)
 * @param {object} client   Optional client: { name, address, phone, rc, nif, nis, nart, compte_rib }
 * @param {string} lang     Language code ('fr', 'en', 'ar') — controls RTL layout
 */
export function printBL({ store = {}, sale = {}, labels = {}, client = null, lang = 'fr' } = {}) {
  const accent      = '#000000'
  const accentLight = '#f0f0f0'
  const accentMid   = '#cccccc'
  const rtl = lang === 'ar'
  const dir = rtl ? 'rtl' : 'ltr'
  const locale = rtl ? 'ar-DZ' : lang === 'en' ? 'en-US' : 'fr-FR'
  const start = rtl ? 'right' : 'left'
  const end = rtl ? 'left' : 'right'

  const L = {
    title:            labels.title            || 'BON DE LIVRAISON',
    blNum:            labels.blNum            || 'N°',
    date:             labels.date             || 'Date',
    cashier:          labels.cashier          || 'Caissier',
    paymentMethod:    labels.paymentMethod    || 'Mode de paiement',
    colNum:           labels.colNum           || 'N°',
    colDesignation:   labels.colDesignation   || 'Désignation',
    colQty:           labels.colQty           || 'Qté',
    colUnitHT:        labels.colUnitHT        || 'P.U HT',
    colDiscount:      labels.colDiscount      || 'Remise',
    colTotalHT:       labels.colTotalHT       || 'Total HT',
    colVAT:           labels.colVAT           || 'TVA %',
    colTotalTTC:      labels.colTotalTTC      || 'Total TTC',
    subtotalHT:       labels.subtotalHT       || 'Sous-total HT',
    vat:              labels.vat              || 'TVA',
    totalTTC:         labels.totalTTC         || 'TOTAL TTC',
    paid:             labels.paid             || 'Montant reçu',
    change:           labels.change           || 'Monnaie rendue',
    signatureSeller:  labels.signatureSeller  || 'Signature vendeur',
    signatureClient:  labels.signatureClient  || 'Bon pour accord / Signature client',
    datePlace:        labels.datePlace        || 'Date et lieu :',
    itemsCount:       labels.itemsCount       || 'Total articles',
    currency:         store.currency          || 'DA',
  }

  const d = new Date(sale.created_at || new Date())
  const dateStr = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  // VAT breakdown
  const vatMap = {}
  for (const l of (sale.lines || [])) {
    if ((l.vat ?? 0) > 0) {
      const lineHT = Math.max(0, l.qty * l.unit_price - (l.discount ?? 0))
      vatMap[l.vat] = (vatMap[l.vat] || 0) + lineHT * l.vat / 100
    }
  }

  const totalItems = (sale.lines || []).reduce((s, l) => s + (l.qty || 0), 0)

  // Lines HTML
  const linesHTML = (sale.lines || []).map((l, i) => {
    const lineHT  = Math.max(0, l.qty * l.unit_price - (l.discount ?? 0))
    const lineTTC = lineHT * (1 + (l.vat ?? 0) / 100)
    const evenBg  = i % 2 === 1 ? `style="background:${accentLight}"` : ''
    return `
      <tr ${evenBg}>
        <td style="text-align:center;color:#666">${i + 1}</td>
        <td>
          <span style="font-weight:600">${esc(l.product_name)}</span>
          ${l.barcode ? `<br><span style="font-size:9.5px;color:#888;font-family:monospace">${esc(l.barcode)}</span>` : ''}
          ${l.ref    ? `<span style="font-size:9.5px;color:#aaa"> · ${esc(l.ref)}</span>` : ''}
        </td>
        <td style="text-align:center;font-weight:600">${esc(l.qty)}</td>
        <td style="text-align:${end};font-family:monospace">${fmt(l.unit_price, lang)}</td>
        <td style="text-align:${end};font-family:monospace;color:#c0392b">${(l.discount ?? 0) > 0 ? '−' + fmt(l.discount, lang) : '<span style="color:#ccc">—</span>'}</td>
        <td style="text-align:${end};font-family:monospace">${fmt(lineHT, lang)}</td>
        <td style="text-align:center;font-size:10px">${(l.vat ?? 0) > 0 ? `<span style="background:${accentMid};color:${accent};padding:1px 4px;border-radius:3px;font-weight:600">${l.vat}%</span>` : '<span style="color:#ccc">—</span>'}</td>
        <td style="text-align:${end};font-family:monospace;font-weight:700">${fmt(lineTTC, lang)}</td>
      </tr>`
  }).join('')

  // VAT breakdown rows
  const vatRowsHTML = Object.entries(vatMap).map(([rate, amount]) => `
    <tr>
      <td style="text-align:${end};padding:2px 10px;color:#666">${L.vat} ${rate}%</td>
      <td style="text-align:${end};padding:2px 10px;font-family:monospace">${fmt(amount, lang)} ${esc(L.currency)}</td>
    </tr>`).join('')

  // Legal registration grid
  const legalPairs = [
    store.rc   && ['RC',   store.rc],
    store.nif  && ['NIF',  store.nif],
    store.nis  && ['NIS',  store.nis],
    store.nart && ['NART', store.nart],
  ].filter(Boolean)

  const legalGridHTML = legalPairs.length > 0 ? `
    <div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px">
      ${legalPairs.map(([k, v]) => `
        <span style="font-size:10px;color:#555">
          <span style="font-weight:700;color:#333">${esc(k)}</span> ${esc(v)}
        </span>`).join('')}
    </div>` : ''

  // Client "Bill To" block
  const clientLegal = client ? [
    client.rc   && `<span style="font-weight:700">RC</span> ${esc(client.rc)}`,
    client.nif  && `<span style="font-weight:700">NIF</span> ${esc(client.nif)}`,
    client.nis  && `<span style="font-weight:700">NIS</span> ${esc(client.nis)}`,
    client.nart && `<span style="font-weight:700">N° Art.</span> ${esc(client.nart)}`,
  ].filter(Boolean) : []

  const clientBlockHTML = client ? `
    <div style="border:1px solid #e0e0e0;border-radius:5px;padding:8px 12px;font-size:10.5px;min-width:160px;max-width:220px">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#999;margin-bottom:5px">${rtl ? 'فاتورة إلى' : 'Facturé à'}</div>
      <div style="font-weight:700;font-size:12px;color:#1a1a1a;margin-bottom:3px">${esc(client.name || '')}</div>
      ${client.address ? `<div style="color:#555">${esc(client.address)}</div>` : ''}
      ${client.phone   ? `<div style="color:#555">${rtl ? 'الهاتف' : 'Tél'} : ${esc(client.phone)}</div>` : ''}
      ${clientLegal.length > 0 ? `<div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:2px 10px;color:#555">${clientLegal.map(l => `<span>${l}</span>`).join('')}</div>` : ''}
      ${client.compte_rib ? `<div style="margin-top:4px;color:#555"><span style="font-weight:700">RIB</span> ${esc(client.compte_rib)}</div>` : ''}
    </div>` : ''

  // Logo
  const logoHTML = store.logo_url ? `
    <div style="flex-shrink:0;${rtl ? 'margin-left' : 'margin-right'}:14px">
      <img src="${esc(store.logo_url)}" alt="logo"
           style="max-height:56px;max-width:120px;object-fit:contain;display:block">
    </div>` : ''

  // Payment method label
  const pmLabel = rtl
    ? (sale.payment_method === 'card' ? 'بطاقة بنكية'
      : sale.payment_method === 'cheque' ? 'شيك'
      : sale.payment_method === 'virement' ? 'تحويل'
      : 'نقداً')
    : (sale.payment_method === 'card' ? 'Carte bancaire'
      : sale.payment_method === 'cheque' ? 'Chèque'
      : sale.payment_method === 'virement' ? 'Virement'
      : 'Espèces')

  // Footer legal columns
  const footerLegal = [
    store.rc   && `RC : ${esc(store.rc)}`,
    store.nif  && `NIF : ${esc(store.nif)}`,
    store.nis  && `NIS : ${esc(store.nis)}`,
    store.nart && `NART : ${esc(store.nart)}`,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ')

  const footerRIB = store.compte_rib
    ? `<div style="margin-top:2px">RIB : <strong>${esc(store.compte_rib)}</strong></div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="${esc(lang)}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${esc(L.title)} — ${blNumber(sale)}</title>${rtl ? `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet">` : ''}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${rtl ? "'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif" : "'Segoe UI', Arial, Helvetica, sans-serif"};
      font-size: 11.5px;
      color: #1a1a1a;
      background: #f0f0f0;
      direction: ${dir};
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 10mm 13mm 12mm;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #fff;
      box-shadow: 0 2px 12px rgba(0,0,0,.12);
    }

    /* ── Top accent bar ── */
    .top-bar {
      height: 5px;
      background: ${accent};
      border-radius: 2px 2px 0 0;
      margin: -10mm -13mm 0;
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 10px;
      border-bottom: 1.5px solid #e0e0e0;
    }
    .header-left {
      display: flex;
      align-items: flex-start;
      flex: 1;
    }
    .store-name {
      font-size: 19px;
      font-weight: 800;
      color: ${accent};
      letter-spacing: 0.3px;
      margin-bottom: 3px;
    }
    .store-sub {
      font-size: 10.5px;
      color: #555;
      line-height: 1.55;
    }

    /* ── Document box (right side) ── */
    .doc-box {
      min-width: 170px;
      ${rtl ? 'border-right' : 'border-left'}: 4px solid ${accent};
      ${rtl ? 'padding-right' : 'padding-left'}: 10px;
      text-align: ${end};
    }
    .doc-title {
      font-size: 15px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: ${accent};
      margin-bottom: 6px;
    }
    .doc-meta { font-size: 10.5px; }
    .doc-meta tr td { padding: 1.5px 0; }
    .doc-meta tr td:first-child { color: #777; ${rtl ? 'padding-left' : 'padding-right'}: 10px; font-weight: 600; }
    .doc-meta tr td:last-child  { font-family: monospace; font-size: 11px; text-align:${end}; }
    .bl-num-val {
      font-size: 12.5px;
      font-weight: 800;
      color: #1a1a1a;
    }

    /* ── Items table ── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .items-table thead tr {
      background: ${accent};
      color: #fff;
    }
    .items-table th {
      padding: 5.5px 7px;
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      white-space: nowrap;
    }
    .items-table td {
      padding: 5px 7px;
      border-bottom: 1px solid #ebebeb;
      vertical-align: middle;
    }
    .items-table tbody tr:last-child td { border-bottom: none; }

    /* summary row */
    .items-table .summary-row td {
      background: ${accentLight};
      border-top: 1.5px solid ${accentMid};
      font-size: 10.5px;
      color: #555;
      padding: 4px 7px;
    }

    /* ── Bottom section (totals + notes) ── */
    .bottom-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-top: 2px;
    }
    .notes-col {
      flex: 1;
      font-size: 10.5px;
      color: #666;
    }
    .payment-badge {
      display: inline-block;
      background: ${accentLight};
      color: ${accent};
      border: 1px solid ${accentMid};
      border-radius: 4px;
      padding: 3px 8px;
      font-weight: 700;
      font-size: 10.5px;
      margin-top: 4px;
    }

    .totals-box {
      min-width: 260px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      overflow: hidden;
    }
    .totals-inner { width: 100%; border-collapse: collapse; }
    .totals-inner td { padding: 4px 12px; font-size: 11px; }
    .totals-inner .lbl { color: #666; text-align: ${end}; }
    .totals-inner .val { font-family: monospace; text-align: ${end}; font-weight: 600; }
    .totals-inner .divider td { border-top: 1px solid #e8e8e8; }
    .totals-inner .grand-total {
      background: ${accent};
      color: #fff;
    }
    .totals-inner .grand-total td { padding: 7px 12px; font-size: 13px; font-weight: 800; }
    .totals-inner .grand-total .lbl { color: rgba(255,255,255,.8); }
    .totals-inner .grand-total .val { font-size: 14px; letter-spacing: 0.3px; }
    .totals-inner .payment-row td { background: ${accentLight}; font-size: 10.5px; }

    /* ── Signatures ── */
    .signatures {
      display: flex;
      gap: 16px;
      margin-top: auto;
      padding-top: 10px;
    }
    .sig-box {
      flex: 1;
      border: 1px solid #d0d0d0;
      border-top: 3px solid ${accent};
      border-radius: 0 0 5px 5px;
      padding: 8px 12px 12px;
      min-height: 72px;
    }
    .sig-label {
      font-weight: 700;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: ${accent};
      margin-bottom: 8px;
    }
    .sig-dateline {
      margin-top: 18px;
      font-size: 10px;
      color: #aaa;
      border-top: 1px dashed #ddd;
      padding-top: 4px;
    }

    /* ── Footer ── */
    .footer {
      border-top: 1.5px solid #e0e0e0;
      padding-top: 7px;
      font-size: 9.5px;
      color: #888;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .footer-center { text-align: center; flex: 1; }
    .footer-right  { text-align: ${end}; }
    .bl-num-footer {
      font-family: monospace;
      font-size: 10px;
      font-weight: 700;
      color: #bbb;
    }

    /* ── Bottom accent bar ── */
    .bottom-bar {
      height: 4px;
      background: linear-gradient(to ${rtl ? 'left' : 'right'}, ${accent}, ${accentMid});
      border-radius: 0 0 2px 2px;
      margin: 0 -13mm -12mm;
    }

    @media print {
      body { background: #fff; }
      .page { box-shadow: none; margin: 0; padding: 8mm 12mm 10mm; }
      @page { size: A4 portrait; margin: 0; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── Top accent bar ──────────────────────────────────────────── -->
  <div class="top-bar"></div>

  <!-- ── Header ──────────────────────────────────────────────────── -->
  <div class="header">
    <div class="header-left">
      ${logoHTML}
      <div>
        <div class="store-name">${esc(store.name || (rtl ? 'الشركة' : 'Société'))}</div>
        <div class="store-sub">
          ${store.address ? `<div>${esc(store.address)}</div>` : ''}
          ${store.phone   ? `<div>${rtl ? 'الهاتف' : 'Tél'} : ${esc(store.phone)}</div>` : ''}
        </div>
        ${legalGridHTML}
      </div>
    </div>

    ${clientBlockHTML}

    <div class="doc-box">
      <div class="doc-title">${esc(L.title)}</div>
      <table class="doc-meta">
        <tr>
          <td>${esc(L.blNum)}</td>
          <td class="bl-num-val">${esc(blNumber(sale))}</td>
        </tr>
        <tr>
          <td>${esc(L.date)}</td>
          <td>${esc(dateStr)}&nbsp; ${esc(timeStr)}</td>
        </tr>
        ${sale.cashier_email ? `<tr><td>${esc(L.cashier)}</td><td>${esc(sale.cashier_email)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <!-- ── Items table ─────────────────────────────────────────────── -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:28px;text-align:center">${esc(L.colNum)}</th>
        <th style="text-align:${start}">${esc(L.colDesignation)}</th>
        <th style="width:48px;text-align:center">${esc(L.colQty)}</th>
        <th style="width:72px;text-align:${end}">${esc(L.colUnitHT)}</th>
        <th style="width:64px;text-align:${end}">${esc(L.colDiscount)}</th>
        <th style="width:72px;text-align:${end}">${esc(L.colTotalHT)}</th>
        <th style="width:50px;text-align:center">${esc(L.colVAT)}</th>
        <th style="width:78px;text-align:${end}">${esc(L.colTotalTTC)}</th>
      </tr>
    </thead>
    <tbody>
      ${linesHTML || `<tr><td colspan="8" style="text-align:center;padding:14px;color:#aaa">—</td></tr>`}
      <tr class="summary-row">
        <td colspan="2" style="text-align:${end}">${esc(L.itemsCount)}</td>
        <td style="text-align:center;font-weight:700;color:#333">${totalItems}</td>
        <td colspan="5"></td>
      </tr>
    </tbody>
  </table>

  <!-- ── Bottom section ──────────────────────────────────────────── -->
  <div class="bottom-section">
    <!-- Notes / Payment -->
    <div class="notes-col">
      <div style="font-size:10.5px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px">${esc(L.paymentMethod)}</div>
      <div class="payment-badge">${esc(pmLabel)}</div>
    </div>

    <!-- Totals box -->
    <div class="totals-box">
      <table class="totals-inner">
        <tr>
          <td class="lbl">${esc(L.subtotalHT)}</td>
          <td class="val">${fmt(sale.total_ht, lang)} ${esc(L.currency)}</td>
        </tr>
        ${vatRowsHTML}
        <tr class="divider"><td colspan="2"></td></tr>
        <tr class="grand-total">
          <td class="lbl">${esc(L.totalTTC)}</td>
          <td class="val">${fmt(sale.total, lang)} ${esc(L.currency)}</td>
        </tr>
        <tr class="payment-row">
          <td class="lbl">${esc(L.paid)}</td>
          <td class="val">${fmt(sale.amount_paid, lang)} ${esc(L.currency)}</td>
        </tr>
        <tr class="payment-row">
          <td class="lbl">${esc(L.change)}</td>
          <td class="val">${fmt(Math.max(0, sale.change ?? 0), lang)} ${esc(L.currency)}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- ── Signatures ──────────────────────────────────────────────── -->
  <div class="signatures">
    <div class="sig-box">
      <div class="sig-label">${esc(L.signatureSeller)}</div>
      <div class="sig-dateline">${esc(L.datePlace)} ___________________</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">${esc(L.signatureClient)}</div>
      <div class="sig-dateline">${esc(L.datePlace)} ___________________</div>
    </div>
  </div>

  <!-- ── Footer ──────────────────────────────────────────────────── -->
  <div class="footer">
    <div>
      <strong>${esc(store.name || '')}</strong>
      ${store.address ? `<div>${esc(store.address)}</div>` : ''}
      ${store.phone   ? `<div>${rtl ? 'الهاتف' : 'Tél'} : ${esc(store.phone)}</div>` : ''}
    </div>
    <div class="footer-center">
      ${footerLegal ? `<div>${footerLegal}</div>` : ''}
      ${footerRIB}
    </div>
    <div class="footer-right">
      <div class="bl-num-footer">${esc(blNumber(sale))}</div>
      <div>${esc(dateStr)} ${esc(timeStr)}</div>
    </div>
  </div>

  <!-- ── Bottom accent bar ───────────────────────────────────────── -->
  <div class="bottom-bar"></div>

</div>
</body>
</html>`

  printViaIframe(html)
}

/** Print HTML content using a hidden iframe (works in Tauri WebView) */
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
