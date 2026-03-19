import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

export default function FolderRequests() {
  const { t } = useI18n()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    api.listPendingFolders()
      .then(r => setRequests(r || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function approve(id) {
    try {
      await api.approveFolder(id)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function reject(id) {
    try {
      await api.rejectFolder(id)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Layout currentPath="/folder-requests">
      <h2 class="text-2xl font-bold mb-6">{t('folderRequests')}</h2>

      {error && <div class="alert alert-error mb-4">{error}</div>}

      {loading ? (
        <div class="flex justify-center py-20">
          <span class="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : requests.length === 0 ? (
        <p class="text-base-content/60 text-center py-10">{t('noPendingRequests')}</p>
      ) : (
        <div class="overflow-x-auto">
          <table class="table table-sm bg-base-100 rounded-xl">
            <thead>
              <tr>
                <th>{t('store')}</th>
                <th>{t('folderName')}</th>
                <th>{t('requestDate')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id} class="hover">
                  <td class="font-medium">{req.tenant_name}</td>
                  <td>{req.folder_name}</td>
                  <td class="text-sm text-base-content/60">
                    {new Date(req.created_at).toLocaleDateString()}
                  </td>
                  <td class="space-x-2">
                    <button class="btn btn-xs btn-success" onClick={() => approve(req.id)}>
                      {t('approve')}
                    </button>
                    <button class="btn btn-xs btn-error btn-outline" onClick={() => reject(req.id)}>
                      {t('reject')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
