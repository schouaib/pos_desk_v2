import { useState, useEffect } from 'preact/hooks'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'

function KeyCard({ ak, onRevoke, onReactivate, onDelete, onRemoveInstall, t }) {
  const [expanded, setExpanded] = useState(false)
  const expired = ak.expires_at && new Date(ak.expires_at) < new Date()

  return (
    <div class={`card bg-base-100 shadow-sm border ${!ak.active ? 'border-error/30 opacity-70' : expired ? 'border-warning/30' : 'border-base-300'}`}>
      <div class="card-body p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="font-bold text-sm truncate">{ak.label || t('activationKey')}</h3>
              {ak.active && !expired && <span class="badge badge-success badge-xs">{t('active')}</span>}
              {!ak.active && <span class="badge badge-error badge-xs">{t('revoked')}</span>}
              {expired && ak.active && <span class="badge badge-warning badge-xs">{t('expired')}</span>}
            </div>
            <p class="font-mono text-xs tracking-widest text-primary select-all">{ak.key}</p>
          </div>
          <div class="dropdown dropdown-end">
            <label tabIndex={0} class="btn btn-ghost btn-xs btn-square">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01" />
              </svg>
            </label>
            <ul tabIndex={0} class="dropdown-content z-10 menu p-1 shadow bg-base-100 rounded-box w-40 text-sm">
              {ak.active
                ? <li><button onClick={() => onRevoke(ak.id)}>{t('revoke')}</button></li>
                : <li><button onClick={() => onReactivate(ak.id)}>{t('reactivate')}</button></li>
              }
              <li><button class="text-error" onClick={() => onDelete(ak.id)}>{t('delete')}</button></li>
            </ul>
          </div>
        </div>

        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60 mt-2">
          <span>{t('maxInstalls')}: {ak.max_installs || '∞'}</span>
          <span>{t('installs')}: {ak.installs?.length || 0}</span>
          <span>{t('created')}: {new Date(ak.created_at).toLocaleDateString()}</span>
          {ak.expires_at && <span>{t('expires')}: {new Date(ak.expires_at).toLocaleDateString()}</span>}
        </div>

        {ak.installs?.length > 0 && (
          <>
            <button class="btn btn-ghost btn-xs mt-2 gap-1" onClick={() => setExpanded(!expanded)}>
              <svg xmlns="http://www.w3.org/2000/svg" class={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
              {t('installations')} ({ak.installs.length})
            </button>
            {expanded && (
              <div class="overflow-x-auto mt-1">
                <table class="table table-xs">
                  <thead>
                    <tr>
                      <th>{t('fingerprint')}</th>
                      <th>{t('activatedAt')}</th>
                      <th>{t('lastSeen')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ak.installs.map(inst => (
                      <tr key={inst.fingerprint}>
                        <td class="font-mono text-xs">{inst.fingerprint.slice(0, 12)}...</td>
                        <td class="text-xs">{new Date(inst.activated_at).toLocaleDateString()}</td>
                        <td class="text-xs">{new Date(inst.last_seen_at).toLocaleDateString()}</td>
                        <td>
                          <button
                            class="btn btn-ghost btn-xs text-error"
                            onClick={() => onRemoveInstall(ak.id, inst.fingerprint)}
                            title={t('removeInstall')}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function ActivationKeys() {
  const { t } = useI18n()
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ label: '', max_installs: 1, expires_in: 0 })
  const [creating, setCreating] = useState(false)

  async function load() {
    try {
      const data = await api.listActivationKeys()
      setKeys(data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    try {
      await api.createActivationKey(form)
      setShowCreate(false)
      setForm({ label: '', max_installs: 1, expires_in: 0 })
      load()
    } catch {}
    setCreating(false)
  }

  async function handleRevoke(id) {
    try { await api.revokeActivationKey(id); load() } catch {}
  }
  async function handleReactivate(id) {
    try { await api.reactivateActivationKey(id); load() } catch {}
  }
  async function handleDelete(id) {
    if (!confirm(t('confirmDelete'))) return
    try { await api.deleteActivationKey(id); load() } catch {}
  }
  async function handleRemoveInstall(id, fingerprint) {
    if (!confirm(t('confirmRemoveInstall') || 'Remove this installation?')) return
    try { await api.removeActivationInstall(id, fingerprint); load() } catch {}
  }

  return (
    <Layout currentPath="/activation-keys">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-xl font-bold">{t('activationKeys') || 'Activation Keys'}</h1>
          <p class="text-sm text-base-content/60">{t('activationKeysDesc') || 'Manage desktop POS installations'}</p>
        </div>
        <button class="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          + {t('newKey') || 'New Key'}
        </button>
      </div>

      {loading ? (
        <div class="flex justify-center py-12">
          <span class="loading loading-spinner loading-lg" />
        </div>
      ) : keys.length === 0 ? (
        <div class="text-center py-12 text-base-content/50">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
          <p class="font-medium">{t('noActivationKeys') || 'No activation keys yet'}</p>
          <p class="text-sm mt-1">{t('createFirstKey') || 'Create a key to activate desktop POS terminals'}</p>
        </div>
      ) : (
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {keys.map(ak => (
            <KeyCard
              key={ak.id}
              ak={ak}
              onRevoke={handleRevoke}
              onReactivate={handleReactivate}
              onDelete={handleDelete}
              onRemoveInstall={handleRemoveInstall}
              t={t}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <h3 class="font-bold text-lg mb-4">{t('createActivationKey') || 'Create Activation Key'}</h3>
          <form onSubmit={handleCreate} class="space-y-3">
            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('label') || 'Label'}</span>
              <input
                type="text"
                class="input input-bordered input-sm"
                placeholder={t('keyLabelPlaceholder') || 'e.g. POS Counter 1'}
                value={form.label}
                onInput={e => setForm({ ...form, label: e.target.value })}
              />
            </label>
            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('maxInstalls') || 'Max Installations'}</span>
              <input
                type="number"
                class="input input-bordered input-sm"
                min="0"
                value={form.max_installs}
                onInput={e => setForm({ ...form, max_installs: parseInt(e.target.value) || 0 })}
              />
              <span class="label-text-alt text-base-content/50">{t('maxInstallsHint') || '0 = unlimited'}</span>
            </label>
            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('expiresIn') || 'Expires In (days)'}</span>
              <input
                type="number"
                class="input input-bordered input-sm"
                min="0"
                value={form.expires_in}
                onInput={e => setForm({ ...form, expires_in: parseInt(e.target.value) || 0 })}
              />
              <span class="label-text-alt text-base-content/50">{t('expiresInHint') || '0 = never expires'}</span>
            </label>
            <div class="flex justify-end gap-2 mt-4">
              <button type="button" class="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>
                {t('cancel')}
              </button>
              <button type="submit" class={`btn btn-primary btn-sm ${creating ? 'loading' : ''}`} disabled={creating}>
                {t('create')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  )
}
