import { useState, useEffect } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { Modal, openModal, closeModal } from '../components/Modal'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

const ALL_FEATURES = [
  { key: 'products',        labelKey: 'featProducts' },
  { key: 'purchases',       labelKey: 'featPurchases' },
  { key: 'suppliers',       labelKey: 'featSuppliers' },
  { key: 'sales',           labelKey: 'featSales' },
  { key: 'pos',             labelKey: 'featPOS' },
  { key: 'losses',          labelKey: 'featLosses' },
  { key: 'expenses',        labelKey: 'featExpenses' },
  { key: 'retraits',        labelKey: 'featRetraits' },
  { key: 'stats',           labelKey: 'featStats' },
  { key: 'multi_barcodes',   labelKey: 'featMultiBarcodes' },
  { key: 'product_history',  labelKey: 'featProductHistory' },
  { key: 'clients',          labelKey: 'featClients' },
  { key: 'client_payments',  labelKey: 'featClientPayments' },
  { key: 'user_summary',     labelKey: 'featUserSummary' },
  { key: 'multi_folders',    labelKey: 'featMultiFolders' },
  { key: 'access_management', labelKey: 'featAccessManagement' },
  { key: 'favorites',          labelKey: 'featFavorites' },
  { key: 'product_variants',   labelKey: 'featProductVariants' },
  { key: 'stock_transfers',    labelKey: 'featStockTransfers' },
  { key: 'product_discounts',  labelKey: 'featProductDiscounts' },
  { key: 'product_bundles',    labelKey: 'featProductBundles' },
  { key: 'batch_tracking',     labelKey: 'featBatchTracking' },
]

const emptyFeatures = { products: false, purchases: false, suppliers: false, sales: false, pos: false, losses: false, expenses: false, retraits: false, stats: false, multi_barcodes: false, product_history: false, clients: false, client_payments: false, user_summary: false, multi_folders: false, access_management: false, favorites: false, product_variants: false, stock_transfers: false, product_discounts: false, product_bundles: false, batch_tracking: false }
const empty = { name: '', description: '', price: '', max_users: '0', max_products: '0', max_sales_month: '0', features: emptyFeatures }

export default function Plans({ path }) {
  const { t } = useI18n()
  const [plans, setPlans] = useState([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    try { setPlans(await api.listPlans()) } catch {}
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm(empty)
    setError('')
    openModal('plan-modal')
  }

  function openEdit(plan) {
    setEditing(plan)
    setForm({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      max_users: plan.max_users,
      max_products: plan.max_products,
      max_sales_month: plan.max_sales_month ?? 0,
      features: { ...emptyFeatures, ...plan.features },
    })
    setError('')
    openModal('plan-modal')
  }

  function toggleFeature(key) {
    setForm((f) => ({ ...f, features: { ...f.features, [key]: !f.features[key] } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = {
        ...form,
        price: parseFloat(form.price),
        max_users: parseInt(form.max_users),
        max_products: parseInt(form.max_products),
        max_sales_month: parseInt(form.max_sales_month),
      }
      if (editing) {
        await api.updatePlan(editing.id, body)
      } else {
        await api.createPlan(body)
      }
      closeModal('plan-modal')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleActive(plan) {
    try { await api.setPlanActive(plan.id, !plan.active); load() } catch {}
  }

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('subscriptionPlans')}</h2>
        <button class="btn btn-primary btn-sm" onClick={openCreate}>{t('newPlan')}</button>
      </div>

      <div class="card bg-base-100 shadow overflow-hidden">
        <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table class="table table-sm w-full">
            <thead class="bg-base-200/60">
              <tr>
                {[t('name'), t('priceMo'), t('maxUsers'), t('maxProducts'), t('maxSalesMonth'), t('planFeatures'), t('status'), t('actions')].map((h, i) => (
                  <th key={i} class="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} class="border-b border-base-200 hover:bg-base-50 transition-colors">
                  <td class="px-3 py-2.5">
                    <div class="font-medium">{p.name}</div>
                    <div class="text-xs text-base-content/50 mt-0.5">{p.description}</div>
                  </td>
                  <td class="px-3 py-2.5 font-medium tabular-nums">${p.price}</td>
                  <td class="px-3 py-2.5 tabular-nums">{p.max_users === 0 ? '∞' : p.max_users}</td>
                  <td class="px-3 py-2.5 tabular-nums">{p.max_products === 0 ? '∞' : p.max_products}</td>
                  <td class="px-3 py-2.5 tabular-nums">{(!p.max_sales_month || p.max_sales_month === 0) ? '∞' : p.max_sales_month}</td>
                  <td class="px-3 py-2.5">
                    <div class="flex flex-wrap gap-1 max-w-xs">
                      {ALL_FEATURES.filter((f) => p.features?.[f.key]).map((f) => (
                        <span key={f.key} class="badge badge-xs badge-primary badge-outline">{t(f.labelKey)}</span>
                      ))}
                      {!ALL_FEATURES.some((f) => p.features?.[f.key]) && (
                        <span class="text-xs text-base-content/30">—</span>
                      )}
                    </div>
                  </td>
                  <td class="px-3 py-2.5">
                    <span class={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${p.active ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                      {p.active ? t('active') : t('disabled')}
                    </span>
                  </td>
                  <td class="px-3 py-2.5">
                    <div class="flex gap-1">
                      <button class="btn btn-xs btn-ghost border border-base-300" onClick={() => openEdit(p)}>{t('edit')}</button>
                      <button
                        class={`btn btn-xs btn-ghost border ${p.active ? 'border-error text-error hover:bg-error hover:text-white' : 'border-success text-success hover:bg-success hover:text-white'}`}
                        onClick={() => toggleActive(p)}
                      >
                        {p.active ? t('disable') : t('enable')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr>
                  <td colSpan={8} class="px-3 py-12 text-center text-base-content/40">{t('noPlans')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal id="plan-modal" title={editing ? t('editPlan') : t('newPlanTitle')}>
        {error && <div class="alert alert-error text-sm py-2 mb-3"><span>{error}</span></div>}
        <form onSubmit={handleSubmit} class="space-y-3">
          <label class="form-control">
            <span class="label-text text-sm">{t('name')}</span>
            <input class="input input-bordered input-sm" value={form.name}
              onInput={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label class="form-control">
            <span class="label-text text-sm">{t('description')}</span>
            <input class="input input-bordered input-sm" value={form.description}
              onInput={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="form-control">
              <span class="label-text text-sm">{t('price')}</span>
              <input type="number" min="0" step="0.01" class="input input-bordered input-sm"
                value={form.price} onInput={(e) => setForm({ ...form, price: e.target.value })} required />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('maxUsers')} (0=∞)</span>
              <input type="number" min="0" class="input input-bordered input-sm"
                value={form.max_users} onInput={(e) => setForm({ ...form, max_users: e.target.value })} required />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('maxProducts')} (0=∞)</span>
              <input type="number" min="0" class="input input-bordered input-sm"
                value={form.max_products} onInput={(e) => setForm({ ...form, max_products: e.target.value })} required />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('maxSalesMonth')} (0=∞)</span>
              <input type="number" min="0" class="input input-bordered input-sm"
                value={form.max_sales_month} onInput={(e) => setForm({ ...form, max_sales_month: e.target.value })} required />
            </label>
          </div>

          <div>
            <p class="label-text text-sm font-medium mb-2">{t('planFeatures')}</p>
            <div class="grid grid-cols-2 gap-1.5 border border-base-300 rounded-lg p-3">
              {ALL_FEATURES.map((f) => (
                <label key={f.key} class="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm checkbox-primary"
                    checked={!!form.features[f.key]}
                    onChange={() => toggleFeature(f.key)}
                  />
                  <span class="text-sm">{t(f.labelKey)}</span>
                </label>
              ))}
            </div>
          </div>

          <div class="modal-action">
            <button type="submit" class={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`} disabled={loading}>
              {editing ? t('saveChanges') : t('createPlan')}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  )
}
