import { useState, useEffect } from 'preact/hooks'
import { Fragment } from 'preact'
import { saApi } from '../api'
import { useI18n } from '../../lib/i18n'

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
    saApi.getStorageUsage().then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div class="flex justify-center py-16"><span class="loading loading-spinner loading-lg text-primary" /></div>
  if (error) return <div class="alert alert-error">{error}</div>

  const tenants = data?.tenants || []

  return (
    <div>
      <h2 class="text-2xl font-bold mb-6">{t('storageUsage') || 'Storage Usage'}</h2>
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="card bg-base-100 shadow"><div class="card-body py-4">
          <p class="text-xs text-base-content/60">{t('totalDbSize') || 'DB Size'}</p>
          <p class="text-2xl font-bold text-primary">{fmt(data?.total_db_bytes || 0)}</p>
        </div></div>
        <div class="card bg-base-100 shadow"><div class="card-body py-4">
          <p class="text-xs text-base-content/60">{t('totalDiskSize') || 'Disk Size'}</p>
          <p class="text-2xl font-bold text-secondary">{fmt(data?.total_disk_bytes || 0)}</p>
        </div></div>
        <div class="card bg-base-100 shadow"><div class="card-body py-4">
          <p class="text-xs text-base-content/60">{t('totalSize') || 'Total'}</p>
          <p class="text-2xl font-bold">{fmt(data?.total_bytes || 0)}</p>
        </div></div>
      </div>

      {tenants.length === 0 ? (
        <p class="text-base-content/60 text-center py-10">{t('noStores') || 'No stores'}</p>
      ) : (
        <div class="card bg-base-100 shadow overflow-hidden">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                <th class="px-3 py-2 text-xs">{t('store') || 'Store'}</th>
                <th class="px-3 py-2 text-xs">{t('dbSize') || 'DB'}</th>
                <th class="px-3 py-2 text-xs">{t('diskSize') || 'Disk'}</th>
                <th class="px-3 py-2 text-xs">{t('totalSize') || 'Total'}</th>
                <th class="px-3 py-2 text-xs w-16"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(tenant => (
                <Fragment key={tenant.tenant_id}>
                  <tr class="border-b border-base-200">
                    <td class="px-3 py-2 font-medium">{tenant.tenant_name}</td>
                    <td class="px-3 py-2">{fmt(tenant.db_bytes)}</td>
                    <td class="px-3 py-2">{fmt(tenant.disk_bytes)}</td>
                    <td class="px-3 py-2 font-semibold">{fmt(tenant.total_bytes)}</td>
                    <td class="px-3 py-2">
                      <button class="btn btn-xs btn-ghost" onClick={() => setExpanded(expanded === tenant.tenant_id ? null : tenant.tenant_id)}>
                        {expanded === tenant.tenant_id ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>
                  {expanded === tenant.tenant_id && (
                    <tr><td colspan="5" class="bg-base-200 px-6 py-3">
                      <div class="grid grid-cols-3 gap-2">
                        {Object.entries(tenant.doc_counts || {}).sort(([,a],[,b]) => b - a).map(([col, count]) => (
                          <div key={col} class="flex justify-between text-sm px-2 py-1 bg-base-100 rounded">
                            <span class="text-base-content/70">{col}</span>
                            <span class="font-mono font-semibold">{count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
