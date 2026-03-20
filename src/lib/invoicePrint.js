/**
 * Professional Invoice — A4 HTML printer
 *
 * Opens a new browser window with the formatted invoice (FACTURE) and triggers print.
 * No external dependencies — uses inline CSS only.
 * Supports RTL layout when lang === 'ar'.
 *
 * Usage:
 *   import { printInvoice } from './invoicePrint'
 *   printInvoice({ store, sale, client, labels, lang })
 */

function invoiceNumber(sale) {
  const d = new Date(sale.created_at)
  const ymd = d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  const suffix = String(sale.id || '').slice(-6).toUpperCase()
  return `FA-${ymd}-${suffix}`
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(n, lang) {
  const locale = lang === 'ar' ? 'ar-DZ' : 'fr-FR'
  return Number(n ?? 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function numberToWordsFr(n) {
  if (n === 0) return 'zéro'
  const ones = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']
  function chunk(num) {
    if (num === 0) return ''
    if (num < 20) return ones[num]
    if (num < 100) {
      const t = Math.floor(num / 10)
      const o = num % 10
      if (t === 7 || t === 9) return tens[t] + '-' + ones[10 + o]
      if (t === 8 && o === 0) return 'quatre-vingts'
      return tens[t] + (o === 1 && t !== 8 ? ' et un' : o > 0 ? '-' + ones[o] : '')
    }
    if (num < 1000) {
      const h = Math.floor(num / 100)
      const rest = num % 100
      const prefix = h === 1 ? 'cent' : ones[h] + ' cent'
      if (rest === 0 && h > 1) return prefix + 's'
      return prefix + (rest > 0 ? ' ' + chunk(rest) : '')
    }
    if (num < 1000000) {
      const th = Math.floor(num / 1000)
      const rest = num % 1000
      const prefix = th === 1 ? 'mille' : chunk(th) + ' mille'
      return prefix + (rest > 0 ? ' ' + chunk(rest) : '')
    }
    if (num < 1000000000) {
      const m = Math.floor(num / 1000000)
      const rest = num % 1000000
      const prefix = m === 1 ? 'un million' : chunk(m) + ' millions'
      return prefix + (rest > 0 ? ' ' + chunk(rest) : '')
    }
    return String(num)
  }
  const intPart = Math.floor(Math.abs(n))
  const decPart = Math.round((Math.abs(n) - intPart) * 100)
  let result = chunk(intPart)
  if (decPart > 0) result += ' et ' + chunk(decPart) + ' centimes'
  return result.charAt(0).toUpperCase() + result.slice(1)
}

function numberToWordsAr(n) {
  if (n === 0) return 'صفر'
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
    'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
  function chunk(num) {
    if (num === 0) return ''
    if (num < 20) return ones[num]
    if (num < 100) {
      const t = Math.floor(num / 10)
      const o = num % 10
      if (o === 0) return tens[t]
      return ones[o] + ' و' + tens[t]
    }
    if (num < 1000) {
      const h = Math.floor(num / 100)
      const rest = num % 100
      const hWords = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']
      return hWords[h] + (rest > 0 ? ' و' + chunk(rest) : '')
    }
    if (num < 1000000) {
      const th = Math.floor(num / 1000)
      const rest = num % 1000
      let prefix
      if (th === 1) prefix = 'ألف'
      else if (th === 2) prefix = 'ألفان'
      else if (th >= 3 && th <= 10) prefix = chunk(th) + ' آلاف'
      else prefix = chunk(th) + ' ألف'
      return prefix + (rest > 0 ? ' و' + chunk(rest) : '')
    }
    if (num < 1000000000) {
      const m = Math.floor(num / 1000000)
      const rest = num % 1000000
      let prefix
      if (m === 1) prefix = 'مليون'
      else if (m === 2) prefix = 'مليونان'
      else if (m >= 3 && m <= 10) prefix = chunk(m) + ' ملايين'
      else prefix = chunk(m) + ' مليون'
      return prefix + (rest > 0 ? ' و' + chunk(rest) : '')
    }
    return String(num)
  }
  const intPart = Math.floor(Math.abs(n))
  const decPart = Math.round((Math.abs(n) - intPart) * 100)
  let result = chunk(intPart)
  if (decPart > 0) result += ' و' + chunk(decPart) + ' سنتيم'
  return result
}

function numberToWords(n, lang) {
  if (lang === 'ar') return numberToWordsAr(n)
  return numberToWordsFr(n)
}

/**
 * Build and print an A4 professional invoice (FACTURE).
 *
 * @param {object} store    { name, address, phone, logo_url, brand_color, rc, nif, nis, nart, compte_rib, currency }
 * @param {object} sale     { id, lines[], total_ht, total_vat, total, amount_paid, change, cashier_email, payment_method, created_at }
 * @param {object} labels   Translated strings
 * @param {object} client   Optional client: { name, address, phone, rc, nif, nis, nart, compte_rib }
 * @param {string} lang     Language code ('fr', 'en', 'ar') — controls RTL layout and number formatting
 */
export function printInvoice({ store = {}, sale = {}, labels = {}, client = null, lang = 'fr' } = {}) {
  const accent = store.brand_color || '#1a56db'
  const accentLight = accent + '12'
  const rtl = lang === 'ar'
  const dir = rtl ? 'rtl' : 'ltr'
  const locale = rtl ? 'ar-DZ' : lang === 'en' ? 'en-US' : 'fr-FR'
  const start = rtl ? 'right' : 'left'
  const end = rtl ? 'left' : 'right'

  const L = {
    title:            labels.title            || 'FACTURE',
    invoiceNum:       labels.invoiceNum       || 'Facture N°',
    date:             labels.date             || 'Date',
    dueDate:          labels.dueDate          || 'Échéance',
    cashier:          labels.cashier          || 'Vendeur',
    paymentMethod:    labels.paymentMethod    || 'Mode de paiement',
    billedTo:         labels.billedTo         || 'Facturé à',
    from:             labels.from             || 'De',
    colNum:           labels.colNum           || '#',
    colDesignation:   labels.colDesignation   || 'Désignation',
    colQty:           labels.colQty           || 'Qté',
    colUnitHT:        labels.colUnitHT        || 'P.U HT',
    colDiscount:      labels.colDiscount      || 'Remise',
    colTotalHT:       labels.colTotalHT       || 'Total HT',
    colVAT:           labels.colVAT           || 'TVA %',
    colTotalTTC:      labels.colTotalTTC      || 'Total TTC',
    subtotalHT:       labels.subtotalHT       || 'Sous-total HT',
    vat:              labels.vat              || 'TVA',
    totalTTC:         labels.totalTTC         || 'Total TTC',
    paid:             labels.paid             || 'Montant reçu',
    change:           labels.change           || 'Monnaie rendue',
    amountDue:        labels.amountDue        || 'Net à payer',
    amountWords:      labels.amountWords      || 'Arrêtée la présente facture à la somme de',
    itemsCount:       labels.itemsCount       || 'Total articles',
    stampSignature:   labels.stampSignature   || 'Cachet et signature',
    thankYou:        labels.thankYou         || 'Merci pour votre confiance',
    currency:         store.currency          || 'DA',
    page:             labels.page             || 'Page',
  }

  const d = new Date(sale.created_at || new Date())
  const dateStr = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  // VAT breakdown
  const vatMap = {}
  for (const l of (sale.lines || [])) {
    if ((l.vat ?? 0) > 0) {
      const lineHT = Math.max(0, l.qty * l.unit_price - (l.discount ?? 0))
      const base = vatMap[l.vat] || { base: 0, amount: 0 }
      base.base += lineHT
      base.amount += lineHT * l.vat / 100
      vatMap[l.vat] = base
    }
  }

  const totalItems = (sale.lines || []).reduce((s, l) => s + (l.qty || 0), 0)

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

  // Lines HTML
  const linesHTML = (sale.lines || []).map((l, i) => {
    const lineHT  = Math.max(0, l.qty * l.unit_price - (l.discount ?? 0))
    const lineTTC = lineHT * (1 + (l.vat ?? 0) / 100)
    return `
      <tr style="${i % 2 === 1 ? 'background:#fafbfc;' : ''}">
        <td style="text-align:center;color:#94a3b8;font-size:10px;padding:7px 6px">${i + 1}</td>
        <td style="padding:7px 8px">
          <div style="font-weight:600;color:#1e293b">${esc(l.product_name)}</div>
          ${l.barcode ? `<div style="font-size:9px;color:#94a3b8;font-family:'SF Mono',Consolas,monospace;margin-top:1px">${esc(l.barcode)}${l.ref ? ` · ${esc(l.ref)}` : ''}</div>` : ''}
        </td>
        <td style="text-align:center;font-weight:600;color:#334155">${esc(l.qty)}</td>
        <td style="text-align:${end};font-family:'SF Mono',Consolas,monospace;color:#334155">${fmt(l.unit_price, lang)}</td>
        <td style="text-align:${end};font-family:'SF Mono',Consolas,monospace;color:#dc2626">${(l.discount ?? 0) > 0 ? '−' + fmt(l.discount, lang) : '<span style="color:#cbd5e1">—</span>'}</td>
        <td style="text-align:${end};font-family:'SF Mono',Consolas,monospace;font-weight:600;color:#334155">${fmt(lineHT, lang)}</td>
        <td style="text-align:center;font-size:10px">${(l.vat ?? 0) > 0 ? `<span style="background:${accent}15;color:${accent};padding:2px 6px;border-radius:10px;font-weight:600;font-size:9.5px">${l.vat}%</span>` : '<span style="color:#cbd5e1">—</span>'}</td>
        <td style="text-align:${end};font-family:'SF Mono',Consolas,monospace;font-weight:700;color:#0f172a">${fmt(lineTTC, lang)}</td>
      </tr>`
  }).join('')

  // VAT breakdown rows
  const vatEntries = Object.entries(vatMap)
  const vatTableHTML = vatEntries.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="text-align:${start};padding:4px 8px;font-weight:600;color:#64748b">${esc(L.vat)}</th>
          <th style="text-align:${end};padding:4px 8px;font-weight:600;color:#64748b">Base HT</th>
          <th style="text-align:${end};padding:4px 8px;font-weight:600;color:#64748b">${rtl ? 'المبلغ' : 'Montant'}</th>
        </tr>
      </thead>
      <tbody>
        ${vatEntries.map(([rate, { base, amount }]) => `
          <tr>
            <td style="padding:3px 8px;color:#475569">${rate}%</td>
            <td style="text-align:${end};padding:3px 8px;font-family:'SF Mono',Consolas,monospace;color:#475569">${fmt(base, lang)} ${esc(L.currency)}</td>
            <td style="text-align:${end};padding:3px 8px;font-family:'SF Mono',Consolas,monospace;font-weight:600;color:#334155">${fmt(amount, lang)} ${esc(L.currency)}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : ''

  // Logo
  const logoHTML = store.logo_url ? `
    <img src="${esc(store.logo_url)}" alt="logo"
         style="max-height:52px;max-width:140px;object-fit:contain;display:block;margin-bottom:8px">` : ''

  // Store legal info
  const storeLegalPairs = [
    store.rc   && ['RC', store.rc],
    store.nif  && ['NIF', store.nif],
    store.nis  && ['NIS', store.nis],
    store.nart && ['N° Art.', store.nart],
  ].filter(Boolean)

  // Client legal info
  const clientLegalPairs = client ? [
    client.rc   && ['RC', client.rc],
    client.nif  && ['NIF', client.nif],
    client.nis  && ['NIS', client.nis],
    client.nart && ['N° Art.', client.nart],
  ].filter(Boolean) : []

  // Amount in words
  const totalAmount = Number(sale.total ?? 0)
  const amountInWords = numberToWords(totalAmount, lang)

  // Footer legal
  const footerLegal = [
    store.rc   && `RC : ${esc(store.rc)}`,
    store.nif  && `NIF : ${esc(store.nif)}`,
    store.nis  && `NIS : ${esc(store.nis)}`,
    store.nart && `N° Art. : ${esc(store.nart)}`,
  ].filter(Boolean).join('  ·  ')

  const html = `<!DOCTYPE html>
<html lang="${esc(lang)}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${esc(L.title)} ${esc(invoiceNumber(sale))}</title>${rtl ? `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet">` : ''}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${rtl ? "'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif" : "'Segoe UI', system-ui, -apple-system, Arial, sans-serif"};
      font-size: 11px;
      color: #1e293b;
      background: #e2e8f0;
      direction: ${dir};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 0;
      background: #fff;
      box-shadow: 0 4px 24px rgba(0,0,0,.1);
      display: flex;
      flex-direction: column;
    }

    /* ── Accent header band ── */
    .accent-band {
      background: ${accent};
      padding: 18px 32px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .accent-band .invoice-title {
      font-size: 22px;
      font-weight: 800;
      color: #fff;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .accent-band .invoice-num {
      font-size: 13px;
      color: rgba(255,255,255,.85);
      font-family: 'SF Mono', Consolas, monospace;
      font-weight: 600;
    }

    /* ── Body content ── */
    .body-content {
      flex: 1;
      padding: 20px 32px 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* ── Party info row ── */
    .parties {
      display: flex;
      gap: 24px;
      margin-bottom: 2px;
    }
    .party-box {
      flex: 1;
      padding: 14px 16px;
      border-radius: 8px;
      font-size: 10.5px;
      line-height: 1.65;
    }
    .party-from {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
    .party-to {
      background: ${accent}08;
      border: 1px solid ${accent}25;
    }
    .party-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .8px;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    .party-to .party-label { color: ${accent}; }
    .party-name {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .party-detail { color: #64748b; }
    .party-legal {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 14px;
      margin-top: 6px;
      font-size: 9.5px;
      color: #64748b;
    }
    .party-legal strong { color: #475569; font-weight: 700; }

    /* ── Meta row ── */
    .meta-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .meta-pill {
      background: #f1f5f9;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 10.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .meta-pill .meta-label { color: #94a3b8; font-weight: 600; }
    .meta-pill .meta-value { color: #1e293b; font-weight: 700; font-family: 'SF Mono', Consolas, monospace; }

    /* ── Items table ── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    .items-table thead tr {
      background: #f1f5f9;
    }
    .items-table th {
      padding: 8px 8px;
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .5px;
      color: #64748b;
      border-bottom: 2px solid #e2e8f0;
    }
    .items-table td {
      padding: 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .items-table tbody tr:last-child td { border-bottom: none; }

    /* ── Summary row ── */
    .summary-row td {
      background: #f8fafc;
      border-top: 2px solid #e2e8f0 !important;
      padding: 6px 8px !important;
      font-size: 10px;
      color: #64748b;
    }

    /* ── Totals section ── */
    .totals-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
    }
    .totals-left {
      flex: 1;
      font-size: 10.5px;
    }
    .totals-box {
      min-width: 280px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    .totals-table { width: 100%; border-collapse: collapse; }
    .totals-table td { padding: 6px 14px; }
    .totals-table .t-lbl { color: #64748b; text-align: ${end}; font-size: 10.5px; }
    .totals-table .t-val { text-align: ${end}; font-family: 'SF Mono', Consolas, monospace; font-weight: 600; font-size: 11px; color: #334155; }
    .totals-table .t-sep td { border-top: 1px solid #e2e8f0; padding: 0; }
    .totals-table .t-grand {
      background: ${accent};
    }
    .totals-table .t-grand td { padding: 10px 14px; }
    .totals-table .t-grand .t-lbl { color: rgba(255,255,255,.8); font-weight: 700; font-size: 12px; }
    .totals-table .t-grand .t-val { color: #fff; font-size: 15px; font-weight: 800; letter-spacing: .3px; }
    .totals-table .t-payment td { background: #f8fafc; font-size: 10px; }

    /* ── Amount in words ── */
    .amount-words {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 10.5px;
      color: #475569;
      font-style: italic;
      line-height: 1.5;
    }
    .amount-words strong { color: #1e293b; font-style: normal; }

    /* ── Stamp / Signature ── */
    .stamp-section {
      display: flex;
      justify-content: ${rtl ? 'flex-start' : 'flex-end'};
      margin-top: auto;
      padding-top: 10px;
    }
    .stamp-box {
      width: 220px;
      text-align: center;
      padding-top: 8px;
    }
    .stamp-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .5px;
      color: #64748b;
      margin-bottom: 50px;
    }
    .stamp-line {
      border-top: 1.5px solid #cbd5e1;
      padding-top: 4px;
      font-size: 9px;
      color: #94a3b8;
    }

    /* ── Footer ── */
    .invoice-footer {
      border-top: 2px solid ${accent};
      padding: 10px 32px;
      font-size: 9px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
    }
    .footer-legal { max-width: 70%; line-height: 1.5; }
    .footer-rib { font-family: 'SF Mono', Consolas, monospace; font-weight: 600; color: #64748b; }
    .footer-right { text-align: ${end}; }
    .footer-thank {
      font-size: 10px;
      font-weight: 600;
      color: ${accent};
      margin-bottom: 2px;
    }

    @media print {
      body { background: #fff; }
      .page { box-shadow: none; margin: 0; }
      @page { size: A4 portrait; margin: 0; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── Accent header band ── -->
  <div class="accent-band">
    <div>
      <div class="invoice-title">${esc(L.title)}</div>
    </div>
    <div style="text-align:${end}">
      <div class="invoice-num">${esc(invoiceNumber(sale))}</div>
      <div style="color:rgba(255,255,255,.7);font-size:11px;margin-top:2px">${esc(dateStr)} · ${esc(timeStr)}</div>
    </div>
  </div>

  <div class="body-content">

    <!-- ── Parties ── -->
    <div class="parties">
      <div class="party-box party-from">
        <div class="party-label">${esc(L.from)}</div>
        ${logoHTML}
        <div class="party-name">${esc(store.name || (rtl ? 'الشركة' : 'Société'))}</div>
        ${store.address ? `<div class="party-detail">${esc(store.address)}</div>` : ''}
        ${store.phone ? `<div class="party-detail">${rtl ? 'الهاتف' : 'Tél'} : ${esc(store.phone)}</div>` : ''}
        ${storeLegalPairs.length > 0 ? `<div class="party-legal">${storeLegalPairs.map(([k, v]) => `<span><strong>${esc(k)}</strong> ${esc(v)}</span>`).join('')}</div>` : ''}
        ${store.compte_rib ? `<div class="party-legal"><span><strong>RIB</strong> ${esc(store.compte_rib)}</span></div>` : ''}
      </div>
      <div class="party-box party-to">
        <div class="party-label">${esc(L.billedTo)}</div>
        ${client ? `
          <div class="party-name">${esc(client.name || '')}</div>
          ${client.address ? `<div class="party-detail">${esc(client.address)}</div>` : ''}
          ${client.phone ? `<div class="party-detail">${rtl ? 'الهاتف' : 'Tél'} : ${esc(client.phone)}</div>` : ''}
          ${clientLegalPairs.length > 0 ? `<div class="party-legal">${clientLegalPairs.map(([k, v]) => `<span><strong>${esc(k)}</strong> ${esc(v)}</span>`).join('')}</div>` : ''}
          ${client.compte_rib ? `<div class="party-legal"><span><strong>RIB</strong> ${esc(client.compte_rib)}</span></div>` : ''}
        ` : `<div class="party-detail" style="color:#94a3b8;font-style:italic">—</div>`}
      </div>
    </div>

    <!-- ── Meta pills ── -->
    <div class="meta-row">
      <div class="meta-pill">
        <span class="meta-label">${esc(L.date)}</span>
        <span class="meta-value">${esc(dateStr)}</span>
      </div>
      ${sale.cashier_email ? `<div class="meta-pill"><span class="meta-label">${esc(L.cashier)}</span><span class="meta-value">${esc(sale.cashier_email)}</span></div>` : ''}
      <div class="meta-pill">
        <span class="meta-label">${esc(L.paymentMethod)}</span>
        <span class="meta-value">${esc(pmLabel)}</span>
      </div>
    </div>

    <!-- ── Items table ── -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:28px;text-align:center">${esc(L.colNum)}</th>
          <th style="text-align:${start}">${esc(L.colDesignation)}</th>
          <th style="width:48px;text-align:center">${esc(L.colQty)}</th>
          <th style="width:78px;text-align:${end}">${esc(L.colUnitHT)}</th>
          <th style="width:64px;text-align:${end}">${esc(L.colDiscount)}</th>
          <th style="width:78px;text-align:${end}">${esc(L.colTotalHT)}</th>
          <th style="width:50px;text-align:center">${esc(L.colVAT)}</th>
          <th style="width:82px;text-align:${end}">${esc(L.colTotalTTC)}</th>
        </tr>
      </thead>
      <tbody>
        ${linesHTML || `<tr><td colspan="8" style="text-align:center;padding:18px;color:#94a3b8">—</td></tr>`}
        <tr class="summary-row">
          <td colspan="2" style="text-align:${end};font-weight:600">${esc(L.itemsCount)}</td>
          <td style="text-align:center;font-weight:700;color:#1e293b">${totalItems}</td>
          <td colspan="5"></td>
        </tr>
      </tbody>
    </table>

    <!-- ── Totals section ── -->
    <div class="totals-section">
      <div class="totals-left">
        ${vatTableHTML}
      </div>
      <div class="totals-box">
        <table class="totals-table">
          <tr>
            <td class="t-lbl">${esc(L.subtotalHT)}</td>
            <td class="t-val">${fmt(sale.total_ht, lang)} ${esc(L.currency)}</td>
          </tr>
          ${vatEntries.map(([rate, { amount }]) => `
            <tr>
              <td class="t-lbl">${esc(L.vat)} ${rate}%</td>
              <td class="t-val">${fmt(amount, lang)} ${esc(L.currency)}</td>
            </tr>`).join('')}
          <tr class="t-sep"><td colspan="2"></td></tr>
          <tr class="t-grand">
            <td class="t-lbl">${esc(L.amountDue)}</td>
            <td class="t-val">${fmt(sale.total, lang)} ${esc(L.currency)}</td>
          </tr>
          <tr class="t-payment">
            <td class="t-lbl">${esc(L.paid)}</td>
            <td class="t-val">${fmt(sale.amount_paid, lang)} ${esc(L.currency)}</td>
          </tr>
          <tr class="t-payment">
            <td class="t-lbl">${esc(L.change)}</td>
            <td class="t-val">${fmt(Math.max(0, sale.change ?? 0), lang)} ${esc(L.currency)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- ── Amount in words ── -->
    <div class="amount-words">
      <strong>${esc(L.amountWords)} :</strong> ${esc(amountInWords)} ${esc(L.currency)}.
    </div>

    <!-- ── Stamp / Signature ── -->
    <div class="stamp-section">
      <div class="stamp-box">
        <div class="stamp-label">${esc(L.stampSignature)}</div>
        <div class="stamp-line">${esc(store.name || '')}</div>
      </div>
    </div>

  </div>

  <!-- ── Footer ── -->
  <div class="invoice-footer">
    <div class="footer-legal">
      <div>${esc(store.name || '')}${store.address ? ` — ${esc(store.address)}` : ''}${store.phone ? ` — ${rtl ? 'الهاتف' : 'Tél'} : ${esc(store.phone)}` : ''}</div>
      ${footerLegal ? `<div>${footerLegal}</div>` : ''}
      ${store.compte_rib ? `<div class="footer-rib">RIB : ${esc(store.compte_rib)}</div>` : ''}
    </div>
    <div class="footer-right">
      <div class="footer-thank">${esc(L.thankYou)}</div>
      <div>${esc(L.page)} 1/1</div>
    </div>
  </div>

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
