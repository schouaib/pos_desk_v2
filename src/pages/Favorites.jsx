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

/* ── Inline color-picker popover (fixed position to avoid table overflow clip) */
function ColorDot({ color, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle() {
    if (open) { setOpen(false); return }
    const rect = btnRef.current.getBoundingClientRect()
    const panelW = 180, panelH = 160
    let top = rect.bottom + 6
    let left = rect.left + rect.width / 2 - panelW / 2
    // keep inside viewport
    if (left < 8) left = 8
    if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8
    if (top + panelH > window.innerHeight - 8) top = rect.top - panelH - 6
    setPos({ top, left })
    setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        class="w-7 h-7 rounded-full border-2 cursor-pointer inline-flex items-center justify-center hover:scale-110 transition-all duration-200 shadow-sm"
        style={color
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: 'transparent', borderColor: 'var(--fallback-bc,oklch(var(--bc)/0.3))' }}
        onClick={toggle}
      >
        {!color && (
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125V7.5" />
          </svg>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          class="fixed z-[9999] p-2.5 bg-base-100 rounded-xl shadow-xl border border-base-300 grid grid-cols-5 gap-1.5 w-[180px]"
          style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
        >
          <button
            class={`w-7 h-7 rounded-full border-2 transition-all duration-150 ${!color ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-base-300 hover:border-base-content/40 hover:scale-105'}`}
            style={{ background: 'repeating-conic-gradient(#ddd 0% 25%, transparent 0% 50%) 50% / 8px 8px' }}
            onClick={() => { onChange(''); setOpen(false) }}
          />
          {COLOR_PALETTE.map(c => (
            <button
              key={c}
              class={`w-7 h-7 rounded-full border-2 transition-all duration-150 ${color === c ? 'border-white ring-2 ring-offset-1 ring-primary scale-110 shadow-md' : 'border-transparent hover:scale-110 hover:shadow-md'}`}
              style={{ backgroundColor: c }}
              onClick={() => { onChange(c); setOpen(false) }}
            />
          ))}
        </div>
      )}
    </>
  )
}

/* ── Confirm dialog ──────────────────────────────────────────────────────── */
function ConfirmDialog({ open, message, onConfirm, onCancel, t }) {
  if (!open) return null
  return (
    <dialog class="modal modal-open" style={{ zIndex: 9999 }}>
      <div class="modal-box max-w-sm text-center">
        <div class="flex justify-center mb-4">
          <div class="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
        </div>
        <p class="text-sm font-medium mb-5">{message}</p>
        <div class="flex gap-2 justify-center">
          <button class="btn btn-sm btn-ghost min-w-[80px]" onClick={onCancel}>{t('cancel')}</button>
          <button class="btn btn-sm btn-error min-w-[80px]" onClick={onConfirm}>{t('yes')}</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button onClick={onCancel}>close</button></form>
    </dialog>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function Favorites({ path }) {
  const { t, fmt } = useI18n()
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
  const [showSearch, setShowSearch] = useState(false)
  const [confirmState, setConfirmState] = useState(null) // { message, onConfirm }
  const [addingColor, setAddingColor] = useState('') // color to assign when adding from modal
  const searchRef = useRef(null)
  const timerRef = useRef(null)

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

  useEffect(() => {
    const q = searchQ.trim()
    if (!q) { setResults([]); return }
    let cancelled = false
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await api.listProducts({ q, limit: 20 })
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
    if (addingColor) setFavColors(prev => ({ ...prev, [product.id]: addingColor }))
  }

  function requestRemoveProduct(id, name) {
    setConfirmState({
      message: t('confirmRemoveFavorite'),
      onConfirm: () => {
        if (isMain) {
          setFavorites(prev => prev.filter(p => p.id !== id))
          setFavColors(prev => { const next = { ...prev }; delete next[id]; return next })
        } else {
          setGroups(prev => prev.map((g, i) => i === activeGroupIdx ? { ...g, products: g.products.filter(p => p.id !== id) } : g))
        }
        setConfirmState(null)
      },
    })
  }

  function requestDeleteGroup(idx) {
    setConfirmState({
      message: t('confirmDeleteGroup'),
      onConfirm: () => {
        setGroups(prev => prev.filter((_, i) => i !== idx))
        setActiveTab('main')
        setConfirmState(null)
      },
    })
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

  function moveProduct(fromIdx, toIdx) {
    if (isMain) {
      setFavorites(prev => {
        const arr = [...prev]
        const [item] = arr.splice(fromIdx, 1)
        arr.splice(toIdx, 0, item)
        return arr
      })
    } else {
      setGroups(prev => prev.map((g, i) => {
        if (i !== activeGroupIdx) return g
        const arr = [...g.products]
        const [item] = arr.splice(fromIdx, 1)
        arr.splice(toIdx, 0, item)
        return { ...g, products: arr }
      }))
    }
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
      {/* Header */}
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{t('manageFavorites')}</h1>
          <p class="text-sm text-base-content/50 mt-0.5">{t('favoritesPage')}</p>
        </div>
        {canEdit && (
          <button
            class={`btn btn-primary gap-2 shadow-sm ${saving ? 'loading' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >
            {!saving && (
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            {t('save')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div class="flex flex-wrap gap-2 mb-5">
        <button
          class={`btn btn-sm gap-1.5 transition-all duration-200 ${isMain ? 'btn-primary shadow-sm' : 'btn-ghost bg-base-200/60 hover:bg-base-200'}`}
          onClick={() => setActiveTab('main')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill={isMain ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
          {t('favorites')}
          {favorites.length > 0 && <span class="badge badge-xs badge-neutral">{favorites.length}</span>}
        </button>
        {groups.map((g, idx) => {
          const active = activeTab === `group:${idx}`
          return (
            <button
              key={idx}
              class={`btn btn-sm gap-1.5 transition-all duration-200 ${active ? (g.color ? 'shadow-sm' : 'btn-primary shadow-sm') : 'btn-ghost bg-base-200/60 hover:bg-base-200'}`}
              style={g.color
                ? { backgroundColor: active ? g.color : g.color + '22', borderColor: g.color, color: active ? '#fff' : g.color }
                : {}}
              onClick={() => setActiveTab(`group:${idx}`)}
            >
              {g.name}
              {g.products.length > 0 && <span class={`badge badge-xs ${active ? 'badge-neutral' : 'badge-ghost'}`}>{g.products.length}</span>}
            </button>
          )
        })}
      </div>

      {/* Group management bar */}
      <div class="bg-base-100 rounded-xl border border-base-200 p-4 mb-5 flex gap-4 flex-wrap items-end shadow-sm">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-base-content/60">{t('groupName')}</span>
          <div class="flex gap-2">
            <input
              class="input input-bordered input-sm w-52 focus:input-primary transition-colors"
              placeholder={t('groupName')}
              value={newGroupName}
              onInput={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGroup()}
            />
            <button class="btn btn-sm btn-primary gap-1" onClick={addGroup}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t('addGroup')}
            </button>
          </div>
        </div>

        {!isMain && (
          <>
            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-base-content/60">{t('pickColor')}</span>
              <div class="flex items-center gap-1.5 flex-wrap">
                <button
                  class={`w-6 h-6 rounded-full border-2 transition-all duration-150 ${!groups[activeGroupIdx]?.color ? 'border-primary ring-2 ring-primary/20 scale-110' : 'border-base-300 hover:scale-105'}`}
                  style={{ background: 'repeating-conic-gradient(#ddd 0% 25%, transparent 0% 50%) 50% / 8px 8px' }}
                  onClick={() => setGroupColor(activeGroupIdx, '')}
                />
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    class={`w-6 h-6 rounded-full border-2 transition-all duration-150 ${groups[activeGroupIdx]?.color === c ? 'border-white ring-2 ring-offset-1 ring-primary scale-110 shadow-md' : 'border-transparent hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setGroupColor(activeGroupIdx, c)}
                  />
                ))}
              </div>
            </div>
            <button
              class="btn btn-sm btn-outline btn-error gap-1.5"
              onClick={() => requestDeleteGroup(activeGroupIdx)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              {t('deleteGroup')}
            </button>
          </>
        )}
      </div>

      {/* Products card */}
      <div class="card bg-base-100 shadow-sm border border-base-200 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-base-200 bg-base-100">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-sm">
              {isMain ? t('favorites') : groups[activeGroupIdx]?.name}
            </h3>
            <span class="badge badge-sm badge-ghost">{activeList.length}</span>
          </div>
          <button
            class="btn btn-sm btn-primary gap-1.5 shadow-sm"
            onClick={() => { setShowSearch(true); setAddingColor(''); setTimeout(() => searchRef.current?.focus(), 100) }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('addProduct')}
          </button>
        </div>

        {activeList.length === 0 ? (
          <div class="flex flex-col items-center justify-center py-16 text-base-content/40">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            <p class="text-sm font-medium">{t('noFavorites')}</p>
          </div>
        ) : (
          <div class="overflow-x-auto">
            <table class="table table-sm w-full">
              <thead>
                <tr class="bg-base-200/40">
                  <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-base-content/50 w-10">#</th>
                  <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-base-content/50">{t('productName')}</th>
                  <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-base-content/50">{t('barcodes')}</th>
                  <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-base-content/50">{t('price')}</th>
                  <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-base-content/50 w-16">{t('pickColor')}</th>
                  <th class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-base-content/50 w-24 text-end">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {activeList.map((p, idx) => {
                  const pc = favColors[p.id] || ''
                  return (
                    <tr key={p.id} class="border-b border-base-200/60 hover:bg-base-200/30 transition-colors duration-150 group">
                      <td class="px-4 py-3 text-sm text-base-content/40 font-mono">{idx + 1}</td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2.5">
                          {pc && <span class="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: pc }} />}
                          <span class="font-medium text-sm">{p.name}</span>
                        </div>
                      </td>
                      <td class="px-4 py-3 font-mono text-xs text-base-content/60">{p.barcodes?.[0] || '-'}</td>
                      <td class="px-4 py-3 font-mono text-sm font-medium">{fmt(p.pv1)}</td>
                      <td class="px-4 py-3">
                        <ColorDot color={pc} onChange={(c) => setProductColor(p.id, c)} />
                      </td>
                      <td class="px-4 py-3 text-end">
                        <div class="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity duration-150">
                          {idx > 0 && (
                            <button class="btn btn-xs btn-ghost btn-square hover:bg-base-200" title="Move up" onClick={() => moveProduct(idx, idx - 1)}>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                            </button>
                          )}
                          {idx < activeList.length - 1 && (
                            <button class="btn btn-xs btn-ghost btn-square hover:bg-base-200" title="Move down" onClick={() => moveProduct(idx, idx + 1)}>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                            </button>
                          )}
                          <button
                            class="btn btn-xs btn-ghost btn-square text-error hover:bg-error/10"
                            onClick={() => requestRemoveProduct(p.id, p.name)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Product Modal ──────────────────────────────────────────────── */}
      {showSearch && (
        <dialog class="modal modal-open">
          <div class="modal-box max-w-lg">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-lg">{t('addToFavorites')}</h3>
              <button class="btn btn-sm btn-ghost btn-circle" onClick={() => { setShowSearch(false); setSearchQ(''); setResults([]) }}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Color picker for new items */}
            <div class="mb-3 p-3 bg-base-200/40 rounded-lg">
              <span class="text-xs font-medium text-base-content/60 mb-1.5 block">{t('pickColor')}</span>
              <div class="flex items-center gap-1.5 flex-wrap">
                <button
                  class={`w-6 h-6 rounded-full border-2 transition-all duration-150 ${!addingColor ? 'border-primary ring-2 ring-primary/20 scale-110' : 'border-base-300 hover:scale-105'}`}
                  style={{ background: 'repeating-conic-gradient(#ddd 0% 25%, transparent 0% 50%) 50% / 8px 8px' }}
                  onClick={() => setAddingColor('')}
                />
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    class={`w-6 h-6 rounded-full border-2 transition-all duration-150 ${addingColor === c ? 'border-white ring-2 ring-offset-1 ring-primary scale-110 shadow-md' : 'border-transparent hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setAddingColor(c)}
                  />
                ))}
              </div>
            </div>

            <div class="relative mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={searchRef}
                class="input input-bordered w-full input-sm pl-9 focus:input-primary transition-colors"
                placeholder={t('searchProducts')}
                value={searchQ}
                onInput={(e) => setSearchQ(e.target.value)}
                autoComplete="off"
              />
            </div>

            {loading && (
              <div class="flex justify-center py-4">
                <span class="loading loading-spinner loading-sm text-primary" />
              </div>
            )}

            <div class="overflow-y-auto max-h-80 rounded-lg border border-base-200">
              {!loading && !searchQ.trim() && (
                <div class="flex flex-col items-center justify-center py-10 text-base-content/40">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <p class="text-xs">{t('favoritesSearch')}</p>
                </div>
              )}
              {!loading && searchQ.trim() && results.filter(p => !activeList.some(f => f.id === p.id)).length === 0 && (
                <div class="text-center py-8 text-base-content/40 text-sm">{t('noProducts')}</div>
              )}
              {results.filter(p => !activeList.some(f => f.id === p.id)).map(p => (
                <div
                  key={p.id}
                  class="flex items-center gap-3 px-4 py-3 border-b border-base-200/60 last:border-0 hover:bg-primary/5 cursor-pointer transition-colors duration-150 group"
                  onClick={() => addProduct(p)}
                >
                  {addingColor && <span class="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: addingColor }} />}
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm truncate">{p.name}</p>
                    <p class="font-mono text-xs text-base-content/50">{p.barcodes?.[0] || '-'}</p>
                  </div>
                  <span class="font-mono text-sm font-medium shrink-0">{fmt(p.pv1)}</span>
                  <div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <form method="dialog" class="modal-backdrop"><button onClick={() => { setShowSearch(false); setSearchQ(''); setResults([]) }}>close</button></form>
        </dialog>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmState}
        message={confirmState?.message || ''}
        onConfirm={confirmState?.onConfirm || (() => {})}
        onCancel={() => setConfirmState(null)}
        t={t}
      />
    </Layout>
  )
}
