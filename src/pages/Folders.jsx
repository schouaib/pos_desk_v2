import { useState, useEffect, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { setAuth, authUser } from '../lib/auth'
import { useI18n } from '../lib/i18n'

export default function Folders() {
  const { t } = useI18n()
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const successTimer = useRef(null)
  const [newName, setNewName] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [switching, setSwitching] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)

  // Copy state
  const [showCopy, setShowCopy] = useState(false)
  const [copyFrom, setCopyFrom] = useState('')
  const [copyProducts, setCopyProducts] = useState(true)
  const [copySuppliers, setCopySuppliers] = useState(true)
  const [copyClients, setCopyClients] = useState(true)
  const [copying, setCopying] = useState(false)

  function load() {
    setLoading(true)
    api.listFolders()
      .then(f => setFolders(f || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(); return () => clearTimeout(successTimer.current) }, [])

  function showSuccess(msg) {
    setSuccess(msg)
    clearTimeout(successTimer.current)
    successTimer.current = setTimeout(() => setSuccess(''), 4000)
  }

  async function requestFolder(e) {
    e.preventDefault()
    if (!newName.trim()) { setError(t('folderNameRequired')); return }
    setRequesting(true)
    setError('')
    try {
      await api.requestFolder({ folder_name: newName.trim() })
      setNewName('')
      setShowNewForm(false)
      showSuccess(t('folderRequested'))
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
      const payload = JSON.parse(atob(res.token.split('.')[1]))
      setAuth(res.token, { ...authUser.value, tenant_id: folderId, ...payload })
      localStorage.setItem('preferred_folder', folderId)
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
      showSuccess(`${total} ${t('copiedItems')}`)
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

  return (
    <Layout currentPath="/folders">
      {/* Page header */}
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 class="text-2xl font-bold">{t('foldersPage')}</h2>
          <p class="text-sm text-base-content/70 mt-1">{t('foldersSubtitle')}</p>
        </div>
        <div class="flex gap-2">
          {otherFolders.length > 0 && (
            <button
              class="btn btn-sm btn-outline gap-2"
              onClick={() => { setShowCopy(true); setCopyFrom(otherFolders[0]?.id || '') }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
              </svg>
              {t('importData')}
            </button>
          )}
          <button class="btn btn-sm btn-primary gap-2" onClick={() => setShowNewForm(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
            </svg>
            {t('requestNewFolder')}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div class="alert alert-error mb-4 text-sm shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <span>{error}</span>
          <button class="btn btn-ghost btn-xs" onClick={() => setError('')}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
          </button>
        </div>
      )}
      {success && (
        <div class="alert alert-success mb-4 text-sm shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div class="flex justify-center py-20">
          <span class="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : (
        <div class="space-y-8">

          {/* ─── Current folder hero card ─── */}
          {currentFolder && (
            <div class="card bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 shadow-sm">
              <div class="card-body py-5 px-6">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-primary" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-medium text-base-content/70 uppercase tracking-wider">{t('currentFolder')}</p>
                    <p class="text-lg font-bold text-primary truncate">{currentFolder.folder_name || currentFolder.name}</p>
                  </div>
                  <span class="badge badge-primary gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    {t('selected')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ─── Folder grid ─── */}
          {folders.length > 1 && (
            <div>
              <div class="flex items-center gap-2 mb-4">
                <h3 class="font-semibold text-base">{t('yourFolders')}</h3>
                <span class="badge badge-ghost badge-sm">{folders.length}</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {folders.map(f => {
                  const isCurrent = f.id === currentTenantId
                  return (
                    <div
                      key={f.id}
                      class={`card bg-base-100 border transition-all duration-200 hover:shadow-md ${
                        isCurrent ? 'border-primary/30 ring-1 ring-primary/10' : 'border-base-300 hover:border-base-content/20'
                      }`}
                    >
                      <div class="card-body p-4">
                        <div class="flex items-start gap-3">
                          <div class={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            isCurrent ? 'bg-primary/10' : 'bg-base-200'
                          }`}>
                            <svg xmlns="http://www.w3.org/2000/svg" class={`w-5 h-5 ${isCurrent ? 'text-primary' : 'text-base-content/60'}`} viewBox="0 0 20 20" fill="currentColor">
                              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            </svg>
                          </div>
                          <div class="flex-1 min-w-0">
                            <p class="font-semibold text-sm truncate">{f.folder_name || f.name}</p>
                            {f.created_at && (
                              <p class="text-xs text-base-content/60 mt-0.5">
                                {new Date(f.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div class="mt-3 pt-3 border-t border-base-200">
                          {isCurrent ? (
                            <button class="btn btn-sm btn-primary w-full gap-1.5 no-animation" disabled>
                              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                              </svg>
                              {t('selected')}
                            </button>
                          ) : (
                            <button
                              class="btn btn-sm btn-outline w-full gap-1.5"
                              onClick={() => switchTo(f.id)}
                              disabled={!!switching}
                            >
                              {switching === f.id ? (
                                <span class="loading loading-spinner loading-xs" />
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd" />
                                </svg>
                              )}
                              {t('select')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ─── No folders empty state ─── */}
          {folders.length <= 1 && (
            <div class="card bg-base-100 border border-base-300 border-dashed">
              <div class="card-body items-center text-center py-12">
                <div class="w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-base-content/50" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                </div>
                <p class="font-medium text-base-content/80">{t('noFolders')}</p>
                <p class="text-sm text-base-content/60 max-w-xs">{t('noFoldersDesc')}</p>
              </div>
            </div>
          )}

          {/* ─── New folder dialog ─── */}
          {showNewForm && (
            <div class="modal modal-open modal-bottom sm:modal-middle" onClick={e => { if (e.target === e.currentTarget) { setShowNewForm(false); setNewName('') } }}>
              <div class="modal-box">
                <button class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" onClick={() => { setShowNewForm(false); setNewName('') }}>
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                </button>

                <div class="flex items-center gap-3 mb-5">
                  <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 class="text-lg font-bold">{t('requestNewFolder')}</h3>
                    <p class="text-xs text-base-content/70">{t('enterFolderName')}</p>
                  </div>
                </div>

                <form onSubmit={requestFolder}>
                  <div class="form-control mb-5">
                    <label class="label pb-1">
                      <span class="label-text text-sm font-medium">{t('folderName')}</span>
                    </label>
                    <input
                      type="text"
                      class="input input-bordered input-sm w-full"
                      placeholder={t('folderNamePlaceholder')}
                      value={newName}
                      onInput={e => setNewName(e.target.value)}
                      autofocus
                    />
                  </div>
                  <div class="modal-action">
                    <button type="button" class="btn btn-ghost btn-sm" onClick={() => { setShowNewForm(false); setNewName('') }}>{t('cancelCopy')}</button>
                    <button type="submit" class="btn btn-primary btn-sm gap-1.5" disabled={requesting}>
                      {requesting ? (
                        <span class="loading loading-spinner loading-xs" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                        </svg>
                      )}
                      {t('requestNewFolder')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ─── Import data modal ─── */}
          {showCopy && (
            <div class="modal modal-open modal-bottom sm:modal-middle" onClick={e => { if (e.target === e.currentTarget) setShowCopy(false) }}>
              <div class="modal-box">
                <button class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" onClick={() => setShowCopy(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                </button>

                <div class="flex items-center gap-3 mb-5">
                  <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                      <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 class="text-lg font-bold">{t('importData')}</h3>
                    <p class="text-xs text-base-content/70">{t('importDataDesc')}</p>
                  </div>
                </div>

                {/* Source folder select */}
                <div class="form-control mb-5">
                  <label class="label pb-1">
                    <span class="label-text text-sm font-medium">{t('sourceFolder')}</span>
                  </label>
                  <select class="select select-bordered select-sm w-full" value={copyFrom} onChange={e => setCopyFrom(e.target.value)}>
                    {otherFolders.map(f => (
                      <option key={f.id} value={f.id}>{f.folder_name || f.name}</option>
                    ))}
                  </select>
                </div>

                {/* Data type toggles */}
                <div class="mb-6">
                  <label class="label pb-2">
                    <span class="label-text text-sm font-medium">{t('selectDataTypes')}</span>
                  </label>
                  <div class="grid grid-cols-1 gap-2">
                    {[
                      { key: 'products', checked: copyProducts, set: setCopyProducts, icon: 'M4 3a2 2 0 100 4h12a2 2 0 100-4H4zm12 10H4a2 2 0 100 4h12a2 2 0 100-4z' },
                      { key: 'suppliers', checked: copySuppliers, set: setCopySuppliers, icon: 'M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z' },
                      { key: 'clients', checked: copyClients, set: setCopyClients, icon: 'M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z' },
                    ].map(item => (
                      <label
                        key={item.key}
                        class={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          item.checked ? 'border-primary/30 bg-primary/5' : 'border-base-300 hover:border-base-content/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm checkbox-primary"
                          checked={item.checked}
                          onChange={e => item.set(e.target.checked)}
                        />
                        <svg xmlns="http://www.w3.org/2000/svg" class={`w-4 h-4 ${item.checked ? 'text-primary' : 'text-base-content/50'}`} viewBox="0 0 20 20" fill="currentColor">
                          <path d={item.icon} />
                        </svg>
                        <span class={`text-sm font-medium ${item.checked ? '' : 'text-base-content/70'}`}>
                          {t(`copy${item.key.charAt(0).toUpperCase() + item.key.slice(1)}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div class="modal-action">
                  <button class="btn btn-ghost btn-sm" onClick={() => setShowCopy(false)}>{t('cancelCopy')}</button>
                  <button class="btn btn-primary btn-sm gap-1.5" onClick={doCopy} disabled={copying}>
                    {copying ? (
                      <span class="loading loading-spinner loading-xs" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
                      </svg>
                    )}
                    {t('startCopy')}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </Layout>
  )
}
