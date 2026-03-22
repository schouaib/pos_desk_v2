import { useState, useEffect } from 'preact/hooks'
import { saApi } from '../api'
import { useI18n } from '../../lib/i18n'

export default function Dashboard() {
  const { t } = useI18n()
  const [stats, setStats] = useState({ plans: 0, tenants: 0, admins: 0, activeTenants: 0 })
  const [dbInfo, setDbInfo] = useState(null)
  const [showPasswords, setShowPasswords] = useState(false)

  useEffect(() => {
    Promise.all([saApi.listPlans(), saApi.listTenants(), saApi.listAdmins()])
      .then(([plans, tenants, admins]) => {
        setStats({
          plans: plans?.length || 0,
          tenants: tenants?.items?.length || tenants?.length || 0,
          admins: admins?.items?.length || admins?.length || 0,
          activeTenants: (tenants?.items || tenants || []).filter((t) => t.active).length,
        })
      })
      .catch(() => {})

    // Load DB credentials from Tauri
    if (window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('get_db_credentials').then(json => {
          try { setDbInfo(JSON.parse(json)) } catch {}
        }).catch(() => {})
      })
    }
  }, [])

  const cards = [
    { label: t('totalPlans') || 'Plans', value: stats.plans, color: 'text-primary' },
    { label: t('totalStores') || 'Stores', value: stats.tenants, color: 'text-secondary' },
    { label: t('activeStores') || 'Active Stores', value: stats.activeTenants, color: 'text-success' },
    { label: t('totalAdmins') || 'Admins', value: stats.admins, color: 'text-warning' },
  ]

  function mask(str) {
    if (!str) return '—'
    if (showPasswords) return str
    return str.slice(0, 3) + '•'.repeat(Math.max(str.length - 3, 5))
  }

  return (
    <div>
      <h2 class="text-2xl font-bold mb-6">{t('dashboard') || 'Dashboard'}</h2>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} class="card bg-base-100 shadow">
            <div class="card-body p-4">
              <p class="text-sm text-base-content/60">{c.label}</p>
              <p class={`text-4xl font-bold ${c.color}`}>{c.value ?? '—'}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Database Connection Info */}
      {dbInfo && (
        <div class="mt-8 card bg-base-100 shadow">
          <div class="card-body p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-lg">Database Connection</h3>
              <button
                class="btn btn-xs btn-ghost"
                onClick={() => setShowPasswords(!showPasswords)}
              >
                {showPasswords ? 'Hide' : 'Show'} Passwords
              </button>
            </div>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <tbody>
                  <tr>
                    <td class="font-medium text-base-content/70 w-40">Port</td>
                    <td class="font-mono">{dbInfo.port}</td>
                  </tr>
                  <tr>
                    <td class="font-medium text-base-content/70">Database</td>
                    <td class="font-mono">{dbInfo.db_name}</td>
                  </tr>
                  <tr>
                    <td class="font-medium text-base-content/70">Auth Enabled</td>
                    <td>
                      <span class={`badge badge-sm ${dbInfo.auth_enabled ? 'badge-success' : 'badge-warning'}`}>
                        {dbInfo.auth_enabled ? 'Yes' : 'No (restart app to enable)'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td class="font-medium text-base-content/70">Admin User</td>
                    <td class="font-mono">{dbInfo.admin_user}</td>
                  </tr>
                  <tr>
                    <td class="font-medium text-base-content/70">Admin Password</td>
                    <td class="font-mono select-all">{mask(dbInfo.admin_pass)}</td>
                  </tr>
                  <tr>
                    <td class="font-medium text-base-content/70">App User</td>
                    <td class="font-mono">{dbInfo.app_user}</td>
                  </tr>
                  <tr>
                    <td class="font-medium text-base-content/70">App Password</td>
                    <td class="font-mono select-all">{mask(dbInfo.app_pass)}</td>
                  </tr>
                  <tr>
                    <td class="font-medium text-base-content/70">Connection String</td>
                    <td class="font-mono text-xs break-all select-all">
                      {dbInfo.auth_enabled
                        ? `mongodb://${dbInfo.admin_user}:${showPasswords ? dbInfo.admin_pass : '****'}@127.0.0.1:${dbInfo.port}`
                        : `mongodb://127.0.0.1:${dbInfo.port}`
                      }
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-xs text-base-content/40 mt-2">
              Use the admin credentials to connect via MongoDB Compass or mongosh for maintenance.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
