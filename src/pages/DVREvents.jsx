import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Pagination } from '../components/Pagination'

export default function DVREvents({ path }) {
  const { t, fmt } = useI18n()
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [refFilter, setRefFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('ref') || ''
  })
  const [clipUrl, setClipUrl] = useState(null)
  const [fetchingId, setFetchingId] = useState(null)

  const now = new Date()
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString().slice(0, 10))
  const [to, setTo] = useState(now.toISOString().slice(0, 10))

  async function load() {
    setLoading(true)
    try {
      const data = await api.listDVREvents({ from, to, type: typeFilter, ref: refFilter, page, limit: 10 })
      setEvents(data.items || [])
      setTotal(data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [from, to, typeFilter, refFilter, page])

  async function openClip(ev) {
    if (ev.status === 'done') {
      const token = sessionStorage.getItem('tenant_token')
      setClipUrl(api.getDVRClipURL(ev.id) + `?token=${token}`)
      document.getElementById('clip-dialog')?.showModal()
      return
    }
    setFetchingId(ev.id)
    try {
      await api.fetchDVRClip(ev.id)
      const poll = setInterval(async () => {
        try {
          const updated = await api.getDVREvent(ev.id)
          if (updated.status === 'done') {
            clearInterval(poll)
            setFetchingId(null)
            setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, status: 'done' } : e))
            const token = sessionStorage.getItem('tenant_token')
            setClipUrl(api.getDVRClipURL(ev.id) + `?token=${token}`)
            document.getElementById('clip-dialog')?.showModal()
          } else if (updated.status === 'ready' && updated.error) {
            clearInterval(poll)
            setFetchingId(null)
            alert(updated.error)
          }
        } catch { clearInterval(poll); setFetchingId(null) }
      }, 2000)
      setTimeout(() => { clearInterval(poll); setFetchingId(null) }, 120000)
    } catch (err) {
      setFetchingId(null)
      alert(err.message)
    }
  }

  function closeClip() {
    setClipUrl(null)
    document.getElementById('clip-dialog')?.close()
  }

  const pages = Math.ceil(total / 10) || 1

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold">{t('dvrEvents')}</h2>
      </div>

      {/* Filters */}
      <div class="bg-base-100 rounded-xl shadow-sm border border-base-300 p-3 mb-4 flex gap-3 flex-wrap items-center">
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('from')}</span>
          <input type="date" class="input input-bordered input-sm"
            value={from} onInput={(e) => { setFrom(e.target.value); setPage(1) }} />
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('to')}</span>
          <input type="date" class="input input-bordered input-sm"
            value={to} onInput={(e) => { setTo(e.target.value); setPage(1) }} />
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('reference')}</span>
          <div class="flex items-center gap-1">
            <input type="text" class="input input-bordered input-sm w-36" placeholder="VTE-000001"
              value={refFilter} onInput={(e) => { setRefFilter(e.target.value); setPage(1) }} />
            {refFilter && (
              <button class="btn btn-sm btn-ghost btn-square" onClick={() => { setRefFilter(''); setPage(1) }}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-base-content/70 mb-0.5">{t('eventType')}</span>
          <select class="select select-bordered select-sm" value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}>
            <option value="">{t('all')}</option>
            <option value="sale">{t('sale')}</option>
            <option value="return">{t('saleReturn')}</option>
            <option value="avoir">{t('avoir')}</option>
            <option value="caisse_close">{t('caisseClose')}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div class="card bg-base-100 shadow">
        <div class="overflow-x-auto">
          <table class="table table-sm w-full">
            <thead>
              <tr class="bg-base-200/60">
                <th class="px-3 py-2 text-xs">{t('type')}</th>
                <th class="px-3 py-2 text-xs">{t('reference')}</th>
                <th class="px-3 py-2 text-xs">{t('date')}</th>
                <th class="px-3 py-2 text-xs">{t('cashier')}</th>
                <th class="px-3 py-2 text-xs text-end">{t('amount')}</th>
                <th class="px-3 py-2 text-xs">{t('camera')}</th>
                <th class="px-3 py-2 text-xs">{t('status')}</th>
                <th class="px-3 py-2 text-xs text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colspan="8" class="text-center py-8">
                  <span class="loading loading-spinner loading-md" />
                </td></tr>
              )}
              {!loading && events.length === 0 && (
                <tr><td colspan="8" class="text-center py-8 text-base-content/50">
                  {t('noResults')}
                </td></tr>
              )}
              {!loading && events.map((ev) => (
                <tr key={ev.id} class="border-b border-base-200 hover:bg-base-50">
                  <td class="px-3 py-2">
                    <span class={`badge badge-sm ${
                      ev.event_type === 'sale' ? 'badge-primary' :
                      ev.event_type === 'return' ? 'badge-warning' :
                      ev.event_type === 'avoir' ? 'badge-error' :
                      'badge-info'
                    }`}>
                      {ev.event_type === 'sale' ? t('sale') :
                       ev.event_type === 'return' ? t('saleReturn') :
                       ev.event_type === 'avoir' ? t('avoir') :
                       t('caisseClose')}
                    </span>
                  </td>
                  <td class="px-3 py-2 font-mono text-sm">{ev.event_ref}</td>
                  <td class="px-3 py-2 text-sm">{new Date(ev.created_at).toLocaleString()}</td>
                  <td class="px-3 py-2 text-sm">{ev.cashier_email}</td>
                  <td class="px-3 py-2 text-sm text-end font-mono">{ev.amount ? fmt(ev.amount) : '-'}</td>
                  <td class="px-3 py-2 text-sm">CH {ev.camera_channel}</td>
                  <td class="px-3 py-2">
                    {ev.status === 'done' && <span class="badge badge-sm badge-success">{t('saved')}</span>}
                    {ev.status === 'ready' && <span class="badge badge-sm badge-ghost">{t('onDVR')}</span>}
                    {ev.status === 'downloading' && <span class="badge badge-sm badge-warning">{t('downloading')}</span>}
                    {ev.status === 'failed' && <span class="badge badge-sm badge-error">{t('failed')}</span>}
                  </td>
                  <td class="px-3 py-2 text-end">
                    {fetchingId === ev.id ? (
                      <span class="loading loading-spinner loading-sm" />
                    ) : (
                      <button class="btn btn-sm btn-ghost btn-square"
                        title={ev.status === 'done' ? t('watchClip') : t('downloadClip')}
                        onClick={() => openClip(ev)} disabled={!!fetchingId}>
                        {ev.status === 'done' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pages={pages} total={total} limit={10} onPageChange={setPage} />
      </div>

      {/* Video Player Dialog */}
      <dialog id="clip-dialog" class="modal">
        <div class="modal-box max-w-3xl p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-lg">{t('watchClip')}</h3>
            <button class="btn btn-sm btn-ghost btn-square" onClick={closeClip}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {clipUrl && (
            <video controls autoplay class="w-full rounded-lg bg-black" src={clipUrl}>
              Your browser does not support the video tag.
            </video>
          )}
        </div>
        <form method="dialog" class="modal-backdrop"><button onClick={closeClip}>close</button></form>
      </dialog>
    </Layout>
  )
}
