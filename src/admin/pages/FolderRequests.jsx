import { useState, useEffect } from 'preact/hooks'
import { saApi } from '../api'
import { useI18n } from '../../lib/i18n'

export default function FolderRequests() {
  const { t } = useI18n()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    saApi.listPendingFolders().then(r => setRequests(r || [])).catch(e => setError(e.message)).finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function approve(id) { try { await saApi.approveFolder(id); load() } catch (e) { setError(e.message) } }
  async function reject(id) { try { await saApi.rejectFolder(id); load() } catch (e) { setError(e.message) } }

  if (loading) return <div class="flex justify-center py-16"><span class="loading loading-spinner loading-lg text-primary" /></div>

  return (
    <div>
      <h2 class="text-2xl font-bold mb-6">{t('folderRequests') || 'Folder Requests'}</h2>
      {error && <div class="alert alert-error mb-4">{error}</div>}
      {requests.length === 0 ? (
        <p class="text-base-content/80 text-center py-10">{t('noPendingRequests') || 'No pending requests'}</p>
      ) : (
        <div class="card bg-base-100 shadow overflow-hidden">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                <th class="px-3 py-2 text-xs">{t('store') || 'Store'}</th>
                <th class="px-3 py-2 text-xs">{t('folderName') || 'Folder'}</th>
                <th class="px-3 py-2 text-xs">{t('requestDate') || 'Date'}</th>
                <th class="px-3 py-2 text-xs">{t('actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id} class="border-b border-base-200">
                  <td class="px-3 py-2 font-medium">{req.tenant_name}</td>
                  <td class="px-3 py-2">{req.folder_name}</td>
                  <td class="px-3 py-2 text-sm text-base-content/80">{new Date(req.created_at).toLocaleDateString()}</td>
                  <td class="px-3 py-2 space-x-2">
                    <button class="btn btn-xs btn-success" onClick={() => approve(req.id)}>{t('approve') || 'Approve'}</button>
                    <button class="btn btn-xs btn-error btn-outline" onClick={() => reject(req.id)}>{t('reject') || 'Reject'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
