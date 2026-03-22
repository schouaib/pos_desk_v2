import { useState, useEffect, useMemo } from 'preact/hooks'
import { saApi } from '../api'
import { useI18n } from '../../lib/i18n'

const PAGE_SIZE = 10
const SLO = { availabilityPct: 99.9, p90Ms: 200, p95Ms: 200, p99Ms: 200 }

function sloCheck(ep) {
  const violations = []
  if (ep.success_rate < SLO.availabilityPct) violations.push(`avail ${ep.success_rate}%`)
  if (ep.p90_ms > SLO.p90Ms) violations.push(`p90 ${ep.p90_ms}ms`)
  if (ep.p95_ms > SLO.p95Ms) violations.push(`p95 ${ep.p95_ms}ms`)
  if (ep.p99_ms > SLO.p99Ms) violations.push(`p99 ${ep.p99_ms}ms`)
  return { passing: violations.length === 0, violations }
}

const METHOD_STYLE = { GET: 'bg-sky-100 text-sky-700', POST: 'bg-emerald-100 text-emerald-700', PUT: 'bg-amber-100 text-amber-700', PATCH: 'bg-orange-100 text-orange-700', DELETE: 'bg-rose-100 text-rose-700' }

export default function ApiMetrics() {
  const { t } = useI18n()
  const [period, setPeriod] = useState('1h')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('count')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setPage(0)
    saApi.getMetrics(period)
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period])

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'path' ? 'asc' : 'desc') }
    setPage(0)
  }

  const sorted = useMemo(() => {
    if (!data?.endpoints) return []
    return [...data.endpoints].sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  if (loading) return <div class="flex justify-center py-16"><span class="loading loading-spinner loading-lg text-primary" /></div>
  if (error) return <div class="alert alert-error text-sm"><span>{error}</span></div>

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('apiMetrics') || 'API Metrics'}</h2>
        <div class="join">
          {['1h', '6h', '24h'].map(p => (
            <button key={p} class={`join-item btn btn-sm ${period === p ? 'btn-primary' : 'btn-ghost border border-base-300'}`} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>

      {data && (
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="card bg-base-100 shadow"><div class="card-body py-4 px-5">
            <p class="text-xs text-base-content/50">{t('totalRequests') || 'Total Requests'}</p>
            <p class="text-3xl font-bold text-primary">{data.total_requests?.toLocaleString()}</p>
          </div></div>
          <div class="card bg-base-100 shadow"><div class="card-body py-4 px-5">
            <p class="text-xs text-base-content/50">{t('overallSuccess') || 'Success Rate'}</p>
            <p class={`text-3xl font-bold ${data.success_rate >= 99 ? 'text-success' : 'text-warning'}`}>{data.success_rate}%</p>
          </div></div>
          <div class="card bg-base-100 shadow"><div class="card-body py-4 px-5">
            <p class="text-xs text-base-content/50">{t('endpoint') || 'Endpoints'}</p>
            <p class="text-3xl font-bold">{sorted.length}</p>
          </div></div>
        </div>
      )}

      {sorted.length > 0 && (
        <div class="card bg-base-100 shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="table table-sm w-full">
              <thead class="bg-base-200/60">
                <tr>
                  <th class="px-3 py-2 text-xs cursor-pointer" onClick={() => handleSort('path')}>Endpoint {sortKey === 'path' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                  <th class="px-3 py-2 text-xs text-right cursor-pointer" onClick={() => handleSort('count')}>Requests {sortKey === 'count' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                  <th class="px-3 py-2 text-xs text-right cursor-pointer" onClick={() => handleSort('success_rate')}>Success {sortKey === 'success_rate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                  <th class="px-3 py-2 text-xs text-right cursor-pointer" onClick={() => handleSort('avg_ms')}>Avg ms {sortKey === 'avg_ms' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                  <th class="px-3 py-2 text-xs text-right">P95</th>
                  <th class="px-3 py-2 text-xs text-right">P99</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((ep, i) => {
                  const { passing } = sloCheck(ep)
                  return (
                    <tr key={i} class={`border-b border-base-200 ${!passing ? 'bg-error/5' : ''}`}>
                      <td class="px-3 py-2">
                        <span class={`text-xs font-bold px-1.5 py-0.5 rounded ${METHOD_STYLE[ep.method] || ''}`}>{ep.method}</span>
                        <span class="font-mono text-xs ms-2">{ep.path}</span>
                      </td>
                      <td class="text-right px-3 py-2 tabular-nums">{ep.count.toLocaleString()}</td>
                      <td class="text-right px-3 py-2"><span class={ep.success_rate >= 99 ? 'text-success' : 'text-error'}>{ep.success_rate}%</span></td>
                      <td class="text-right px-3 py-2 tabular-nums">{ep.avg_ms}</td>
                      <td class="text-right px-3 py-2 tabular-nums">{ep.p95_ms}</td>
                      <td class="text-right px-3 py-2 tabular-nums">{ep.p99_ms}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div class="flex justify-center py-2 gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} class={`btn btn-xs ${page === i ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPage(i)}>{i + 1}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
