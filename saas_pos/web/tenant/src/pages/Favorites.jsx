import { useState, useEffect, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { hasPerm } from '../lib/auth'

const COLOR_PALETTE = [
  '#ef4444','#dc2626','#f97316','#ea580c','#eab308','#ca8a04',
  '#22c55e','#16a34a','#14b8a6','#0d9488','#06b6d4','#0891b2',
  '#3b82f6','#2563eb','#6366f1','#4f46e5','#a855f7','#9333ea',
  '#ec4899','#be185d',
]

export default function Favorites({ path }) {
  const { t } = useI18n()
  const canEdit = hasPerm('favorites', 'edit')

  const [favorites, setFavorites] = useState([])
  const [favColors, setFavColors] = useState({})
  const [groups, setGroups] = useState([])
  const [activeTab, setActiveTab] = useState('main')
  const [newGroupName, setNewGroupName] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const searchRef = useRef(null)
  const timerRef = useRef(null)

  // Load data on mount
  useEffect(() => {
    let cancelled = false
    api.getStoreSettings().then(d => {
      if (cancelled) return
      const favIds = d.pos_favorites || []
      const groupDefs = d.pos_fav_groups || []
      setFavColors(d.pos_fav_colors || {})

      const allIds = [...favIds]
      for (const g of groupDefs) if (g.product_ids) allIds.push(...g.product_ids)
      const uniqueIds = [...new Set(allIds)]

      if (uniqueIds.length > 0) {
        api.getProductsByIds(uniqueIds).then(prods => {
          if (cancelled) return
          const map = {}
          for (const p of prods) map[p.id] = p
          setFavorites(favIds.map(id => map[id]).filter(Boolean))
          setGroups(groupDefs.map(g => ({
            name: g.name,
            color: g.color || '',
            products: (g.product_ids || []).map(id => map[id]).filter(Boolean),
          })))
          setInitialLoading(false)
        }).catch(() => setInitialLoading(false))
      } else {
        setInitialLoading(false)
      }
    }).catch(() => setInitialLoading(false))
    return () => { cancelled = true }
  }, [])

  // Debounced search
  useEffect(() => {
    const q = searchQ.trim()
    if (!q) { setResults([]); return }
    let cancelled = false
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await api.listProducts({ q, limit: 10 })
        if (!cancelled) setResults(data.items || [])
      } catch { if (!cancelled) setResults([]) }
      finally { if (!cancelled) setLoading(false) }
    }, 300)
    return () => { cancelled = true; clearTimeout(timerRef.current) }
  }, [searchQ])

  const isMain = activeTab === 'main'
  const activeGroupIdx = isMain ? -1 : parseInt(activeTab.split(':')[1], 10)
  const activeList = isMain ? favorites : (groups[activeGroupIdx]?.products || [])

  function addProduct(product) {
    if (activeList.some(p => p.id === product.id)) return
    if (isMain) {
      setFavorites(prev => [...prev, product])
    } else {
      setGroups(prev => prev.map((g, i) => i === activeGroupIdx ? { ...g, products: [...g.products, product] } : g))
    }
  }

  function removeProduct(id) {
    if (isMain) {
      setFavorites(prev => prev.filter(p => p.id !== id))
      setFavColors(prev => { const next = { ...prev }; delete next[id]; return next })
    } else {
      setGroups(prev => prev.map((g, i) => i === activeGroupIdx ? { ...g, products: g.products.filter(p => p.id !== id) } : g))
    }
  }

  function setProductColor(productId, color) {
    setFavColors(prev => {
      const next = { ...prev }
      if (color) next[productId] = color
      else delete next[productId]
      return next
    })
  }

  function setGroupColor(idx, color) {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...g, color } : g))
  }

  function addGroup() {
    const name = newGroupName.trim()
    if (!name) return
    setGroups(prev => [...prev, { name, color: '', products: [] }])
    setNewGroupName('')
    setActiveTab(`group:${groups.length}`)
  }

  function deleteGroup(idx) {
    setGroups(prev => prev.filter((_, i) => i !== idx))
    setActiveTab('main')
  }

  async function handleSave() {
    setSaving(true)
    try {
      await Promise.all([
        api.updatePosFavorites(favorites.map(p => p.id), favColors),
        api.updatePosFavGroups(groups.map(g => ({
          name: g.name,
          color: g.color || '',
          product_ids: g.products.map(p => p.id),
        }))),
      ])
    } catch {}
    finally { setSaving(false) }
  }

  if (initialLoading) {
    return (
      <Layout path={path}>
        <div class="flex justify-center py-16">
          <span class="loading loading-spinner loading-lg text-primary" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout path={path}>
      <div class="p-4 max-w-5xl mx-auto">
        {/* Header */}
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-xl font-bold">{t('manageFavorites')}</h1>
          {canEdit && (
            <button class={`btn btn-primary btn-sm ${saving ? 'loading' : ''}`} onClick={handleSave} disabled={saving}>
              {t('save')}
            </button>
          )}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Tabs + current items */}
          <div class="lg:col-span-2">
            {/* Tabs */}
            <div class="flex flex-wrap gap-1.5 mb-4">
              <button
                class={`btn btn-sm whitespace-nowrap gap-1 ${isMain ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setActiveTab('main')}
              >
                {t('favorites')}
                {favorites.length > 0 && <span class={`badge badge-xs ${isMain ? 'badge-neutral' : 'badge-ghost'}`}>{favorites.length}</span>}
              </button>
              {groups.map((g, idx) => (
                <button
                  key={idx}
                  class={`btn btn-sm whitespace-nowrap gap-1 ${activeTab === `group:${idx}` ? 'btn-primary' : 'btn-outline'}`}
                  style={g.color ? { backgroundColor: g.color, borderColor: g.color, color: '#fff' } : {}}
                  onClick={() => setActiveTab(`group:${idx}`)}
                >
                  {g.color && <span class="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#fff' }} />}
                  {g.name}
                  {g.products.length > 0 && <span class={`badge badge-xs ${activeTab === `group:${idx}` ? 'badge-neutral' : 'badge-ghost'}`}>{g.products.length}</span>}
                </button>
              ))}
            </div>

            {/* Add new group */}
            <div class="flex gap-2 mb-4">
              <input
                class="input input-bordered input-sm flex-1"
                placeholder={t('groupName')}
                value={newGroupName}
                onInput={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addGroup()}
              />
              <button class="btn btn-sm btn-outline btn-primary" onClick={addGroup}>{t('addGroup')}</button>
            </div>

            {/* Group actions: color picker + delete */}
            {!isMain && (
              <div class="flex flex-wrap justify-between items-center mb-4 bg-base-200 rounded-lg px-3 py-2">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs text-base-content/60 font-medium">{t('pickColor')}:</span>
                  <button class={`w-5 h-5 rounded-full border-2 ${!groups[activeGroupIdx]?.color ? 'border-base-content ring-2 ring-base-content/20' : 'border-base-300'}`} title={t('noColor')} onClick={() => setGroupColor(activeGroupIdx, '')} />
                  {COLOR_PALETTE.map(c => (
                    <button key={c} class={`w-5 h-5 rounded-full border-2 transition-transform ${groups[activeGroupIdx]?.color === c ? 'border-base-content scale-125 ring-2 ring-base-content/20' : 'border-transparent hover:scale-110'}`} style={{ backgroundColor: c }} onClick={() => setGroupColor(activeGroupIdx, c)} />
                  ))}
                </div>
                <button class="btn btn-xs btn-ghost text-error gap-1" onClick={() => deleteGroup(activeGroupIdx)}>
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  {t('deleteGroup')}
                </button>
              </div>
            )}

            {/* Current items */}
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body p-4">
                <h3 class="font-semibold text-sm mb-3 text-base-content/70">
                  {isMain ? t('favorites') : groups[activeGroupIdx]?.name} ({activeList.length})
                </h3>
                {activeList.length === 0 ? (
                  <p class="text-sm text-base-content/40 py-4 text-center">{isMain ? t('noFavorites') : t('noProducts')}</p>
                ) : (
                  <div class="flex flex-wrap gap-2">
                    {activeList.map(p => {
                      const pc = favColors[p.id] || null
                      return (
                        <div key={p.id} class="badge badge-lg gap-1.5 py-3" style={pc ? { backgroundColor: pc, color: '#fff', borderColor: pc } : {}}>
                          <span class="text-xs truncate max-w-40">{p.name}</span>
                          <div class="dropdown dropdown-bottom">
                            <label tabIndex={0} class="w-4 h-4 rounded-full border-2 cursor-pointer inline-block shrink-0 hover:scale-110 transition-transform" style={pc ? { backgroundColor: pc, borderColor: 'rgba(255,255,255,0.5)' } : { backgroundColor: 'transparent', borderColor: 'currentColor' }} />
                            <div tabIndex={0} class="dropdown-content z-50 p-2 shadow-lg bg-base-100 rounded-lg grid grid-cols-5 gap-1 w-40">
                              <button class="w-6 h-6 rounded-full border-2 border-base-300 hover:border-base-content" title={t('noColor')} onClick={() => setProductColor(p.id, '')} />
                              {COLOR_PALETTE.map(c => (
                                <button key={c} class={`w-6 h-6 rounded-full border-2 transition-transform ${pc === c ? 'border-base-content scale-110' : 'border-transparent hover:scale-110'}`} style={{ backgroundColor: c }} onClick={() => setProductColor(p.id, c)} />
                              ))}
                            </div>
                          </div>
                          <button class="hover:text-error transition-colors" onClick={() => removeProduct(p.id)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Search to add products */}
          <div>
            <div class="card bg-base-100 shadow-sm sticky top-4">
              <div class="card-body p-4">
                <h3 class="font-semibold text-sm mb-3 text-base-content/70">{t('addToFavorites')}</h3>
                <input
                  ref={searchRef}
                  class="input input-bordered w-full input-sm mb-3"
                  placeholder={t('searchProducts')}
                  value={searchQ}
                  onInput={(e) => setSearchQ(e.target.value)}
                  autoComplete="off"
                />

                {loading && (
                  <div class="flex justify-center py-3">
                    <span class="loading loading-spinner loading-sm text-primary" />
                  </div>
                )}

                <div class="space-y-1 max-h-96 overflow-y-auto">
                  {results.filter(p => !activeList.some(f => f.id === p.id)).map(p => (
                    <button
                      key={p.id}
                      class="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-base-200 text-start transition-colors"
                      onClick={() => addProduct(p)}
                    >
                      <div class="min-w-0">
                        <p class="font-medium text-sm truncate">{p.name}</p>
                        <p class="text-xs text-base-content/50">{p.barcodes?.[0] || ''}</p>
                      </div>
                      <span class="text-lg text-primary shrink-0 ms-2">+</span>
                    </button>
                  ))}
                  {searchQ.trim() && !loading && results.length === 0 && (
                    <p class="text-center text-sm text-base-content/40 py-4">{t('noProducts')}</p>
                  )}
                  {!searchQ.trim() && (
                    <p class="text-center text-sm text-base-content/40 py-4">{t('favoritesSearch')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
