import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

/** Print HTML content (works in Tauri WebView) */
async function printViaHtml(html) {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('print_html', { html })
  } catch {
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print() }
  }
}

/** Build a standalone A4 HTML document from a declaration element */
function buildPrintHtml(title, contentEl) {
  const content = contentEl?.innerHTML || ''
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20mm 15mm; color: #222; font-size: 12px; }
  h2 { font-size: 18px; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #888; margin-bottom: 16px; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #999; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 16px 0 8px; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
  .row.bold .label, .row.bold .value { font-weight: 700; }
  .row.highlight { background: #f0fdf4; border-radius: 4px; padding: 8px 6px; border: none; margin: 4px 0; }
  .row.highlight.negative { background: #fef2f2; }
  .row .label { color: #555; }
  .row .value { font-variant-numeric: tabular-nums; }
  .row.highlight .value { font-size: 14px; font-weight: 700; }
  .row.highlight .value.positive { color: #16a34a; }
  .row.highlight .value.negative { color: #dc2626; }
  .total-box { background: #eff6ff; border-radius: 6px; padding: 12px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }
  .total-box .label { font-size: 13px; font-weight: 700; }
  .total-box .value { font-size: 18px; font-weight: 700; color: #2563eb; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 6px 8px; text-align: start; border-bottom: 1px solid #eee; font-size: 11px; }
  th { background: #f5f5f5; font-weight: 600; font-size: 10px; text-transform: uppercase; }
  td.num, th.num { text-align: end; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; background: #f9f9f9; }
  .print-date { text-align: end; font-size: 10px; color: #aaa; margin-bottom: 12px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
  .card-title { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
  .card-subtitle { font-size: 10px; color: #888; margin-bottom: 10px; }
  .brackets { font-size: 10px; color: #888; margin-top: 8px; }
  .brackets p { margin: 2px 0; }
  @media print { body { padding: 10mm; } }
</style>
</head><body>
<div class="print-date">${new Date().toLocaleDateString('fr-FR')}</div>
${content}
</body></html>`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentYear() {
  return new Date().getFullYear()
}

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01T00:00`
  const last = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${last}T23:59`
  return { from, to }
}

function yearRange(y) {
  return { from: `${y}-01-01T00:00`, to: `${y}-12-31T23:59` }
}

const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" class={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d={d} />
  </svg>
)

function SectionTitle({ children }) {
  return (
    <div class="flex items-center gap-2 mb-3 mt-6">
      <span class="text-xs font-semibold uppercase tracking-widest text-base-content/40">{children}</span>
      <div class="flex-1 h-px bg-base-300" />
    </div>
  )
}

function DecRow({ label, value, bold, highlight, indent, loading }) {
  return (
    <div class={`flex items-center justify-between py-2.5 px-4 ${highlight ? 'bg-primary/5 rounded-lg' : 'border-b border-base-200'} ${indent ? 'ms-6' : ''}`}>
      <span class={`text-sm ${bold ? 'font-bold' : 'text-base-content/70'}`}>{label}</span>
      <span class={`text-sm tabular-nums ${bold ? 'font-bold text-primary' : ''}`}>
        {loading ? <span class="loading loading-dots loading-xs" /> : (value ?? 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  )
}

function DecRowHighlight({ label, value, positive, loading }) {
  const isPos = positive ?? (value >= 0)
  return (
    <div class={`flex items-center justify-between py-3 px-4 rounded-lg ${isPos ? 'bg-success/10' : 'bg-error/10'}`}>
      <span class="text-sm font-bold">{label}</span>
      <span class={`text-lg font-bold tabular-nums ${isPos ? 'text-success' : 'text-error'}`}>
        {loading ? <span class="loading loading-dots loading-sm" /> : (value ?? 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  )
}

function PrintButton({ onClick, printRef, printTitle }) {
  const { t } = useI18n()
  const handleClick = () => {
    if (onClick) return onClick()
    if (printRef?.current) {
      const html = buildPrintHtml(printTitle || 'Déclaration', printRef.current)
      printViaHtml(html)
    }
  }
  return (
    <button class="btn btn-sm btn-outline gap-1" onClick={handleClick}>
      <Icon d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m0 0a48.163 48.163 0 0112.5 0m-12.5 0V5.625c0-1.036.84-1.875 1.875-1.875h8.25c1.036 0 1.875.84 1.875 1.875v3.034" className="w-4 h-4" />
      {t('print')}
    </button>
  )
}

// ──────────────────────────────────────────────
// G50 — Déclaration Mensuelle
// ──────────────────────────────────────────────
function G50Tab() {
  const { t } = useI18n()
  const [month, setMonth] = useState(currentMonth)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tapRate, setTapRate] = useState(2) // TAP rate: 1% production, 2% services/commerce
  const printRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const range = monthRange(month)
      const [salesStats, purchaseStats, expSum] = await Promise.all([
        api.getSalesStatistics({ from: range.from, to: range.to }),
        api.getPurchaseStats({ from: range.from, to: range.to }).catch(() => ({})),
        api.getExpenseSum({ from: range.from, to: range.to }).catch(() => ({ total: 0 })),
      ])
      setData({ sales: salesStats, purchases: purchaseStats, expenses: expSum })
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { load() }, [load])

  const salesHT = data?.sales?.revenue_ht ?? 0
  const salesVAT = data?.sales?.total_vat ?? 0
  const salesTTC = data?.sales?.revenue_ttc ?? 0
  const purchaseVATReal = data?.purchases?.total_vat ?? 0
  const tvaCollectee = salesVAT
  const tvaDeductible = purchaseVATReal
  const tvaAPayer = Math.max(0, tvaCollectee - tvaDeductible)
  const precompte = tvaDeductible > tvaCollectee ? tvaDeductible - tvaCollectee : 0
  const tap = salesHT * (tapRate / 100)
  const timbreFiscal = data?.sales?.total_timbre ?? 0
  const totalAPayer = tvaAPayer + tap + timbreFiscal

  function handlePrint() {
    if (!printRef.current) return
    const fmtVal = v => (v ?? 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const html = buildPrintHtml(`G50 — ${month}`, {
      innerHTML: `
        <h2>G50 — ${t('declG50Title')}</h2>
        <p class="subtitle">${t('declG50Subtitle')} — ${month}</p>
        <div class="section-title">TVA — ${t('declTVA')}</div>
        <div class="row"><span class="label">${t('declCAHT')}</span><span class="value">${fmtVal(salesHT)}</span></div>
        <div class="row"><span class="label">${t('declTVACollectee')}</span><span class="value">${fmtVal(tvaCollectee)}</span></div>
        <div class="row"><span class="label">${t('declTVADeductible')}</span><span class="value">${fmtVal(tvaDeductible)}</span></div>
        ${precompte > 0 ? `<div class="row"><span class="label">${t('declPrecompte')}</span><span class="value">${fmtVal(precompte)}</span></div>` : ''}
        <div class="row highlight"><span class="label">${t('declTVAAPayer')}</span><span class="value positive">${fmtVal(tvaAPayer)}</span></div>
        <div class="section-title">TAP — ${t('declTAP')}</div>
        <div class="row"><span class="label">${t('declCAHT')} x ${tapRate}%</span><span class="value">${fmtVal(tap)}</span></div>
        <div class="row highlight"><span class="label">${t('declTAPAPayer')}</span><span class="value positive">${fmtVal(tap)}</span></div>
        <div class="section-title">${t('declTimbre')}</div>
        <div class="row"><span class="label">${t('declTimbreFiscal')}</span><span class="value">${fmtVal(timbreFiscal)}</span></div>
        <div class="total-box"><span class="label">${t('declTotalAPayer')}</span><span class="value">${fmtVal(totalAPayer)}</span></div>
      `
    })
    printViaHtml(html)
  }

  return (
    <div>
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <label class="form-control">
          <span class="label-text text-xs mb-1">{t('declMonth')}</span>
          <input type="month" class="input input-bordered input-sm" value={month} onInput={e => setMonth(e.target.value)} />
        </label>
        <label class="form-control">
          <span class="label-text text-xs mb-1">{t('declTapRate')}</span>
          <select class="select select-bordered select-sm" value={tapRate} onChange={e => setTapRate(Number(e.target.value))}>
            <option value={1}>1% ({t('declProduction')})</option>
            <option value={2}>2% ({t('declCommerce')})</option>
          </select>
        </label>
        <div class="flex-1" />
        <PrintButton onClick={handlePrint} />
      </div>

      <div class="card bg-base-100 shadow-sm border border-base-200" id="g50-print" ref={printRef}>
        <div class="card-body p-0">
          {/* Header */}
          <div class="bg-primary/5 p-4 rounded-t-xl border-b border-base-200">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-bold">G50 — {t('declG50Title')}</h3>
                <p class="text-xs text-base-content/50 mt-0.5">{t('declG50Subtitle')}</p>
              </div>
              <div class="text-end">
                <p class="text-sm font-semibold">{month}</p>
              </div>
            </div>
          </div>

          {/* TVA Section */}
          <SectionTitle>TVA — {t('declTVA')}</SectionTitle>
          <div class="px-2">
            <DecRow label={t('declCAHT')} value={salesHT} loading={loading} />
            <DecRow label={t('declTVACollectee')} value={tvaCollectee} loading={loading} />
            <DecRow label={t('declTVADeductible')} value={tvaDeductible} loading={loading} />
            {precompte > 0 && <DecRow label={t('declPrecompte')} value={precompte} loading={loading} />}
            <DecRowHighlight label={t('declTVAAPayer')} value={tvaAPayer} positive loading={loading} />
          </div>

          {/* TAP Section */}
          <SectionTitle>TAP — {t('declTAP')}</SectionTitle>
          <div class="px-2">
            <DecRow label={`${t('declCAHT')} x ${tapRate}%`} value={tap} loading={loading} />
            <DecRowHighlight label={t('declTAPAPayer')} value={tap} positive loading={loading} />
          </div>

          {/* Timbre Section */}
          <SectionTitle>{t('declTimbre')}</SectionTitle>
          <div class="px-2">
            <DecRow label={t('declTimbreFiscal')} value={timbreFiscal} loading={loading} />
          </div>

          {/* Total */}
          <div class="p-4 mt-4 bg-primary/10 rounded-b-xl">
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">{t('declTotalAPayer')}</span>
              <span class="text-2xl font-bold text-primary tabular-nums">
                {loading ? <span class="loading loading-dots loading-sm" /> : totalAPayer.toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// G50A — Annexe (Détail par client)
// ──────────────────────────────────────────────
function G50ATab() {
  const { t } = useI18n()
  const [month, setMonth] = useState(currentMonth)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(false)
  const printRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const range = monthRange(month)
      // Get all sales for the month, grouped by client
      const sales = await api.listSales({ from: range.from, to: range.to, limit: 10000 })
      const items = sales?.items || []

      // Group by client
      const byClient = {}
      for (const sale of items) {
        const cid = sale.client_id || '__cash__'
        const cname = sale.client_name || t('cashSale')
        if (!byClient[cid]) {
          byClient[cid] = { id: cid, name: cname, nif: sale.client_nif || '', totalHT: 0, totalVAT: 0, totalTTC: 0, count: 0 }
        }
        byClient[cid].totalHT += sale.total_ht || 0
        byClient[cid].totalVAT += sale.total_vat || 0
        byClient[cid].totalTTC += sale.total || sale.total_ttc || 0
        byClient[cid].count++
      }

      // Sort by totalTTC desc and filter > 100,000 DA
      const list = Object.values(byClient).sort((a, b) => b.totalTTC - a.totalTTC)
      setClients(list)
    } catch {
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { load() }, [load])

  const totalHT = clients.reduce((s, c) => s + c.totalHT, 0)
  const totalVAT = clients.reduce((s, c) => s + c.totalVAT, 0)
  const totalTTC = clients.reduce((s, c) => s + c.totalTTC, 0)

  return (
    <div>
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <label class="form-control">
          <span class="label-text text-xs mb-1">{t('declMonth')}</span>
          <input type="month" class="input input-bordered input-sm" value={month} onInput={e => setMonth(e.target.value)} />
        </label>
        <div class="flex-1" />
        <PrintButton onClick={() => {
          const fmtVal = v => (v ?? 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          const rows = clients.map((c, i) => `<tr><td>${i + 1}</td><td>${c.name}</td><td>${c.nif || '—'}</td><td class="num">${c.count}</td><td class="num">${fmtVal(c.totalHT)}</td><td class="num">${fmtVal(c.totalVAT)}</td><td class="num">${fmtVal(c.totalTTC)}</td></tr>`).join('')
          const html = buildPrintHtml(`G50A — ${month}`, {
            innerHTML: `
              <h2>G50A — ${t('declG50ATitle')}</h2>
              <p class="subtitle">${t('declG50ASubtitle')} — ${month}</p>
              <table><thead><tr><th>#</th><th>${t('clientName')}</th><th>NIF</th><th class="num">${t('salesCount')}</th><th class="num">${t('htLabel')}</th><th class="num">TVA</th><th class="num">${t('ttcLabel')}</th></tr></thead>
              <tbody>${rows || `<tr><td colspan="7" style="text-align:center">${t('noData')}</td></tr>`}</tbody>
              ${clients.length > 0 ? `<tfoot><tr><td colspan="4" class="num">${t('grandTotal')}</td><td class="num">${fmtVal(totalHT)}</td><td class="num">${fmtVal(totalVAT)}</td><td class="num">${fmtVal(totalTTC)}</td></tr></tfoot>` : ''}
              </table>
            `
          })
          printViaHtml(html)
        }} />
      </div>

      <div class="card bg-base-100 shadow-sm border border-base-200" ref={printRef}>
        <div class="card-body p-0">
          <div class="bg-primary/5 p-4 rounded-t-xl border-b border-base-200">
            <h3 class="text-lg font-bold">G50A — {t('declG50ATitle')}</h3>
            <p class="text-xs text-base-content/50 mt-0.5">{t('declG50ASubtitle')}</p>
          </div>

          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr class="bg-base-200/50">
                  <th>#</th>
                  <th>{t('clientName')}</th>
                  <th>NIF</th>
                  <th class="text-end">{t('salesCount')}</th>
                  <th class="text-end">{t('htLabel')}</th>
                  <th class="text-end">TVA</th>
                  <th class="text-end">{t('ttcLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colspan="7" class="text-center py-8"><span class="loading loading-spinner loading-md" /></td></tr>
                ) : clients.length === 0 ? (
                  <tr><td colspan="7" class="text-center py-8 text-base-content/40">{t('noData')}</td></tr>
                ) : clients.map((c, i) => (
                  <tr key={c.id} class="hover">
                    <td class="text-base-content/40">{i + 1}</td>
                    <td class="font-medium">{c.name}</td>
                    <td class="text-xs text-base-content/50">{c.nif || '—'}</td>
                    <td class="text-end">{c.count}</td>
                    <td class="text-end tabular-nums">{c.totalHT.toLocaleString('fr-DZ', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end tabular-nums">{c.totalVAT.toLocaleString('fr-DZ', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end tabular-nums font-medium">{c.totalTTC.toLocaleString('fr-DZ', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              {clients.length > 0 && (
                <tfoot>
                  <tr class="font-bold bg-base-200/30">
                    <td colspan="4" class="text-end">{t('grandTotal')}</td>
                    <td class="text-end tabular-nums">{totalHT.toLocaleString('fr-DZ', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end tabular-nums">{totalVAT.toLocaleString('fr-DZ', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end tabular-nums">{totalTTC.toLocaleString('fr-DZ', { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// G11 — Bilan Fiscal Annuel
// ──────────────────────────────────────────────
function G11Tab() {
  const { t } = useI18n()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const printRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const range = yearRange(year)
      const [salesStats, purchaseStats, expSum, retSum, valuation] = await Promise.all([
        api.getSalesStatistics({ from: range.from, to: range.to, include_losses: '1' }),
        api.getPurchaseStats({ from: range.from, to: range.to }).catch(() => ({})),
        api.getExpenseSum({ from: range.from, to: range.to }).catch(() => ({ total: 0 })),
        api.getRetraitSum({ from: range.from, to: range.to }).catch(() => ({ total: 0 })),
        api.getProductValuation().catch(() => ({ total_value: 0 })),
      ])
      setData({ sales: salesStats, purchases: purchaseStats, expenses: expSum, retraits: retSum, valuation })
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  // TCR (Tableau des Comptes de Résultat) - Simplified
  const revenueHT = data?.sales?.revenue_ht ?? 0
  const totalVAT = data?.sales?.total_vat ?? 0
  const revenueTTC = data?.sales?.revenue_ttc ?? 0
  const costOfGoods = data?.sales?.total_cost ?? 0
  const grossMargin = data?.sales?.gross_earning ?? 0
  const lossCost = data?.sales?.loss_cost ?? 0
  const expenses = data?.expenses?.total ?? 0
  const netResult = grossMargin - lossCost - expenses

  // Bilan (Simplified)
  const stockValue = data?.valuation?.total_value ?? 0
  const purchaseTotal = data?.purchases?.total ?? 0
  const purchasePaid = data?.purchases?.total_paid ?? 0
  const purchaseRemaining = (data?.purchases?.total ?? 0) - (data?.purchases?.total_paid ?? 0)

  return (
    <div>
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <label class="form-control">
          <span class="label-text text-xs mb-1">{t('declYear')}</span>
          <input type="number" class="input input-bordered input-sm w-28" value={year}
            min="2020" max="2099"
            onInput={e => setYear(Number(e.target.value))} />
        </label>
        <div class="flex-1" />
        <PrintButton onClick={() => {
          const fmtVal = v => (v ?? 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          const html = buildPrintHtml(`G11 — ${year}`, {
            innerHTML: `
              <h2>G11 — ${t('declBilan')} ${year}</h2>
              <div class="grid-2">
                <div class="card">
                  <div class="card-title">${t('declTCR')}</div>
                  <div class="card-subtitle">${t('declTCRSubtitle')}</div>
                  <div class="section-title">${t('declRevenues')}</div>
                  <div class="row"><span class="label">${t('revenueTTC')}</span><span class="value">${fmtVal(revenueTTC)}</span></div>
                  <div class="row"><span class="label">${t('revenueHT')}</span><span class="value">${fmtVal(revenueHT)}</span></div>
                  <div class="row"><span class="label">${t('statsTotalVAT')}</span><span class="value">${fmtVal(totalVAT)}</span></div>
                  <div class="section-title">${t('declCharges')}</div>
                  <div class="row"><span class="label">${t('totalCost')}</span><span class="value">${fmtVal(costOfGoods)}</span></div>
                  <div class="row"><span class="label">${t('lossCost')}</span><span class="value">${fmtVal(lossCost)}</span></div>
                  <div class="row"><span class="label">${t('expenseCost')}</span><span class="value">${fmtVal(expenses)}</span></div>
                  <div class="section-title">${t('declResult')}</div>
                  <div class="row bold"><span class="label">${t('grossEarning')}</span><span class="value">${fmtVal(grossMargin)}</span></div>
                  <div class="row highlight ${netResult >= 0 ? '' : 'negative'}"><span class="label">${t('declNetResult')}</span><span class="value ${netResult >= 0 ? 'positive' : 'negative'}">${fmtVal(netResult)}</span></div>
                </div>
                <div class="card">
                  <div class="card-title">${t('declBilan')}</div>
                  <div class="card-subtitle">${t('declBilanSubtitle')}</div>
                  <div class="section-title">${t('declActif')}</div>
                  <div class="row"><span class="label">${t('declStockValue')}</span><span class="value">${fmtVal(stockValue)}</span></div>
                  <div class="section-title">${t('declPassif')}</div>
                  <div class="row"><span class="label">${t('declSupplierDebt')}</span><span class="value">${fmtVal(purchaseRemaining)}</span></div>
                  <div class="row"><span class="label">${t('declTotalPurchases')}</span><span class="value">${fmtVal(purchaseTotal)}</span></div>
                  <div class="row"><span class="label">${t('declPurchasesPaid')}</span><span class="value">${fmtVal(purchasePaid)}</span></div>
                  <div class="section-title">${t('declSummary')}</div>
                  <div class="row highlight ${netResult >= 0 ? '' : 'negative'}"><span class="label">${t('declNetResult')}</span><span class="value ${netResult >= 0 ? 'positive' : 'negative'}">${fmtVal(netResult)}</span></div>
                </div>
              </div>
            `
          })
          printViaHtml(html)
        }} />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* TCR - Compte de Résultat */}
        <div class="card bg-base-100 shadow-sm border border-base-200">
          <div class="card-body p-0">
            <div class="bg-success/5 p-4 rounded-t-xl border-b border-base-200">
              <h3 class="text-lg font-bold">{t('declTCR')}</h3>
              <p class="text-xs text-base-content/50">{t('declTCRSubtitle')}</p>
            </div>

            <div class="p-2">
              <SectionTitle>{t('declRevenues')}</SectionTitle>
              <DecRow label={t('revenueTTC')} value={revenueTTC} loading={loading} />
              <DecRow label={t('revenueHT')} value={revenueHT} loading={loading} />
              <DecRow label={t('statsTotalVAT')} value={totalVAT} loading={loading} />

              <SectionTitle>{t('declCharges')}</SectionTitle>
              <DecRow label={t('totalCost')} value={costOfGoods} loading={loading} />
              <DecRow label={t('lossCost')} value={lossCost} loading={loading} />
              <DecRow label={t('expenseCost')} value={expenses} loading={loading} />

              <SectionTitle>{t('declResult')}</SectionTitle>
              <DecRow label={t('grossEarning')} value={grossMargin} bold loading={loading} />
              <DecRowHighlight label={t('declNetResult')} value={netResult} loading={loading} />
            </div>
          </div>
        </div>

        {/* Bilan - Actif/Passif */}
        <div class="card bg-base-100 shadow-sm border border-base-200">
          <div class="card-body p-0">
            <div class="bg-info/5 p-4 rounded-t-xl border-b border-base-200">
              <h3 class="text-lg font-bold">{t('declBilan')}</h3>
              <p class="text-xs text-base-content/50">{t('declBilanSubtitle')}</p>
            </div>

            <div class="p-2">
              <SectionTitle>{t('declActif')}</SectionTitle>
              <DecRow label={t('declStockValue')} value={stockValue} loading={loading} />

              <SectionTitle>{t('declPassif')}</SectionTitle>
              <DecRow label={t('declSupplierDebt')} value={purchaseRemaining} loading={loading} />
              <DecRow label={t('declTotalPurchases')} value={purchaseTotal} loading={loading} />
              <DecRow label={t('declPurchasesPaid')} value={purchasePaid} loading={loading} />

              <SectionTitle>{t('declSummary')}</SectionTitle>
              <DecRowHighlight label={t('declNetResult')} value={netResult} loading={loading} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// G12 — IRG (Personnes physiques)
// ──────────────────────────────────────────────
function G12Tab() {
  const { t } = useI18n()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const printRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const range = yearRange(year)
      const [salesStats, expSum] = await Promise.all([
        api.getSalesStatistics({ from: range.from, to: range.to, include_losses: '1' }),
        api.getExpenseSum({ from: range.from, to: range.to }).catch(() => ({ total: 0 })),
      ])
      setData({ sales: salesStats, expenses: expSum })
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const revenueHT = data?.sales?.revenue_ht ?? 0
  const costOfGoods = data?.sales?.total_cost ?? 0
  const grossMargin = data?.sales?.gross_earning ?? 0
  const lossCost = data?.sales?.loss_cost ?? 0
  const expenses = data?.expenses?.total ?? 0
  const netProfit = grossMargin - lossCost - expenses

  // IRG brackets Algeria (simplified)
  function calcIRG(profit) {
    if (profit <= 0) return 0
    if (profit <= 240000) return 0
    if (profit <= 480000) return (profit - 240000) * 0.23
    if (profit <= 960000) return (240000 * 0.23) + (profit - 480000) * 0.27
    if (profit <= 1920000) return (240000 * 0.23) + (480000 * 0.27) + (profit - 960000) * 0.30
    if (profit <= 3840000) return (240000 * 0.23) + (480000 * 0.27) + (960000 * 0.30) + (profit - 1920000) * 0.33
    return (240000 * 0.23) + (480000 * 0.27) + (960000 * 0.30) + (1920000 * 0.33) + (profit - 3840000) * 0.35
  }

  const irgAmount = calcIRG(netProfit)
  const effectiveRate = netProfit > 0 ? ((irgAmount / netProfit) * 100).toFixed(1) : '0.0'

  return (
    <div>
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <label class="form-control">
          <span class="label-text text-xs mb-1">{t('declYear')}</span>
          <input type="number" class="input input-bordered input-sm w-28" value={year}
            min="2020" max="2099"
            onInput={e => setYear(Number(e.target.value))} />
        </label>
        <div class="flex-1" />
        <PrintButton onClick={() => {
          const fmtVal = v => (v ?? 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          const html = buildPrintHtml(`G12 — ${year}`, {
            innerHTML: `
              <h2>G12 — ${t('declG12Title')}</h2>
              <p class="subtitle">${t('declG12Subtitle')} — ${year}</p>
              <div class="section-title">${t('declRevenues')}</div>
              <div class="row"><span class="label">${t('revenueHT')}</span><span class="value">${fmtVal(revenueHT)}</span></div>
              <div class="row"><span class="label">${t('totalCost')}</span><span class="value">${fmtVal(costOfGoods)}</span></div>
              <div class="row bold"><span class="label">${t('grossEarning')}</span><span class="value">${fmtVal(grossMargin)}</span></div>
              <div class="section-title">${t('declCharges')}</div>
              <div class="row"><span class="label">${t('lossCost')}</span><span class="value">${fmtVal(lossCost)}</span></div>
              <div class="row"><span class="label">${t('expenseCost')}</span><span class="value">${fmtVal(expenses)}</span></div>
              <div class="section-title">${t('declNetProfit')}</div>
              <div class="row bold"><span class="label">${t('declNetResult')}</span><span class="value">${fmtVal(netProfit)}</span></div>
              <div class="section-title">IRG — ${t('declIRGCalc')}</div>
              <div class="row"><span class="label">${t('declTaxableIncome')}</span><span class="value">${fmtVal(netProfit > 0 ? netProfit : 0)}</span></div>
              <div class="row"><span class="label">${t('declEffectiveRate')}: ${effectiveRate}%</span><span class="value">${fmtVal(irgAmount)}</span></div>
              <div class="row highlight negative"><span class="label">${t('declIRGAPayer')}</span><span class="value negative">${fmtVal(irgAmount)}</span></div>
              <div class="brackets">
                <p style="font-weight:600;margin-bottom:4px">${t('declIRGBrackets')}</p>
                <p>0 - 240,000 DA: 0%</p>
                <p>240,001 - 480,000 DA: 23%</p>
                <p>480,001 - 960,000 DA: 27%</p>
                <p>960,001 - 1,920,000 DA: 30%</p>
                <p>1,920,001 - 3,840,000 DA: 33%</p>
                <p>&gt; 3,840,000 DA: 35%</p>
              </div>
            `
          })
          printViaHtml(html)
        }} />
      </div>

      <div class="card bg-base-100 shadow-sm border border-base-200">
        <div class="card-body p-0">
          <div class="bg-warning/5 p-4 rounded-t-xl border-b border-base-200">
            <h3 class="text-lg font-bold">G12 — {t('declG12Title')}</h3>
            <p class="text-xs text-base-content/50">{t('declG12Subtitle')}</p>
          </div>

          <div class="p-2">
            <SectionTitle>{t('declRevenues')}</SectionTitle>
            <DecRow label={t('revenueHT')} value={revenueHT} loading={loading} />
            <DecRow label={t('totalCost')} value={costOfGoods} loading={loading} />
            <DecRow label={t('grossEarning')} value={grossMargin} bold loading={loading} />

            <SectionTitle>{t('declCharges')}</SectionTitle>
            <DecRow label={t('lossCost')} value={lossCost} loading={loading} />
            <DecRow label={t('expenseCost')} value={expenses} loading={loading} />

            <SectionTitle>{t('declNetProfit')}</SectionTitle>
            <DecRow label={t('declNetResult')} value={netProfit} bold loading={loading} />

            <SectionTitle>IRG — {t('declIRGCalc')}</SectionTitle>
            <DecRow label={t('declTaxableIncome')} value={netProfit > 0 ? netProfit : 0} loading={loading} />
            <DecRow label={`${t('declEffectiveRate')}: ${effectiveRate}%`} value={irgAmount} loading={loading} />

            <div class="mt-2">
              <DecRowHighlight label={t('declIRGAPayer')} value={irgAmount} positive={false} loading={loading} />
            </div>

            {/* IRG bracket info */}
            <div class="mt-4 px-4 pb-4">
              <p class="text-xs font-semibold text-base-content/40 mb-2">{t('declIRGBrackets')}</p>
              <div class="text-xs text-base-content/50 space-y-1">
                <p>0 - 240,000 DA: 0%</p>
                <p>240,001 - 480,000 DA: 23%</p>
                <p>480,001 - 960,000 DA: 27%</p>
                <p>960,001 - 1,920,000 DA: 30%</p>
                <p>1,920,001 - 3,840,000 DA: 33%</p>
                <p>&gt; 3,840,000 DA: 35%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// G20 — IBS (Sociétés)
// ──────────────────────────────────────────────
function G20Tab() {
  const { t } = useI18n()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [ibsRate, setIbsRate] = useState(19) // 19% production, 23% BTP/tourism, 26% other
  const printRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const range = yearRange(year)
      const [salesStats, expSum] = await Promise.all([
        api.getSalesStatistics({ from: range.from, to: range.to, include_losses: '1' }),
        api.getExpenseSum({ from: range.from, to: range.to }).catch(() => ({ total: 0 })),
      ])
      setData({ sales: salesStats, expenses: expSum })
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const revenueHT = data?.sales?.revenue_ht ?? 0
  const costOfGoods = data?.sales?.total_cost ?? 0
  const grossMargin = data?.sales?.gross_earning ?? 0
  const lossCost = data?.sales?.loss_cost ?? 0
  const expenses = data?.expenses?.total ?? 0
  const netProfit = grossMargin - lossCost - expenses
  const ibsAmount = netProfit > 0 ? netProfit * (ibsRate / 100) : 0
  const acompte1 = ibsAmount * 0.30
  const acompte2 = ibsAmount * 0.30
  const acompte3 = ibsAmount * 0.30
  const solde = ibsAmount - acompte1 - acompte2 - acompte3

  return (
    <div>
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <label class="form-control">
          <span class="label-text text-xs mb-1">{t('declYear')}</span>
          <input type="number" class="input input-bordered input-sm w-28" value={year}
            min="2020" max="2099"
            onInput={e => setYear(Number(e.target.value))} />
        </label>
        <label class="form-control">
          <span class="label-text text-xs mb-1">{t('declIBSRate')}</span>
          <select class="select select-bordered select-sm" value={ibsRate} onChange={e => setIbsRate(Number(e.target.value))}>
            <option value={19}>19% ({t('declProduction')})</option>
            <option value={23}>23% (BTP / {t('declTourism')})</option>
            <option value={26}>26% ({t('declCommerce')} / {t('declServices')})</option>
          </select>
        </label>
        <div class="flex-1" />
        <PrintButton onClick={() => {
          const fmtVal = v => (v ?? 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          const html = buildPrintHtml(`G20 — ${year}`, {
            innerHTML: `
              <h2>G20 — ${t('declG20Title')}</h2>
              <p class="subtitle">${t('declG20Subtitle')} — ${year}</p>
              <div class="section-title">${t('declProfitCalc')}</div>
              <div class="row"><span class="label">${t('revenueHT')}</span><span class="value">${fmtVal(revenueHT)}</span></div>
              <div class="row"><span class="label">${t('totalCost')}</span><span class="value">${fmtVal(costOfGoods)}</span></div>
              <div class="row bold"><span class="label">${t('grossEarning')}</span><span class="value">${fmtVal(grossMargin)}</span></div>
              <div class="row"><span class="label">${t('lossCost')}</span><span class="value">${fmtVal(lossCost)}</span></div>
              <div class="row"><span class="label">${t('expenseCost')}</span><span class="value">${fmtVal(expenses)}</span></div>
              <div class="row bold"><span class="label">${t('declNetResult')}</span><span class="value">${fmtVal(netProfit)}</span></div>
              <div class="section-title">IBS — ${t('declIBSCalc')}</div>
              <div class="row"><span class="label">${t('declTaxableIncome')} x ${ibsRate}%</span><span class="value">${fmtVal(ibsAmount)}</span></div>
              <div class="section-title">${t('declAcomptes')}</div>
              <div class="row"><span class="label">${t('declAcompte')} 1 (20 mars) — 30%</span><span class="value">${fmtVal(acompte1)}</span></div>
              <div class="row"><span class="label">${t('declAcompte')} 2 (20 juin) — 30%</span><span class="value">${fmtVal(acompte2)}</span></div>
              <div class="row"><span class="label">${t('declAcompte')} 3 (20 nov.) — 30%</span><span class="value">${fmtVal(acompte3)}</span></div>
              <div class="row"><span class="label">${t('declSolde')}</span><span class="value">${fmtVal(solde)}</span></div>
              <div class="row highlight negative"><span class="label">${t('declIBSTotal')}</span><span class="value negative">${fmtVal(ibsAmount)}</span></div>
            `
          })
          printViaHtml(html)
        }} />
      </div>

      <div class="card bg-base-100 shadow-sm border border-base-200">
        <div class="card-body p-0">
          <div class="bg-error/5 p-4 rounded-t-xl border-b border-base-200">
            <h3 class="text-lg font-bold">G20 — {t('declG20Title')}</h3>
            <p class="text-xs text-base-content/50">{t('declG20Subtitle')}</p>
          </div>

          <div class="p-2">
            <SectionTitle>{t('declProfitCalc')}</SectionTitle>
            <DecRow label={t('revenueHT')} value={revenueHT} loading={loading} />
            <DecRow label={t('totalCost')} value={costOfGoods} loading={loading} />
            <DecRow label={t('grossEarning')} value={grossMargin} bold loading={loading} />
            <DecRow label={t('lossCost')} value={lossCost} loading={loading} />
            <DecRow label={t('expenseCost')} value={expenses} loading={loading} />
            <DecRow label={t('declNetResult')} value={netProfit} bold loading={loading} />

            <SectionTitle>IBS — {t('declIBSCalc')}</SectionTitle>
            <DecRow label={`${t('declTaxableIncome')} x ${ibsRate}%`} value={ibsAmount} loading={loading} />

            <SectionTitle>{t('declAcomptes')}</SectionTitle>
            <DecRow label={`${t('declAcompte')} 1 (20 mars) — 30%`} value={acompte1} loading={loading} />
            <DecRow label={`${t('declAcompte')} 2 (20 juin) — 30%`} value={acompte2} loading={loading} />
            <DecRow label={`${t('declAcompte')} 3 (20 nov.) — 30%`} value={acompte3} loading={loading} />
            <DecRow label={t('declSolde')} value={solde} loading={loading} />

            <div class="mt-2">
              <DecRowHighlight label={t('declIBSTotal')} value={ibsAmount} positive={false} loading={loading} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Main Declarations Page
// ──────────────────────────────────────────────
const TABS = ['g50', 'g50a', 'g11', 'g12', 'g20']

export default function Declarations({ path }) {
  const { t } = useI18n()
  const [tab, setTab] = useState('g50')

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-2xl font-bold">{t('declarationsPage')}</h2>
      </div>

      {/* Tab bar */}
      <div class="tabs tabs-boxed bg-base-200/50 mb-5 p-1 rounded-xl">
        {TABS.map(t_id => (
          <button
            key={t_id}
            class={`tab tab-sm font-medium ${tab === t_id ? 'tab-active bg-primary text-primary-content rounded-lg' : ''}`}
            onClick={() => setTab(t_id)}
          >
            {t_id.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === 'g50' && <G50Tab />}
      {tab === 'g50a' && <G50ATab />}
      {tab === 'g11' && <G11Tab />}
      {tab === 'g12' && <G12Tab />}
      {tab === 'g20' && <G20Tab />}
    </Layout>
  )
}
