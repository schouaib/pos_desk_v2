import { useState, useEffect, useCallback } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

const today = () => new Date().toISOString().slice(0, 10)
const fmt = (v) => (v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function SalesStats({ path }) {
  const { t } = useI18n()
  const [draftFrom, setDraftFrom] = useState(today)
  const [draftFromTime, setDraftFromTime] = useState('00:00')
  const [draftTo, setDraftTo] = useState(today)
  const [draftToTime, setDraftToTime] = useState('23:59')
  const [filter, setFilter] = useState({ from: `${today()}T00:00`, to: `${today()}T23:59` })
  const [data, setData] = useState(null)
  const [expenseSum, setExpenseSum] = useState(0)
  const [retraitSum, setRetraitSum] = useState(0)
  const [paymentsCollected, setPaymentsCollected] = useState(0)
  const [caisseOpening, setCaisseOpening] = useState(0)
  const [caisseClosing, setCaisseClosing] = useState(0)
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async (f) => {
    setLoading(true)
    try {
      const [result, expResult, retResult, payResult, caisseResult] = await Promise.all([
        api.getSalesStatistics({ from: f.from, to: f.to, include_losses: '1' }),
        api.getExpenseSum({ from: f.from, to: f.to }),
        api.getRetraitSum({ from: f.from, to: f.to }),
        api.getClientPaymentsSum({ from: f.from, to: f.to }).catch(() => ({ total: 0 })),
        api.getCaisseSum({ from: f.from, to: f.to }).catch(() => ({ total: 0 })),
      ])
      setData(result); setExpenseSum(expResult?.total ?? 0); setRetraitSum(retResult?.total ?? 0)
      setPaymentsCollected(payResult?.total ?? 0); setCaisseOpening(caisseResult?.total ?? 0); setCaisseClosing(caisseResult?.closing ?? 0)
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll(filter) }, [])

  const applyFilter = () => {
    const f = { from: `${draftFrom}T${draftFromTime}`, to: `${draftTo}T${draftToTime}` }
    setFilter(f); fetchAll(f)
  }

  const isDirty = `${draftFrom}T${draftFromTime}` !== filter.from || `${draftTo}T${draftToTime}` !== filter.to
  const marginPct = data?.revenue_ht > 0 ? ((data.gross_earning / data.revenue_ht) * 100).toFixed(1) : '0.0'
  const finalEarning = (data?.net_earning ?? 0) - expenseSum
  const cashInRegister = caisseOpening + (data?.cash_payment_ttc ?? 0) + (data?.total_timbre ?? 0) + paymentsCollected - retraitSum - expenseSum
  const ecart = caisseClosing != null ? caisseClosing - cashInRegister : 0

  const Loader = () => <div class="h-5 w-16 bg-base-200 rounded animate-pulse" />

  return (
    <Layout currentPath={path}>
      {/* Header */}
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold">{t('salesStatsPage')}</h2>
        {!loading && data && <span class="text-xs bg-base-200 px-2.5 py-1 rounded-full font-semibold">{t('salesCount')}: {data.sales_count}</span>}
      </div>

      {/* Filter */}
      <div class="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1">
        <input type="date" class="input input-bordered input-xs shrink-0" style="width:120px" value={draftFrom} onInput={e => setDraftFrom(e.target.value)} />
        <input type="time" class="input input-bordered input-xs shrink-0" style="width:70px" value={draftFromTime} onInput={e => setDraftFromTime(e.target.value)} />
        <span class="text-base-content/50 text-xs shrink-0">→</span>
        <input type="date" class="input input-bordered input-xs shrink-0" style="width:120px" value={draftTo} onInput={e => setDraftTo(e.target.value)} />
        <input type="time" class="input input-bordered input-xs shrink-0" style="width:70px" value={draftToTime} onInput={e => setDraftToTime(e.target.value)} />
        <button class={`btn btn-xs shrink-0 gap-1 ${isDirty ? 'btn-primary' : 'btn-ghost'}`} onClick={applyFilter} disabled={loading}>
          {loading ? <span class="loading loading-spinner loading-xs" /> : <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>}
        </button>
      </div>

      {/* Hero cards — Revenue + Margin */}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <div class="rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white p-4">
          <p class="text-xs opacity-70 mb-1">{t('revenueTTC')}</p>
          <p class="text-2xl font-extrabold tabular-nums">{loading ? <Loader /> : fmt(data?.revenue_ttc)}</p>
        </div>
        <div class="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4">
          <p class="text-xs opacity-70 mb-1">{t('revenueHT')}</p>
          <p class="text-2xl font-extrabold tabular-nums">{loading ? <Loader /> : fmt(data?.revenue_ht)}</p>
        </div>
        <div class="rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white p-4">
          <p class="text-xs opacity-70 mb-1">{t('statsTotalVAT')}</p>
          <p class="text-2xl font-extrabold tabular-nums">{loading ? <Loader /> : fmt(data?.total_vat)}</p>
        </div>
        <div class="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-4">
          <p class="text-xs opacity-70 mb-1">{t('grossEarning')} %</p>
          <p class="text-2xl font-extrabold tabular-nums">{loading ? <Loader /> : `${marginPct}%`}</p>
        </div>
      </div>

      {/* Cash vs Credit */}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        {[
          { label: t('cashRevenueTTC'), value: data?.cash_revenue_ttc, color: '#10b981' },
          { label: t('creditRevenueTTC'), value: data?.credit_revenue_ttc, color: '#f59e0b' },
          { label: t('paymentsCollected'), value: paymentsCollected, color: '#3b82f6' },
          { label: t('remaining'), value: Math.max(0, (data?.credit_revenue_ttc ?? 0) - paymentsCollected), color: '#ef4444' },
        ].map((item, i) => (
          <div key={i} class="bg-base-100 border border-base-200 rounded-xl p-3.5">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-2 h-2 rounded-full shrink-0" style={`background:${item.color}`} />
              <span class="text-xs text-base-content/70 truncate">{item.label}</span>
            </div>
            <p class="text-lg font-bold tabular-nums">{loading ? <Loader /> : fmt(item.value)}</p>
          </div>
        ))}
      </div>

      {/* Payment Methods + Timbre */}
      <div class="grid grid-cols-4 gap-2.5 mb-5">
        {[
          { label: t('payMethod_cash'), value: data?.cash_payment_ttc, icon: '💵' },
          { label: t('payMethod_cheque'), value: data?.cheque_payment_ttc, icon: '📄' },
          { label: t('payMethod_virement'), value: data?.virement_payment_ttc, icon: '🏦' },
          { label: t('timbreFiscal'), value: data?.total_timbre, icon: '📋' },
        ].map((item, i) => (
          <div key={i} class="bg-base-100 border border-base-200 rounded-xl p-3 text-center">
            <span class="text-lg">{item.icon}</span>
            <p class="text-base font-bold tabular-nums mt-1">{loading ? <Loader /> : fmt(item.value)}</p>
            <p class="text-xs text-base-content/70 mt-0.5 truncate">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Profitability table */}
      <div class="bg-base-100 border border-base-200 rounded-xl overflow-hidden mb-5">
        <div class="px-4 py-2.5 bg-base-200/50 border-b border-base-200">
          <span class="text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('grossEarning')}</span>
        </div>
        <div class="divide-y divide-base-200">
          {[
            { label: t('totalCost'), value: data?.total_cost, negative: true },
            { label: t('grossEarning'), value: data?.gross_earning, positive: true },
            { label: t('lossCost'), value: data?.loss_cost, negative: true },
            { label: t('netEarning'), value: data?.net_earning, positive: true },
            { label: t('expenseCost'), value: expenseSum, negative: true },
          ].map((row, i) => (
            <div key={i} class="flex items-center justify-between px-4 py-2.5">
              <span class="text-sm text-base-content/80">{row.label}</span>
              <span class={`text-sm font-bold tabular-nums ${row.negative ? 'text-error' : 'text-success'}`}>
                {loading ? <Loader /> : `${row.negative ? '-' : '+'}${fmt(row.value)}`}
              </span>
            </div>
          ))}
          <div class="flex items-center justify-between px-4 py-3 bg-base-200/30">
            <span class="text-sm font-bold">{t('finalEarning')}</span>
            <span class={`text-lg font-extrabold tabular-nums ${finalEarning >= 0 ? 'text-success' : 'text-error'}`}>
              {loading ? <Loader /> : fmt(finalEarning)}
            </span>
          </div>
        </div>
      </div>

      {/* Cash Register */}
      <div class="bg-base-100 border border-base-200 rounded-xl overflow-hidden mb-2">
        <div class="px-4 py-2.5 bg-base-200/50 border-b border-base-200">
          <span class="text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('cashInRegister')}</span>
        </div>
        <div class="divide-y divide-base-200">
          <div class="flex items-center justify-between px-4 py-2.5">
            <span class="text-sm text-base-content/80">{t('openingAmount')}</span>
            <span class="text-sm font-bold tabular-nums">{loading ? <Loader /> : fmt(caisseOpening)}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-2.5">
            <span class="text-sm text-base-content/80">{t('payMethod_cash')}</span>
            <span class="text-sm font-bold tabular-nums text-success">{loading ? <Loader /> : `+${fmt(data?.cash_payment_ttc)}`}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-2.5">
            <span class="text-sm text-base-content/80">{t('timbreFiscal')}</span>
            <span class="text-sm font-bold tabular-nums text-success">{loading ? <Loader /> : `+${fmt(data?.total_timbre)}`}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-2.5">
            <span class="text-sm text-base-content/80">{t('paymentsCollected')}</span>
            <span class="text-sm font-bold tabular-nums text-success">{loading ? <Loader /> : `+${fmt(paymentsCollected)}`}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-2.5">
            <span class="text-sm text-base-content/80">{t('expenses')}</span>
            <span class="text-sm font-bold tabular-nums text-error">{loading ? <Loader /> : `-${fmt(expenseSum)}`}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-2.5">
            <span class="text-sm text-base-content/80">{t('retraitCost')}</span>
            <span class="text-sm font-bold tabular-nums text-error">{loading ? <Loader /> : `-${fmt(retraitSum)}`}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-3 bg-info/5">
            <span class="text-sm font-bold">{t('cashInRegister')}</span>
            <span class="text-lg font-extrabold tabular-nums text-info">{loading ? <Loader /> : fmt(cashInRegister)}</span>
          </div>
          {caisseClosing != null && (<>
            <div class="flex items-center justify-between px-4 py-2.5">
              <span class="text-sm text-base-content/80">{t('closingAmount')}</span>
              <span class="text-sm font-bold tabular-nums">{loading ? <Loader /> : fmt(caisseClosing)}</span>
            </div>
            <div class={`flex items-center justify-between px-4 py-3 ${ecart >= 0 ? 'bg-success/5' : 'bg-error/5'}`}>
              <span class="text-sm font-bold">{t('caisseDifference')}</span>
              <span class={`text-lg font-extrabold tabular-nums ${ecart >= 0 ? 'text-success' : 'text-error'}`}>
                {loading ? <Loader /> : `${ecart >= 0 ? '+' : ''}${fmt(ecart)}`}
              </span>
            </div>
          </>)}
        </div>
      </div>
    </Layout>
  )
}
