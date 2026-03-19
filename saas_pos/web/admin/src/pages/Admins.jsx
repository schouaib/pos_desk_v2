import { useState, useEffect, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { authUser } from '../lib/auth'
import { useI18n } from '../lib/i18n'

export default function Admins({ path }) {
  const { t } = useI18n()
  const [admins, setAdmins] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef(null)
  const observerRef = useRef(null)

  async function loadPage(p, reset = false) {
    setLoadingMore(true)
    try {
      const res = await api.listAdmins(p)
      setAdmins((prev) => reset ? res.items : [...prev, ...res.items])
      setPage(p)
      setHasMore(p < res.pages)
    } catch {}
    finally { setLoadingMore(false) }
  }

  function reload() { loadPage(1, true) }

  useEffect(() => { loadPage(1, true) }, [])

  const paginationRef = useRef({ hasMore: false, loadingMore: false, page: 1 })
  useEffect(() => { paginationRef.current = { hasMore, loadingMore, page } }, [hasMore, loadingMore, page])

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        const { hasMore, loadingMore, page } = paginationRef.current
        if (hasMore && !loadingMore) loadPage(page + 1)
      }
    }, { threshold: 0.1 })
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    observerRef.current = observer
    return () => observer.disconnect()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.createAdmin(form)
      closeModal('admin-modal')
      setForm({ name: '', email: '', password: '' })
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleAdmin(a) {
    if (a.id === authUser.value?.id) return
    try { await api.setAdminActive(a.id, !a.active); reload() } catch {}
  }

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('superAdmins')}</h2>
        <button class="btn btn-primary btn-sm" onClick={() => { setError(''); openModal('admin-modal') }}>
          {t('newAdmin')}
        </button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                {[t('name'), t('email'), t('status'), t('actions')].map((h, i) => (
                  <th key={i} class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} class={`border-b border-base-200 hover:bg-base-50 transition-colors ${a.id === authUser.value?.id ? 'bg-base-200/50' : ''}`}>
                  <td class="px-3 py-2.5 font-medium">
                    {a.name}
                    {a.id === authUser.value?.id && (
                      <span class="badge badge-xs badge-primary ms-2">{t('you')}</span>
                    )}
                  </td>
                  <td class="px-3 py-2.5 text-sm text-base-content/70">{a.email}</td>
                  <td class="px-3 py-2.5">
                    <span class={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${a.active ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                      {a.active ? t('active') : t('disabled')}
                    </span>
                  </td>
                  <td class="px-3 py-2.5">
                    <button
                      class={`btn btn-xs btn-ghost border ${a.active ? 'border-error text-error hover:bg-error hover:text-white' : 'border-success text-success hover:bg-success hover:text-white'}`}
                      onClick={() => toggleAdmin(a)}
                      disabled={a.id === authUser.value?.id}
                    >
                      {a.active ? t('disable') : t('enable')}
                    </button>
                  </td>
                </tr>
              ))}
              {admins.length === 0 && !loadingMore && (
                <tr>
                  <td colSpan={4} class="px-3 py-12 text-center text-base-content/40">{t('noAdmins')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div ref={sentinelRef} class="h-4" />
      {loadingMore && (
        <div class="flex justify-center py-4">
          <span class="loading loading-spinner loading-sm text-base-content/40" />
        </div>
      )}

      <Modal id="admin-modal" title={t('newAdminTitle')}>
        {error && <div class="alert alert-error text-sm py-2 mb-3"><span>{error}</span></div>}
        <form onSubmit={handleSubmit} class="space-y-3">
          <label class="form-control">
            <span class="label-text text-sm">{t('adminName')}</span>
            <input class="input input-bordered input-sm" value={form.name}
              onInput={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label class="form-control">
            <span class="label-text text-sm">{t('email')}</span>
            <input type="email" class="input input-bordered input-sm" value={form.email}
              onInput={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label class="form-control">
            <span class="label-text text-sm">{t('password')}</span>
            <input type="password" class="input input-bordered input-sm" value={form.password}
              onInput={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          <div class="modal-action">
            <button type="submit" class={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`} disabled={loading}>
              {t('createAdmin')}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  )
}
