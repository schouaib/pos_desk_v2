import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

export default function Transfers({ path }) {
  const { t } = useI18n()
  const [locations, setLocations] = useState([])
  const [transfers, setTransfers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [locForm, setLocForm] = useState({ name: '', address: '' })
  const [tForm, setTForm] = useState({ from_location_id: '', to_location_id: '', lines: [] })
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('transfers') // 'transfers' | 'locations'

  async function loadLocations() {
    try { setLocations(await api.listLocations()) } catch {}
  }
  async function loadTransfers() {
    try { const r = await api.listTransfers({ page, limit: 10 }); setTransfers(r.items || []); setTotal(r.total || 0) } catch {}
  }

  useEffect(() => { loadLocations(); loadTransfers() }, [page])

  async function addLocation(e) {
    e.preventDefault()
    if (!locForm.name) return
    try { await api.createLocation(locForm); setLocForm({ name: '', address: '' }); loadLocations() } catch {}
  }
  async function deleteLocation(id) {
    try { await api.deleteLocation(id); loadLocations() } catch {}
  }

  async function searchProduct() {
    if (!productSearch.trim()) return
    try { const r = await api.listProducts({ q: productSearch, limit: 5 }); setProductResults(r.items || []) } catch {}
  }
  function addLine(p) {
    if (tForm.lines.find(l => l.product_id === p.id)) return
    setTForm({ ...tForm, lines: [...tForm.lines, { product_id: p.id, product_name: p.name, qty: 1 }] })
    setProductResults([])
    setProductSearch('')
  }

  async function createTransfer(e) {
    e.preventDefault()
    if (!tForm.from_location_id || !tForm.to_location_id || tForm.lines.length === 0) return
    setLoading(true)
    try {
      await api.createTransfer({
        from_location_id: tForm.from_location_id,
        to_location_id: tForm.to_location_id,
        lines: tForm.lines.map(l => ({ product_id: l.product_id, qty: l.qty })),
      })
      setTForm({ from_location_id: '', to_location_id: '', lines: [] })
      loadTransfers()
    } catch {} finally { setLoading(false) }
  }

  async function completeTransfer(id) {
    try { await api.completeTransfer(id); loadTransfers() } catch {}
  }
  async function deleteTransfer(id) {
    try { await api.deleteTransfer(id); loadTransfers() } catch {}
  }

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('transfers')}</h2>
        <div class="join">
          <button class={`join-item btn btn-sm ${tab === 'transfers' ? 'btn-primary' : ''}`} onClick={() => setTab('transfers')}>{t('transfers')}</button>
          <button class={`join-item btn btn-sm ${tab === 'locations' ? 'btn-primary' : ''}`} onClick={() => setTab('locations')}>{t('locations')}</button>
        </div>
      </div>

      {tab === 'locations' && (
        <div class="space-y-4">
          <form onSubmit={addLocation} class="flex gap-2">
            <input class="input input-bordered input-sm flex-1" placeholder={t('name')} value={locForm.name}
              onInput={(e) => setLocForm({ ...locForm, name: e.target.value })} required />
            <input class="input input-bordered input-sm flex-1" placeholder={t('address')} value={locForm.address}
              onInput={(e) => setLocForm({ ...locForm, address: e.target.value })} />
            <button type="submit" class="btn btn-sm btn-primary">{t('add')}</button>
          </form>
          <div class="card bg-base-100 shadow overflow-hidden overflow-y-auto max-h-[calc(100vh-280px)]">
            <table class="table table-sm">
              <thead class="bg-base-200/60"><tr><th>{t('name')}</th><th>{t('address')}</th><th>{t('status')}</th><th></th></tr></thead>
              <tbody>
                {locations.map(l => (
                  <tr key={l.id}>
                    <td>{l.name} {l.is_default && <span class="badge badge-xs badge-primary">Default</span>}</td>
                    <td class="text-sm">{l.address || '—'}</td>
                    <td><span class={`badge badge-xs ${l.active ? 'badge-success' : 'badge-ghost'}`}>{l.active ? t('active') : t('disabled')}</span></td>
                    <td>{!l.is_default && <button class="btn btn-xs btn-ghost text-error" onClick={() => deleteLocation(l.id)}>x</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'transfers' && (
        <div class="space-y-4">
          {/* Create transfer form */}
          <div class="card bg-base-100 shadow p-4 space-y-3">
            <p class="font-semibold text-sm">{t('add')} {t('transfers')}</p>
            <div class="grid grid-cols-2 gap-2">
              <label class="form-control"><span class="label-text text-xs">{t('fromLocation')}</span>
                <select class="select select-bordered select-sm" value={tForm.from_location_id}
                  onChange={(e) => setTForm({ ...tForm, from_location_id: e.target.value })}>
                  <option value="">—</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select></label>
              <label class="form-control"><span class="label-text text-xs">{t('toLocation')}</span>
                <select class="select select-bordered select-sm" value={tForm.to_location_id}
                  onChange={(e) => setTForm({ ...tForm, to_location_id: e.target.value })}>
                  <option value="">—</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select></label>
            </div>
            <div class="flex gap-1">
              <input class="input input-bordered input-sm flex-1" placeholder={t('searchProducts')} value={productSearch}
                onInput={(e) => setProductSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchProduct())} />
              <button type="button" class="btn btn-sm btn-outline" onClick={searchProduct}>{t('search')}</button>
            </div>
            {productResults.length > 0 && (
              <div class="bg-base-200 rounded p-1 max-h-24 overflow-y-auto">
                {productResults.map(p => (
                  <div key={p.id} class="text-xs cursor-pointer hover:bg-base-300 p-1 rounded" onClick={() => addLine(p)}>{p.name}</div>
                ))}
              </div>
            )}
            {tForm.lines.length > 0 && (
              <table class="table table-xs">
                <thead><tr><th>{t('productName')}</th><th class="w-20">{t('qty')}</th><th class="w-8"></th></tr></thead>
                <tbody>
                  {tForm.lines.map((l, i) => (
                    <tr key={i}>
                      <td class="text-xs">{l.product_name}</td>
                      <td><input type="number" min="1" step="any" class="input input-bordered input-xs w-20" value={l.qty}
                        onInput={(e) => setTForm({ ...tForm, lines: tForm.lines.map((x, j) => j === i ? { ...x, qty: parseFloat(e.target.value) || 1 } : x) })} /></td>
                      <td><button type="button" class="btn btn-xs btn-ghost text-error" onClick={() => setTForm({ ...tForm, lines: tForm.lines.filter((_, j) => j !== i) })}>x</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button class={`btn btn-sm btn-primary ${loading ? 'loading' : ''}`} disabled={loading} onClick={createTransfer}>{t('add')}</button>
          </div>

          {/* Transfer list */}
          <div class="card bg-base-100 shadow overflow-hidden overflow-y-auto max-h-[calc(100vh-280px)]">
            <table class="table table-sm">
              <thead class="bg-base-200/60"><tr><th>{t('fromLocation')}</th><th>{t('toLocation')}</th><th>{t('saleItems')}</th><th>{t('status')}</th><th>{t('saleDate')}</th><th>{t('actions')}</th></tr></thead>
              <tbody>
                {transfers.map(t_ => (
                  <tr key={t_.id}>
                    <td class="text-sm">{t_.from_location_name}</td>
                    <td class="text-sm">{t_.to_location_name}</td>
                    <td class="text-sm">{t_.lines?.length || 0}</td>
                    <td><span class={`badge badge-xs ${t_.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>{t_.status}</span></td>
                    <td class="text-xs">{new Date(t_.created_at).toLocaleDateString()}</td>
                    <td class="flex gap-1">
                      {t_.status === 'draft' && (
                        <>
                          <button class="btn btn-xs btn-success btn-outline" onClick={() => completeTransfer(t_.id)}>{t('completeTransfer')}</button>
                          <button class="btn btn-xs btn-ghost text-error" onClick={() => deleteTransfer(t_.id)}>x</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {transfers.length === 0 && (
                  <tr><td colSpan={6} class="text-center py-8 text-base-content/40">{t('noProducts')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  )
}
