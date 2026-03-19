import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

export default function Dashboard({ path }) {
  const { t } = useI18n()
  const [stats, setStats] = useState({ plans: 0, tenants: 0, admins: 0 })

  useEffect(() => {
    Promise.all([api.listPlans(), api.listTenants(), api.listAdmins()])
      .then(([plans, tenants, admins]) => {
        setStats({
          plans: plans?.length || 0,
          tenants: tenants?.length || 0,
          admins: admins?.length || 0,
          activeTenants: tenants?.filter((t) => t.active).length || 0,
        })
      })
      .catch(() => {})
  }, [])

  const cards = [
    { label: t('totalPlans'), value: stats.plans, color: 'text-primary' },
    { label: t('totalStores'), value: stats.tenants, color: 'text-secondary' },
    { label: t('activeStores'), value: stats.activeTenants, color: 'text-success' },
    { label: t('totalAdmins'), value: stats.admins, color: 'text-warning' },
  ]

  return (
    <Layout currentPath={path}>
      <h2 class="text-2xl font-bold mb-6">{t('dashboard')}</h2>

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

      <div class="mt-8 card bg-base-100 shadow p-4">
        <h3 class="font-semibold mb-2">{t('quickLinks')}</h3>
        <div class="flex gap-2 flex-wrap">
          <a href="/plans" class="btn btn-sm btn-outline">{t('managePlans')}</a>
          <a href="/tenants" class="btn btn-sm btn-outline">{t('manageStores')}</a>
          <a href="/admins" class="btn btn-sm btn-outline">{t('manageAdmins')}</a>
        </div>
      </div>
    </Layout>
  )
}
