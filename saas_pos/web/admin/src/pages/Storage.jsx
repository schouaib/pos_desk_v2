import { useState, useEffect } from 'preact/hooks'
import { Fragment } from 'preact'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

function fmt(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function Storage() {
  const { t } = useI18n()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    api.getStorageUsage()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <Layout currentPath="/storage">
      <div class="flex justify-center py-20">
        <span class="loading loading-spinner loading-lg text-primary" />
      </div>
    </Layout>
  )

  if (error) return (
    <Layout currentPath="/storage">
      <div class="alert alert-error">{error}</div>
    </Layout>
  )

  const tenants = data?.tenants || []

  return (
    <Layout currentPath="/storage">
      <h2 class="text-2xl font-bold mb-6">{t('storageUsage')}</h2>

      {/* Summary cards */}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body py-4">
            <p class="text-xs text-base-content/60">{t('totalDbSize')}</p>
            <p class="text-2xl font-bold text-primary">{fmt(data?.total_db_bytes || 0)}</p>
          </div>
        </div>
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body py-4">
            <p class="text-xs text-base-content/60">{t('totalDiskSize')}</p>
            <p class="text-2xl font-bold text-secondary">{fmt(data?.total_disk_bytes || 0)}</p>
          </div>
        </div>
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body py-4">
            <p class="text-xs text-base-content/60">{t('totalSize')}</p>
            <p class="text-2xl font-bold">{fmt(data?.total_bytes || 0)}</p>
          </div>
        </div>
      </div>

      {tenants.length === 0 ? (
        <p class="text-base-content/60 text-center py-10">{t('noStores')}</p>
      ) : (
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table class="table table-sm bg-base-100 rounded-xl">
            <thead>
              <tr>
                <th>{t('store')}</th>
                <th>{t('dbSize')}</th>
                <th>{t('diskSize')}</th>
                <th>{t('totalSize')}</th>
                <th>{t('details')}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(tenant => (
                <Fragment key={tenant.tenant_id}>
                  <tr class="hover">
                    <td class="font-medium">
                      {tenant.tenant_name}
                      {tenant.folders?.length > 0 && (
                        <span class="badge badge-xs badge-ghost ms-2">{tenant.folders.length + 1} {t('folders') || 'folders'}</span>
                      )}
                    </td>
                    <td>{fmt(tenant.db_bytes)}</td>
                    <td>{fmt(tenant.disk_bytes)}</td>
                    <td class="font-semibold">{fmt(tenant.total_bytes)}</td>
                    <td>
                      <button
                        class="btn btn-xs btn-ghost"
                        onClick={() => setExpanded(expanded === tenant.tenant_id ? null : tenant.tenant_id)}
                      >
                        {expanded === tenant.tenant_id ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>
                  {expanded === tenant.tenant_id && (
                    <tr key={tenant.tenant_id + '-detail'}>
                      <td colspan="5" class="bg-base-200 px-6 py-3 space-y-3">
                        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                          {Object.entries(tenant.doc_counts || {})
                            .sort(([,a], [,b]) => b - a)
                            .map(([col, count]) => (
                              <div key={col} class="flex justify-between gap-2 text-sm px-2 py-1 bg-base-100 rounded">
                                <span class="text-base-content/70">{col}</span>
                                <span class="font-mono font-semibold">{count.toLocaleString()}</span>
                              </div>
                            ))
                          }
                        </div>
                        {tenant.folders?.length > 0 && (
                          <div class="mt-3">
                            <p class="text-xs font-semibold text-base-content/60 mb-2">{t('folderRequests') || 'Folders'}</p>
                            <div class="overflow-x-auto">
                              <table class="table table-xs bg-base-100 rounded-lg">
                                <thead>
                                  <tr>
                                    <th>{t('folderName')}</th>
                                    <th>{t('dbSize')}</th>
                                    <th>{t('diskSize')}</th>
                                    <th>{t('totalSize')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tenant.folders.map(f => (
                                    <tr key={f.folder_id}>
                                      <td>{f.folder_name}</td>
                                      <td>{fmt(f.db_bytes)}</td>
                                      <td>{fmt(f.disk_bytes)}</td>
                                      <td class="font-semibold">{fmt(f.total_bytes)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
