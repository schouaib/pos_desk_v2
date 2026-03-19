import { useState, useEffect, useMemo } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

const PAGE_SIZE = 10

const SLO = {
  availabilityPct: 99.9,
  p90Ms: 200,
  p95Ms: 200,
  p99Ms: 200,
}

function sloCheck(ep) {
  const violations = []
  if (ep.success_rate < SLO.availabilityPct)
    violations.push(`avail ${ep.success_rate}% < ${SLO.availabilityPct}%`)
  if (ep.p90_ms > SLO.p90Ms) violations.push(`p90 ${ep.p90_ms}ms`)
  if (ep.p95_ms > SLO.p95Ms) violations.push(`p95 ${ep.p95_ms}ms`)
  if (ep.p99_ms > SLO.p99Ms) violations.push(`p99 ${ep.p99_ms}ms`)
  return { passing: violations.length === 0, violations }
}

const METHOD_STYLE = {
  GET:    'bg-sky-100 text-sky-700',
  POST:   'bg-emerald-100 text-emerald-700',
  PUT:    'bg-amber-100 text-amber-700',
  PATCH:  'bg-orange-100 text-orange-700',
  DELETE: 'bg-rose-100 text-rose-700',
}

const SORT_COLS = [
  { key: 'path',         label: 'endpoint' },
  { key: 'count',        label: 'requests' },
  { key: 'error_count',  label: 'errors' },
  { key: 'success_rate', label: 'successRate' },
  { key: 'min_ms',       label: 'minMs' },
  { key: 'avg_ms',       label: 'avgMs' },
  { key: 'max_ms',       label: 'maxMs' },
  { key: 'p50_ms',       label: 'p50' },
  { key: 'p90_ms',       label: 'p90' },
  { key: 'p95_ms',       label: 'p95' },
  { key: 'p99_ms',       label: 'p99' },
]

function msColor(val, threshold) {
  if (val > threshold * 2.5) return 'text-error font-semibold'
  if (val > threshold) return 'text-warning font-semibold'
  return 'text-base-content/70'
}

function SortTh({ col, sortKey, sortDir, onSort, align = 'right', children }) {
  const active = sortKey === col
  return (
    <th
      class={`text-${align} cursor-pointer select-none whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-base-content/50 hover:text-base-content transition-colors`}
      onClick={() => onSort(col)}
    >
      {children}
      <span class="ms-1 inline-block w-3 text-center">
        {active ? (sortDir === 'asc' ? '↑' : '↓') : <span class="opacity-30">↕</span>}
      </span>
    </th>
  )
}

export default function ApiMetrics({ path }) {
  const { t } = useI18n()
  const [period, setPeriod]   = useState('1h')
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [sortKey, setSortKey] = useState('count')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage]       = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setPage(0)
    api.getMetrics(period)
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

  const sloSummary = useMemo(() => {
    if (!sorted.length) return null
    const passing = sorted.filter(ep => sloCheck(ep).passing).length
    return { passing, total: sorted.length, pct: Math.round(passing / sorted.length * 100) }
  }, [sorted])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageRows   = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <Layout currentPath={path}>
      <div class="space-y-5">

        {/* ── Header ── */}
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 class="text-2xl font-bold">{t('apiMetrics')}</h1>
            <p class="text-xs text-base-content/50 mt-0.5">
              SLO: {t('sloDefinition')({ avail: SLO.availabilityPct, p90: SLO.p90Ms, p95: SLO.p95Ms, p99: SLO.p99Ms })}
            </p>
          </div>
          <div class="join">
            {['1h', '6h', '24h'].map(p => (
              <button key={p} class={`join-item btn btn-sm ${period === p ? 'btn-primary' : 'btn-ghost border border-base-300'}`} onClick={() => setPeriod(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div class="flex justify-center py-16">
            <span class="loading loading-spinner loading-lg text-primary" />
          </div>
        )}

        {error && <div class="alert alert-error text-sm"><span>{error}</span></div>}

        {!loading && !error && data && (
          <>
            {/* ── Stat cards ── */}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="card bg-base-100 shadow">
                <div class="card-body py-4 px-5">
                  <p class="text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('totalRequests')}</p>
                  <p class="text-3xl font-bold text-primary mt-1">{data.total_requests.toLocaleString()}</p>
                  <p class="text-xs text-base-content/40 mt-1">{t('period')}: {data.period}</p>
                </div>
              </div>
              <div class="card bg-base-100 shadow">
                <div class="card-body py-4 px-5">
                  <p class="text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('overallSuccess')} <span class="badge badge-xs badge-ghost ms-1">SLI</span></p>
                  <p class={`text-3xl font-bold mt-1 ${data.success_rate >= SLO.availabilityPct ? 'text-success' : data.success_rate >= 95 ? 'text-warning' : 'text-error'}`}>
                    {data.success_rate}%
                  </p>
                  <p class="text-xs text-base-content/40 mt-1">SLO ≥ {SLO.availabilityPct}%</p>
                </div>
              </div>
              {sloSummary && (
                <div class="card bg-base-100 shadow">
                  <div class="card-body py-4 px-5">
                    <p class="text-xs font-semibold uppercase tracking-wide text-base-content/50">{t('sloCompliance')}</p>
                    <p class={`text-3xl font-bold mt-1 ${sloSummary.pct === 100 ? 'text-success' : sloSummary.pct >= 80 ? 'text-warning' : 'text-error'}`}>
                      {sloSummary.pct}%
                    </p>
                    <p class="text-xs text-base-content/40 mt-1">{sloSummary.passing}/{sloSummary.total} {t('endpointsPassing')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Table ── */}
            {sorted.length === 0 ? (
              <div class="card bg-base-100 shadow">
                <div class="card-body items-center py-16 text-base-content/40">{t('noMetrics')}</div>
              </div>
            ) : (
              <div class="card bg-base-100 shadow overflow-hidden">
                <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
                  <table class="table table-sm w-full">
                    <thead class="bg-base-200/60">
                      {/* Column group labels */}
                      <tr class="border-b-0">
                        <th colSpan={2} class="py-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-base-content/40 border-r border-base-300" />
                        <th colSpan={3} class="py-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-base-content/40 text-center border-r border-base-300">
                          Traffic
                        </th>
                        <th colSpan={3} class="py-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-base-content/40 text-center border-r border-base-300">
                          Latency
                        </th>
                        <th colSpan={4} class="py-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-base-content/40 text-center">
                          Percentiles
                        </th>
                      </tr>
                      {/* Sort headers */}
                      <tr>
                        <th class="py-2 px-3 text-xs font-semibold uppercase tracking-wide text-base-content/50 whitespace-nowrap w-16">SLO</th>
                        <SortTh col="path" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left">{t('endpoint')}</SortTh>
                        <SortTh col="count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t('requests')}</SortTh>
                        <SortTh col="error_count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t('errors')}</SortTh>
                        <SortTh col="success_rate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t('successRate')}</SortTh>
                        <SortTh col="min_ms" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t('minMs')}</SortTh>
                        <SortTh col="avg_ms" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t('avgMs')}</SortTh>
                        <SortTh col="max_ms" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t('maxMs')}</SortTh>
                        <SortTh col="p50_ms" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>P50</SortTh>
                        <SortTh col="p90_ms" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>P90</SortTh>
                        <SortTh col="p95_ms" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>P95</SortTh>
                        <SortTh col="p99_ms" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>P99</SortTh>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((ep, i) => {
                        const { passing, violations } = sloCheck(ep)
                        const methodStyle = METHOD_STYLE[ep.method] || 'bg-base-200 text-base-content'
                        return (
                          <tr key={i} class={`border-b border-base-200 hover:bg-base-50 transition-colors ${!passing ? 'bg-error/5' : ''}`}>
                            <td class="px-3 py-2.5">
                              <span
                                title={violations.length ? violations.join(' · ') : 'All SLOs met'}
                                class={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full cursor-default ${passing ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}
                              >
                                {passing ? '✓' : '✗'}
                              </span>
                            </td>
                            <td class="px-3 py-2.5 max-w-xs">
                              <div class="flex items-center gap-2">
                                <span class={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${methodStyle}`}>
                                  {ep.method}
                                </span>
                                <span class="font-mono text-xs text-base-content/80 truncate">{ep.path}</span>
                              </div>
                            </td>
                            <td class="text-right px-3 py-2.5 tabular-nums text-sm font-medium">{ep.count.toLocaleString()}</td>
                            <td class="text-right px-3 py-2.5 tabular-nums text-sm">
                              {ep.error_count > 0
                                ? <span class="font-semibold text-error">{ep.error_count.toLocaleString()}</span>
                                : <span class="text-base-content/30">—</span>}
                            </td>
                            <td class="text-right px-3 py-2.5 tabular-nums text-sm">
                              <span class={`font-semibold ${ep.success_rate >= SLO.availabilityPct ? 'text-success' : ep.success_rate >= 95 ? 'text-warning' : 'text-error'}`}>
                                {ep.success_rate}%
                              </span>
                            </td>
                            <td class="text-right px-3 py-2.5 tabular-nums text-sm text-base-content/60">{ep.min_ms}</td>
                            <td class="text-right px-3 py-2.5 tabular-nums text-sm text-base-content/70">{ep.avg_ms}</td>
                            <td class={`text-right px-3 py-2.5 tabular-nums text-sm ${msColor(ep.max_ms, 200)}`}>{ep.max_ms}</td>
                            <td class="text-right px-3 py-2.5 tabular-nums text-sm text-base-content/60">{ep.p50_ms}</td>
                            <td class={`text-right px-3 py-2.5 tabular-nums text-sm ${msColor(ep.p90_ms, SLO.p90Ms)}`}>{ep.p90_ms}</td>
                            <td class={`text-right px-3 py-2.5 tabular-nums text-sm ${msColor(ep.p95_ms, SLO.p95Ms)}`}>{ep.p95_ms}</td>
                            <td class={`text-right px-3 py-2.5 tabular-nums text-sm ${msColor(ep.p99_ms, SLO.p99Ms)}`}>{ep.p99_ms}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                  <div class="flex items-center justify-between px-4 py-3 border-t border-base-200 bg-base-50">
                    <span class="text-xs text-base-content/50">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} / {sorted.length}
                    </span>
                    <div class="join">
                      <button class="join-item btn btn-xs btn-ghost border border-base-300" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button key={i} class={`join-item btn btn-xs ${page === i ? 'btn-primary' : 'btn-ghost border border-base-300'}`} onClick={() => setPage(i)}>
                          {i + 1}
                        </button>
                      ))}
                      <button class="join-item btn btn-xs btn-ghost border border-base-300" disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
