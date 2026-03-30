import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { isTenantAdmin } from '../lib/auth'
import { useI18n } from '../lib/i18n'

function today() {
  return new Date().toISOString().slice(0, 10)
}

const fmt = (v) => (v ?? 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" class={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d={d} />
  </svg>
)

function StatCard({ icon, label, value, color = 'primary', sub }) {
  const colors = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    error: 'bg-error/10 text-error',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-info/10 text-info',
  }
  const textColor = {
    primary: 'text-primary',
    success: 'text-success',
    error: 'text-error',
    warning: 'text-warning',
    info: 'text-info',
  }
  return (
    <div class="bg-base-100 rounded-xl border border-base-200 p-4 flex items-start gap-3 shadow-sm">
      <div class={`rounded-lg p-2.5 ${colors[color]}`}>
        <Icon d={icon} className="w-5 h-5" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs text-base-content/70 truncate">{label}</p>
        <p class={`text-lg font-bold tabular-nums mt-0.5 ${textColor[color]}`}>{value}</p>
        {sub && <p class="text-xs text-base-content/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function UserSummary({ path }) {
  const { t } = useI18n()
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [hourFrom, setHourFrom] = useState('')
  const [hourTo, setHourTo] = useState('')
  const [userId, setUserId] = useState('')
  const [users, setUsers] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isTenantAdmin()) return
    let cancelled = false
    async function loadUsers(page = 1, acc = []) {
      try {
        const res = await api.listUsers(page)
        if (cancelled) return
        const all = [...acc, ...res.items]
        if (page < res.pages) return loadUsers(page + 1, all)
        setUsers(all)
      } catch {}
    }
    loadUsers()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = { from: dateFrom, to: dateTo }
    if (hourFrom !== '') params.hour_from = hourFrom
    if (hourTo !== '') params.hour_to = hourTo
    if (userId !== '') params.user_id = userId
    api.getUserSummary(params)
      .then((res) => { if (!cancelled) setData(res) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dateFrom, dateTo, hourFrom, hourTo, userId])

  const hours = Array.from({ length: 24 }, (_, i) => i)

  const userCount = data?.users?.length ?? 0
  const grandSales = data?.grand_sales ?? 0
  const grandReturns = data?.grand_returns ?? 0
  const grandRetraits = data?.grand_retraits ?? 0
  const grandNet = data?.grand_net ?? 0
  const grandEcart = data?.grand_ecart ?? 0

  return (
    <Layout currentPath={path}>
      {/* Header */}
      <div class="flex items-center justify-between mb-5">
        <div>
          <h2 class="text-2xl font-bold">{t('userSummaryPage')}</h2>
          <p class="text-sm text-base-content/70 mt-0.5">
            {dateFrom === dateTo ? dateFrom : `${dateFrom} — ${dateTo}`}
            {hourFrom !== '' && hourTo !== '' && ` · ${String(hourFrom).padStart(2, '0')}:00 – ${String(hourTo).padStart(2, '0')}:59`}
          </p>
        </div>
        {!loading && data && (
          <div class="badge badge-lg badge-outline gap-1.5">
            <Icon d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" className="w-4 h-4" />
            {userCount} {t('users')}
          </div>
        )}
      </div>

      {/* Filters */}
      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-3 flex-wrap items-center">
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('dateFrom')}</span>
          <input type="date" class="input input-bordered input-sm"
            value={dateFrom} onInput={(e) => setDateFrom(e.target.value)} />
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('dateTo')}</span>
          <input type="date" class="input input-bordered input-sm"
            value={dateTo} onInput={(e) => setDateTo(e.target.value)} />
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('hourFrom')}</span>
          <select class="select select-bordered select-sm" value={hourFrom}
            onChange={(e) => setHourFrom(e.target.value)}>
            <option value="">{t('allDay')}</option>
            {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('hourTo')}</span>
          <select class="select select-bordered select-sm" value={hourTo}
            onChange={(e) => setHourTo(e.target.value)}>
            <option value="">{t('allDay')}</option>
            {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:59</option>)}
          </select>
        </div>
        {users.length > 0 && (
          <div class="flex flex-col">
            <span class="text-xs text-base-content/70 mb-0.5">{t('filterByUser')}</span>
            <select class="select select-bordered select-sm min-w-[140px]" value={userId}
              onChange={(e) => setUserId(e.target.value)}>
              <option value="">{t('allUsers')}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {!loading && data && data.users.length > 0 && (
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <StatCard
            icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
            label={t('summSalesTotal')}
            value={fmt(grandSales)}
            color="primary"
          />
          <StatCard
            icon="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
            label={t('summReturnsTotal')}
            value={fmt(grandReturns)}
            color="error"
          />
          <StatCard
            icon="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            label={t('summRetraitsTotal')}
            value={fmt(grandRetraits)}
            color="warning"
          />
          <StatCard
            icon="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
            label={t('summEcart')}
            value={`${grandEcart >= 0 ? '+' : ''}${fmt(grandEcart)}`}
            color={grandEcart >= 0 ? 'success' : 'error'}
          />
          <StatCard
            icon="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            label={t('summNet')}
            value={fmt(grandNet)}
            color={grandNet >= 0 ? 'success' : 'error'}
          />
        </div>
      )}

      {/* Table */}
      <div class="card bg-base-100 shadow-sm border border-base-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-sm w-full">
            <thead>
              <tr class="bg-base-200/60 border-b border-base-300">
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/70">{t('userEmail')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-center">{t('summSalesCount')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('summSalesTotal')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-success/70 text-end">{t('payMethod_cash')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-info/70 text-end">{t('payMethod_cheque')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-secondary/70 text-end">{t('payMethod_virement')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-center">{t('summReturnsCount')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-error/70 text-end">{t('summReturnsTotal')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-warning/70 text-end">{t('summRetraitsTotal')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-warning/70 text-end">{t('timbreFiscal')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-info/70 text-end">{t('summOpeningAmount')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-info/70 text-end">{t('summClosingAmount')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/70 text-end">{t('summEcart')}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-primary text-end">{t('summNet')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={14} class="py-16 text-center">
                  <span class="loading loading-spinner loading-md text-primary" />
                </td></tr>
              )}
              {!loading && (!data || data.users.length === 0) && (
                <tr><td colSpan={14} class="py-16 text-center">
                  <div class="flex flex-col items-center gap-2">
                    <Icon d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-8 h-8 text-base-content/50" />
                    <span class="text-sm text-base-content/50">{t('noData')}</span>
                  </div>
                </td></tr>
              )}
              {!loading && data && data.users.map((u, i) => (
                <tr key={u.user_id} class={`border-b border-base-200/60 hover:bg-base-200/30 transition-colors ${i % 2 === 0 ? '' : 'bg-base-200/10'}`}>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2.5">
                      <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold uppercase flex-shrink-0">
                        {(u.user_email || '?')[0]}
                      </div>
                      <span class="text-sm font-medium truncate max-w-[200px]">{u.user_email}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="badge badge-sm bg-primary/10 text-primary border-0 font-semibold">{u.sales_count}</span>
                  </td>
                  <td class="px-4 py-3 text-end font-mono text-sm font-semibold tabular-nums">{fmt(u.sales_total)}</td>
                  <td class="px-4 py-3 text-end font-mono text-sm text-success tabular-nums">{fmt(u.cash_sales_total || 0)}</td>
                  <td class="px-4 py-3 text-end font-mono text-sm text-info tabular-nums">{fmt(u.cheque_sales_total || 0)}</td>
                  <td class="px-4 py-3 text-end font-mono text-sm text-secondary tabular-nums">{fmt(u.virement_sales_total || 0)}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="badge badge-sm bg-error/10 text-error border-0 font-semibold">{u.returns_count}</span>
                  </td>
                  <td class="px-4 py-3 text-end font-mono text-sm text-error tabular-nums">{fmt(u.returns_total)}</td>
                  <td class="px-4 py-3 text-end font-mono text-sm text-warning tabular-nums">{fmt(u.retraits_total)}</td>
                  <td class="px-4 py-3 text-end font-mono text-sm text-warning tabular-nums">{fmt(u.timbre_total || 0)}</td>
                  <td class="px-4 py-3 text-end font-mono text-sm text-info tabular-nums">{fmt(u.opening_amount || 0)}</td>
                  <td class="px-4 py-3 text-end font-mono text-sm text-info tabular-nums">{fmt(u.closing_amount || 0)}</td>
                  <td class={`px-4 py-3 text-end font-mono text-sm font-bold tabular-nums ${(u.ecart || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                    {(u.ecart || 0) >= 0 ? '+' : ''}{fmt(u.ecart || 0)}
                  </td>
                  <td class={`px-4 py-3 text-end font-mono text-sm font-bold tabular-nums ${u.net >= 0 ? 'text-primary' : 'text-error'}`}>
                    {fmt(u.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && data && data.users.length > 0 && (
              <tfoot>
                <tr class="bg-base-200/80 border-t-2 border-base-300">
                  <td class="px-4 py-3.5 text-sm font-bold uppercase tracking-wide">{t('grandTotal')}</td>
                  <td class="px-4 py-3.5"></td>
                  <td class="px-4 py-3.5 text-end font-mono text-sm font-bold tabular-nums">{fmt(grandSales)}</td>
                  <td class="px-4 py-3.5 text-end font-mono text-sm font-bold text-success tabular-nums">{fmt(data.users.reduce((s, u) => s + (u.cash_sales_total || 0), 0))}</td>
                  <td class="px-4 py-3.5 text-end font-mono text-sm font-bold text-info tabular-nums">{fmt(data.users.reduce((s, u) => s + (u.cheque_sales_total || 0), 0))}</td>
                  <td class="px-4 py-3.5 text-end font-mono text-sm font-bold text-secondary tabular-nums">{fmt(data.users.reduce((s, u) => s + (u.virement_sales_total || 0), 0))}</td>
                  <td class="px-4 py-3.5"></td>
                  <td class="px-4 py-3.5 text-end font-mono text-sm font-bold text-error tabular-nums">{fmt(grandReturns)}</td>
                  <td class="px-4 py-3.5 text-end font-mono text-sm font-bold text-warning tabular-nums">{fmt(grandRetraits)}</td>
                  <td class="px-4 py-3.5 text-end font-mono text-sm font-bold text-warning tabular-nums">{fmt(data.users.reduce((s, u) => s + (u.timbre_total || 0), 0))}</td>
                  <td class="px-4 py-3.5 text-end font-mono text-sm font-bold text-info tabular-nums">{fmt(data.grand_opening || 0)}</td>
                  <td class="px-4 py-3.5 text-end font-mono text-sm font-bold text-info tabular-nums">{fmt(data.grand_closing || 0)}</td>
                  <td class={`px-4 py-3.5 text-end font-mono text-sm font-bold tabular-nums ${grandEcart >= 0 ? 'text-success' : 'text-error'}`}>
                    {grandEcart >= 0 ? '+' : ''}{fmt(grandEcart)}
                  </td>
                  <td class={`px-4 py-3.5 text-end font-mono text-base font-bold tabular-nums ${grandNet >= 0 ? 'text-primary' : 'text-error'}`}>
                    {fmt(grandNet)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Layout>
  )
}
