import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { isTenantAdmin } from '../lib/auth'
import { useI18n } from '../lib/i18n'

function today() {
  return new Date().toISOString().slice(0, 10)
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

  // Load users list for the filter dropdown (admin only sees all users)
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

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('userSummaryPage')}</h2>
      </div>

      {/* Filters */}
      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-3 flex-wrap items-end">
        <label class="form-control">
          <span class="label-text text-xs">{t('dateFrom')}</span>
          <input type="date" class="input input-bordered input-sm"
            value={dateFrom} onInput={(e) => setDateFrom(e.target.value)} />
        </label>
        <label class="form-control">
          <span class="label-text text-xs">{t('dateTo')}</span>
          <input type="date" class="input input-bordered input-sm"
            value={dateTo} onInput={(e) => setDateTo(e.target.value)} />
        </label>
        <label class="form-control">
          <span class="label-text text-xs">{t('hourFrom')}</span>
          <select class="select select-bordered select-sm" value={hourFrom}
            onChange={(e) => setHourFrom(e.target.value)}>
            <option value="">{t('allDay')}</option>
            {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </label>
        <label class="form-control">
          <span class="label-text text-xs">{t('hourTo')}</span>
          <select class="select select-bordered select-sm" value={hourTo}
            onChange={(e) => setHourTo(e.target.value)}>
            <option value="">{t('allDay')}</option>
            {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:59</option>)}
          </select>
        </label>
        {users.length > 0 && (
          <label class="form-control">
            <span class="label-text text-xs">{t('filterByUser')}</span>
            <select class="select select-bordered select-sm" value={userId}
              onChange={(e) => setUserId(e.target.value)}>
              <option value="">{t('allUsers')}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Table */}
      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('userEmail')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-center">{t('summSalesCount')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('summSalesTotal')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-center">{t('summReturnsCount')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-error text-end">{t('summReturnsTotal')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-warning text-end">{t('summRetraitsTotal')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-info text-end">{t('summOpeningAmount')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-info text-end">{t('summClosingAmount')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 text-end">{t('summEcart')}</th>
                <th class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary text-end">{t('summNet')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} class="py-10 text-center">
                  <span class="loading loading-spinner loading-md text-primary" />
                </td></tr>
              )}
              {!loading && (!data || data.users.length === 0) && (
                <tr><td colSpan={10} class="py-12 text-center text-base-content/30 text-sm">{t('noData')}</td></tr>
              )}
              {!loading && data && data.users.map((u) => (
                <tr key={u.user_id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                  <td class="px-3 py-2.5 text-sm">{u.user_email}</td>
                  <td class="px-3 py-2.5 text-center">
                    <span class="badge badge-sm badge-ghost">{u.sales_count}</span>
                  </td>
                  <td class="px-3 py-2.5 text-end font-mono text-sm font-semibold">{u.sales_total.toFixed(2)}</td>
                  <td class="px-3 py-2.5 text-center">
                    <span class="badge badge-sm badge-error badge-outline">{u.returns_count}</span>
                  </td>
                  <td class="px-3 py-2.5 text-end font-mono text-sm text-error">{u.returns_total.toFixed(2)}</td>
                  <td class="px-3 py-2.5 text-end font-mono text-sm text-warning">{u.retraits_total.toFixed(2)}</td>
                  <td class="px-3 py-2.5 text-end font-mono text-sm text-info">{(u.opening_amount || 0).toFixed(2)}</td>
                  <td class="px-3 py-2.5 text-end font-mono text-sm text-info">{(u.closing_amount || 0).toFixed(2)}</td>
                  <td class={`px-3 py-2.5 text-end font-mono text-sm font-bold ${(u.ecart || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                    {(u.ecart || 0) >= 0 ? '+' : ''}{(u.ecart || 0).toFixed(2)}
                  </td>
                  <td class={`px-3 py-2.5 text-end font-mono text-sm font-bold ${u.net >= 0 ? 'text-primary' : 'text-error'}`}>
                    {u.net.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Grand total footer */}
            {!loading && data && data.users.length > 0 && (
              <tfoot class="bg-base-200/80 font-semibold">
                <tr>
                  <td class="px-3 py-3 text-sm uppercase">{t('grandTotal')}</td>
                  <td class="px-3 py-3"></td>
                  <td class="px-3 py-3 text-end font-mono text-sm">{data.grand_sales.toFixed(2)}</td>
                  <td class="px-3 py-3"></td>
                  <td class="px-3 py-3 text-end font-mono text-sm text-error">{data.grand_returns.toFixed(2)}</td>
                  <td class="px-3 py-3 text-end font-mono text-sm text-warning">{data.grand_retraits.toFixed(2)}</td>
                  <td class="px-3 py-3 text-end font-mono text-sm text-info">{(data.grand_opening || 0).toFixed(2)}</td>
                  <td class="px-3 py-3 text-end font-mono text-sm text-info">{(data.grand_closing || 0).toFixed(2)}</td>
                  <td class={`px-3 py-3 text-end font-mono text-sm font-bold ${(data.grand_ecart || 0) >= 0 ? 'text-success' : 'text-error'}`}>
                    {(data.grand_ecart || 0) >= 0 ? '+' : ''}{(data.grand_ecart || 0).toFixed(2)}
                  </td>
                  <td class={`px-3 py-3 text-end font-mono text-sm font-bold ${data.grand_net >= 0 ? 'text-primary' : 'text-error'}`}>
                    {data.grand_net.toFixed(2)}
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
