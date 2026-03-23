import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

function today() {
  return new Date().toISOString().slice(0, 10)
}

const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" class={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d={d} />
  </svg>
)

function SectionTitle({ children }) {
  return (
    <div class="flex items-center gap-2 mb-3">
      <span class="text-xs font-semibold uppercase tracking-widest text-base-content/40">{children}</span>
      <div class="flex-1 h-px bg-base-300" />
    </div>
  )
}

function KpiCard({ label, value, icon, color, bg, loading, subtitle }) {
  return (
    <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-shadow">
      <div class="card-body p-4">
        <div class="flex items-start justify-between mb-2">
          <div class={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
            <Icon d={icon} className={`w-4 h-4 ${color}`} />
          </div>
        </div>
        <p class="text-xl font-bold tabular-nums leading-tight">
          {loading ? <span class="loading loading-dots loading-xs opacity-30" /> : (value ?? 0).toFixed(2)}
        </p>
        <p class="text-xs font-medium text-base-content/50 mt-0.5 leading-snug">{label}</p>
        {subtitle && <p class="text-xs text-base-content/35 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function CountCard({ label, value, icon, loading }) {
  return (
    <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-shadow">
      <div class="card-body p-4">
        <div class="w-9 h-9 rounded-lg bg-base-200 flex items-center justify-center mb-2">
          <Icon d={icon} className="w-4 h-4 text-base-content/50" />
        </div>
        <p class="text-xl font-bold tabular-nums leading-tight">
          {loading ? <span class="loading loading-dots loading-xs opacity-30" /> : (value ?? 0)}
        </p>
        <p class="text-xs font-medium text-base-content/50 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function BigCard({ label, value, icon, positive, loading }) {
  const isPos = positive ?? (value >= 0)
  return (
    <div class={`card shadow-sm col-span-1 lg:col-span-2 ${isPos ? 'bg-gradient-to-br from-success to-success/80' : 'bg-gradient-to-br from-error to-error/80'} text-success-content`}>
      <div class="card-body p-5">
        <div class="flex items-center justify-between">
          <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Icon d={icon} className="w-5 h-5 opacity-90" />
          </div>
          {!loading && (
            <span class={`badge badge-sm ${isPos ? 'bg-white/20 text-white border-0' : 'bg-white/20 text-white border-0'}`}>
              {isPos ? '▲' : '▼'}
            </span>
          )}
        </div>
        <p class="text-3xl font-bold tabular-nums mt-3">
          {loading ? <span class="loading loading-dots loading-sm opacity-50" /> : (value ?? 0).toFixed(2)}
        </p>
        <p class="text-sm opacity-80 font-medium">{label}</p>
      </div>
    </div>
  )
}

function BigInfoCard({ label, value, icon, loading }) {
  return (
    <div class={`card shadow-sm col-span-1 lg:col-span-2 ${(value ?? 0) >= 0 ? 'bg-gradient-to-br from-info to-info/80' : 'bg-gradient-to-br from-error to-error/80'} text-info-content`}>
      <div class="card-body p-5">
        <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
          <Icon d={icon} className="w-5 h-5 opacity-90" />
        </div>
        <p class="text-3xl font-bold tabular-nums">
          {loading ? <span class="loading loading-dots loading-sm opacity-50" /> : (value ?? 0).toFixed(2)}
        </p>
        <p class="text-sm opacity-80 font-medium mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default function SalesStats({ path }) {
  const { t } = useI18n()

  // Draft state — bound to inputs, not yet applied
  const [draftFrom, setDraftFrom] = useState(today)
  const [draftFromTime, setDraftFromTime] = useState('00:00')
  const [draftTo, setDraftTo] = useState(today)
  const [draftToTime, setDraftToTime] = useState('23:59')

  // Applied state — what was last submitted
  const [filter, setFilter] = useState({ from: `${today()}T00:00`, to: `${today()}T23:59` })

  const [data, setData] = useState(null)
  const [expenseSum, setExpenseSum] = useState(0)
  const [retraitSum, setRetraitSum] = useState(0)
  const [paymentsCollected, setPaymentsCollected] = useState(0)
  const [caisseOpening, setCaisseOpening] = useState(0)
  const [caisseClosing, setCaisseClosing] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (f) => {
    setLoading(true)
    try {
      const [result, expResult, retResult, payResult, caisseResult] = await Promise.all([
        api.getSalesStatistics({ from: f.from, to: f.to, include_losses: '1' }),
        api.getExpenseSum({ from: f.from, to: f.to }),
        api.getRetraitSum({ from: f.from, to: f.to }),
        api.getClientPaymentsSum({ from: f.from, to: f.to }).catch(() => ({ total: 0 })),
        api.getCaisseSum({ from: f.from, to: f.to }).catch(() => ({ total: 0 })),
      ])
      setData(result)
      setExpenseSum(expResult?.total ?? 0)
      setRetraitSum(retResult?.total ?? 0)
      setPaymentsCollected(payResult?.total ?? 0)
      setCaisseOpening(caisseResult?.total ?? 0)
      setCaisseClosing(caisseResult?.closing ?? 0)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load once on mount with initial filter
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.getSalesStatistics({ from: filter.from, to: filter.to, include_losses: '1' }),
      api.getExpenseSum({ from: filter.from, to: filter.to }),
      api.getRetraitSum({ from: filter.from, to: filter.to }),
      api.getClientPaymentsSum({ from: filter.from, to: filter.to }).catch(() => ({ total: 0 })),
      api.getCaisseSum({ from: filter.from, to: filter.to }).catch(() => ({ total: 0 })),
    ])
      .then(([result, expResult, retResult, payResult, caisseResult]) => {
        if (cancelled) return
        setData(result)
        setExpenseSum(expResult?.total ?? 0)
        setRetraitSum(retResult?.total ?? 0)
        setPaymentsCollected(payResult?.total ?? 0)
        setCaisseOpening(caisseResult?.total ?? 0)
        setCaisseClosing(caisseResult?.closing ?? 0)
      })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const applyFilter = () => {
    const f = { from: `${draftFrom}T${draftFromTime}`, to: `${draftTo}T${draftToTime}` }
    setFilter(f)
    load(f)
  }

  const isDirty = `${draftFrom}T${draftFromTime}` !== filter.from || `${draftTo}T${draftToTime}` !== filter.to

  const grossMarginPct = data && data.revenue_ht > 0
    ? ((data.gross_earning / data.revenue_ht) * 100).toFixed(1)
    : '0.0'

  const finalEarning = (data?.net_earning ?? 0) - expenseSum
  const cashInRegister = caisseOpening + (data?.cash_payment_ttc ?? 0) + paymentsCollected - retraitSum
  const ecart = caisseClosing > 0 ? caisseClosing - cashInRegister : 0

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-2xl font-bold">{t('salesStatsPage')}</h2>
        {!loading && data && (
          <span class="badge badge-outline badge-lg">{t('grossEarning')}: {grossMarginPct}%</span>
        )}
      </div>

      {/* Filter bar */}
      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-6">
        <div class="flex gap-3 flex-wrap items-end">
          <label class="form-control">
            <span class="label-text text-xs mb-1">{t('dateFrom')}</span>
            <div class="flex gap-1">
              <input type="date" class="input input-bordered input-sm"
                value={draftFrom} onInput={(e) => setDraftFrom(e.target.value)} />
              <input type="time" class="input input-bordered input-sm w-24"
                value={draftFromTime} onInput={(e) => setDraftFromTime(e.target.value)} />
            </div>
          </label>
          <label class="form-control">
            <span class="label-text text-xs mb-1">{t('dateTo')}</span>
            <div class="flex gap-1">
              <input type="date" class="input input-bordered input-sm"
                value={draftTo} onInput={(e) => setDraftTo(e.target.value)} />
              <input type="time" class="input input-bordered input-sm w-24"
                value={draftToTime} onInput={(e) => setDraftToTime(e.target.value)} />
            </div>
          </label>
          <button
            class={`btn btn-sm pb-1 ${isDirty ? 'btn-primary' : 'btn-ghost'}`}
            onClick={applyFilter}
            disabled={loading}
          >
            {loading
              ? <span class="loading loading-spinner loading-xs" />
              : <Icon d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" className="w-4 h-4" />
            }
            {t('search')}
          </button>
        </div>
        {isDirty && (
          <p class="text-xs text-warning mt-2 flex items-center gap-1">
            <Icon d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-3.5 h-3.5 text-warning" />
            {t('dateFrom')} / {t('dateTo')} changed — click to apply
          </p>
        )}
      </div>

      {/* ── Revenue ── */}
      <SectionTitle>{t('revenueTTC')}</SectionTitle>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <CountCard
          label={t('salesCount')}
          value={data?.sales_count}
          loading={loading}
          icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
        />
        <KpiCard
          label={t('revenueTTC')}
          value={data?.revenue_ttc}
          loading={loading}
          color="text-primary"
          bg="bg-primary/10"
          icon="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <KpiCard
          label={t('revenueHT')}
          value={data?.revenue_ht}
          loading={loading}
          color="text-secondary"
          bg="bg-secondary/10"
          icon="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <KpiCard
          label={t('statsTotalVAT')}
          value={data?.total_vat}
          loading={loading}
          color="text-warning"
          bg="bg-warning/10"
          icon="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z"
        />
      </div>

      {/* ── Cash vs Credit ── */}
      <SectionTitle>{t('cashRevenueTTC')} / {t('creditRevenueTTC')}</SectionTitle>
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label={t('cashRevenueTTC')}
          value={data?.cash_revenue_ttc}
          loading={loading}
          color="text-success"
          bg="bg-success/10"
          icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
        />
        <KpiCard
          label={t('creditRevenueTTC')}
          value={data?.credit_revenue_ttc}
          loading={loading}
          color="text-warning"
          bg="bg-warning/10"
          icon="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
        />
        <KpiCard
          label={t('paymentsCollected')}
          value={paymentsCollected}
          loading={loading}
          color="text-info"
          bg="bg-info/10"
          icon="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
        />
      </div>

      {/* ── Payment Method Breakdown ── */}
      <SectionTitle>{t('payMethod_cash')} / {t('payMethod_cheque')} / {t('payMethod_virement')}</SectionTitle>
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label={t('payMethod_cash')}
          value={data?.cash_payment_ttc}
          loading={loading}
          color="text-success"
          bg="bg-success/10"
          icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
        />
        <KpiCard
          label={t('payMethod_cheque')}
          value={data?.cheque_payment_ttc}
          loading={loading}
          color="text-info"
          bg="bg-info/10"
          icon="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
        <KpiCard
          label={t('payMethod_virement')}
          value={data?.virement_payment_ttc}
          loading={loading}
          color="text-secondary"
          bg="bg-secondary/10"
          icon="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
        />
      </div>

      {/* ── Profitability ── */}
      <SectionTitle>{t('grossEarning')}</SectionTitle>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label={t('totalCost')}
          value={data?.total_cost}
          loading={loading}
          color="text-error"
          bg="bg-error/10"
          icon="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
        />
        <KpiCard
          label={t('grossEarning')}
          value={data?.gross_earning}
          loading={loading}
          color="text-success"
          bg="bg-success/10"
          icon="M2.25 18l9-9 4 4L21 7.5M3.75 21h16.5"
        />
        <KpiCard
          label={t('lossCost')}
          value={data?.loss_cost}
          loading={loading}
          color="text-error"
          bg="bg-error/10"
          icon="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <KpiCard
          label={t('netEarning')}
          value={data?.net_earning}
          loading={loading}
          color="text-success"
          bg="bg-success/10"
          icon="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
        />
      </div>

      {/* ── Final Earning ── */}
      <SectionTitle>{t('finalEarning')}</SectionTitle>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label={t('expenseCost')}
          value={expenseSum}
          loading={loading}
          color="text-warning"
          bg="bg-warning/10"
          icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
        />
        <BigCard
          label={t('finalEarning')}
          value={finalEarning}
          loading={loading}
          icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </div>

      {/* ── Cash Register ── */}
      <SectionTitle>{t('cashInRegister')}</SectionTitle>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
        <KpiCard
          label={t('openingAmount')}
          value={caisseOpening}
          loading={loading}
          color="text-info"
          bg="bg-info/10"
          icon="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
        />
        <KpiCard
          label={t('retraitCost')}
          value={retraitSum}
          loading={loading}
          color="text-error"
          bg="bg-error/10"
          icon="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
        <BigInfoCard
          label={t('cashInRegister')}
          value={cashInRegister}
          loading={loading}
          icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
        />
        {caisseClosing > 0 && (
          <KpiCard
            label={t('closingAmount')}
            value={caisseClosing}
            loading={loading}
            color="text-info"
            bg="bg-info/10"
            icon="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        )}
        {caisseClosing > 0 && (
          <BigCard
            label={t('caisseDifference')}
            value={ecart}
            loading={loading}
            icon="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-3L16.5 18m0 0L12 13.5m4.5 4.5V4.5"
          />
        )}
      </div>
    </Layout>
  )
}
