import { useState, useEffect, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { setAuth, authUser } from '../lib/auth'
import { useI18n } from '../lib/i18n'

export default function Folders() {
  const { t } = useI18n()
  const [folders, setFolders] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const successTimer = useRef(null)
  const [newName, setNewName] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [switching, setSwitching] = useState('')

  // Copy state
  const [showCopy, setShowCopy] = useState(false)
  const [copyFrom, setCopyFrom] = useState('')
  const [copyProducts, setCopyProducts] = useState(true)
  const [copySuppliers, setCopySuppliers] = useState(true)
  const [copyClients, setCopyClients] = useState(true)
  const [copying, setCopying] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([api.listFolders(), api.listFolderRequests()])
      .then(([f, r]) => { setFolders(f || []); setRequests(r || []) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(); return () => clearTimeout(successTimer.current) }, [])

  async function requestFolder(e) {
    e.preventDefault()
    if (!newName.trim()) { setError(t('folderNameRequired')); return }
    setRequesting(true)
    setError('')
    try {
      await api.requestFolder({ folder_name: newName.trim() })
      setNewName('')
      setSuccess(t('folderRequested'))
      successTimer.current = setTimeout(() => setSuccess(''), 3000)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setRequesting(false)
    }
  }

  async function switchTo(folderId) {
    setSwitching(folderId)
    setError('')
    try {
      const res = await api.switchFolder({ folder_id: folderId })
      // Update auth with new token
      const payload = JSON.parse(atob(res.token.split('.')[1]))
      setAuth(res.token, { ...authUser.value, tenant_id: folderId, ...payload })
      window.location.reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setSwitching('')
    }
  }

  async function doCopy() {
    if (!copyProducts && !copySuppliers && !copyClients) {
      setError(t('nothingToCopy'))
      return
    }
    setCopying(true)
    setError('')
    try {
      const result = await api.copyFolderData({
        source_folder_id: copyFrom,
        copy_products: copyProducts,
        copy_suppliers: copySuppliers,
        copy_clients: copyClients,
      })
      const total = (result.products || 0) + (result.suppliers || 0) + (result.clients || 0)
      setSuccess(`${total} ${t('copiedItems')}`)
      successTimer.current = setTimeout(() => setSuccess(''), 4000)
      setShowCopy(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setCopying(false)
    }
  }

  const currentTenantId = authUser.value?.tenant_id
  const otherFolders = folders.filter(f => f.id !== currentTenantId)
  const currentFolder = folders.find(f => f.id === currentTenantId)

  const statusBadge = (status) => {
    const cls = status === 'approved' ? 'badge-success' : status === 'rejected' ? 'badge-error' : 'badge-warning'
    const label = status === 'approved' ? t('folderApproved') : status === 'rejected' ? t('folderRejected') : t('folderPending')
    return <span class={`badge badge-sm ${cls}`}>{label}</span>
  }

  return (
    <Layout currentPath="/folders">
      <h2 class="text-2xl font-bold mb-6">{t('foldersPage')}</h2>

      {error && <div class="alert alert-error mb-4 text-sm">{error}</div>}
      {success && <div class="alert alert-success mb-4 text-sm">{success}</div>}

      {loading ? (
        <div class="flex justify-center py-20">
          <span class="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : (
        <div class="space-y-6">
          {/* Current folder indicator */}
          {currentFolder && (
            <div class="card bg-primary/10 border border-primary/20">
              <div class="card-body py-3 px-4 flex-row items-center justify-between">
                <div>
                  <span class="text-xs text-base-content/50">{t('currentFolder')}</span>
                  <p class="font-bold text-primary">{currentFolder.folder_name || currentFolder.name}</p>
                </div>
                <span class="badge badge-primary badge-sm">{t('active')}</span>
              </div>
            </div>
          )}

          {/* Folder list */}
          {folders.length > 1 && (
            <div>
              <h3 class="font-semibold mb-3">{t('folders')}</h3>
              <div class="grid gap-2">
                {folders.map(f => (
                  <div key={f.id} class={`card bg-base-100 border ${f.id === currentTenantId ? 'border-primary/30' : 'border-base-300'}`}>
                    <div class="card-body py-3 px-4 flex-row items-center justify-between">
                      <div>
                        <p class="font-medium">{f.folder_name || f.name}</p>
                        <span class={`text-xs ${f.active ? 'text-success' : 'text-error'}`}>
                          {f.active ? t('active') : t('disabled')}
                        </span>
                      </div>
                      {f.id !== currentTenantId && f.active && (
                        <button
                          class="btn btn-sm btn-primary btn-outline"
                          onClick={() => switchTo(f.id)}
                          disabled={!!switching}
                        >
                          {switching === f.id ? <span class="loading loading-spinner loading-xs" /> : t('switchFolder')}
                        </button>
                      )}
                      {f.id === currentTenantId && (
                        <span class="badge badge-primary badge-outline badge-sm">{t('currentFolder')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Copy data section */}
          {otherFolders.length > 0 && (
            <div>
              {!showCopy ? (
                <button class="btn btn-sm btn-outline" onClick={() => { setShowCopy(true); setCopyFrom(otherFolders[0]?.id || '') }}>
                  {t('copyData')}
                </button>
              ) : (
                <div class="card bg-base-100 border border-base-300">
                  <div class="card-body py-4">
                    <h3 class="font-semibold mb-3">{t('copyData')}</h3>
                    <div class="form-control mb-3">
                      <label class="label"><span class="label-text">{t('copyFrom')}</span></label>
                      <select class="select select-bordered select-sm" value={copyFrom} onChange={e => setCopyFrom(e.target.value)}>
                        {otherFolders.map(f => (
                          <option key={f.id} value={f.id}>{f.folder_name || f.name}</option>
                        ))}
                      </select>
                    </div>
                    <div class="flex flex-wrap gap-3 mb-4">
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked={copyProducts} onChange={e => setCopyProducts(e.target.checked)} />
                        <span class="text-sm">{t('copyProducts')}</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked={copySuppliers} onChange={e => setCopySuppliers(e.target.checked)} />
                        <span class="text-sm">{t('copySuppliers')}</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked={copyClients} onChange={e => setCopyClients(e.target.checked)} />
                        <span class="text-sm">{t('copyClients')}</span>
                      </label>
                    </div>
                    <div class="flex gap-2">
                      <button class="btn btn-sm btn-primary" onClick={doCopy} disabled={copying}>
                        {copying ? <span class="loading loading-spinner loading-xs" /> : t('copyData')}
                      </button>
                      <button class="btn btn-sm btn-ghost" onClick={() => setShowCopy(false)}>{t('back')}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Request new folder */}
          <div class="card bg-base-100 border border-base-300">
            <div class="card-body py-4">
              <h3 class="font-semibold mb-3">{t('requestNewFolder')}</h3>
              <form onSubmit={requestFolder} class="flex gap-2">
                <input
                  type="text"
                  class="input input-bordered input-sm flex-1"
                  placeholder={t('folderName')}
                  value={newName}
                  onInput={e => setNewName(e.target.value)}
                />
                <button type="submit" class="btn btn-sm btn-primary" disabled={requesting}>
                  {requesting ? <span class="loading loading-spinner loading-xs" /> : t('requestNewFolder')}
                </button>
              </form>
            </div>
          </div>

          {/* Request history */}
          {requests.length > 0 && (
            <div>
              <h3 class="font-semibold mb-3">{t('folderStatus')}</h3>
              <div class="overflow-x-auto">
                <table class="table table-sm bg-base-100 rounded-xl">
                  <thead>
                    <tr>
                      <th>{t('folderName')}</th>
                      <th>{t('folderStatus')}</th>
                      <th>{t('requestDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(r => (
                      <tr key={r.id} class="hover">
                        <td class="font-medium">{r.folder_name}</td>
                        <td>{statusBadge(r.status)}</td>
                        <td class="text-sm text-base-content/60">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
