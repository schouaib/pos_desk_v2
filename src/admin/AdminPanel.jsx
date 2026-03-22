import { useState, useEffect, useCallback } from 'preact/compat'
import { signal } from '@preact/signals'
import { isSaLoggedIn, setSaAuth, clearSaAuth, saUser } from './auth'
import { saApi, setSaActivationHeaders } from './api'
import { useI18n } from '../lib/i18n'

// Admin panel visibility signal — toggled by Ctrl+Shift+F12
export const adminPanelOpen = signal(false)

// Admin pages
import AdminDashboard from './pages/Dashboard'
import AdminPlans from './pages/Plans'
import AdminTenants from './pages/Tenants'
import AdminAdmins from './pages/Admins'
import AdminApiMetrics from './pages/ApiMetrics'
import AdminStorage from './pages/Storage'
import AdminFolderRequests from './pages/FolderRequests'

// Initialize activation headers from main app
export function initSaHeaders(machineId, key) {
  setSaActivationHeaders(machineId, key)
}

function AdminLogin({ onLogin }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await saApi.login(form)
      setSaAuth(data.token, data.admin)
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="flex items-center justify-center min-h-full">
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-xl font-bold mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Super Admin
          </h2>
          <p class="text-base-content/60 text-sm mb-4">{t('signInManage') || 'Sign in to manage the system'}</p>

          {error && (
            <div class="alert alert-error text-sm py-2 mb-2">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} class="space-y-3">
            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('username') || 'Username'}</span>
              <input type="text" class="input input-bordered input-sm"
                value={form.email} onInput={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
            </label>
            <label class="form-control">
              <span class="label-text text-sm font-medium">{t('password')}</span>
              <input type="password" class="input input-bordered input-sm"
                value={form.password} onInput={(e) => setForm({ ...form, password: e.target.value })} required />
            </label>
            <button type="submit" class={`btn btn-primary btn-sm w-full ${loading ? 'loading' : ''}`} disabled={loading}>
              {t('signIn') || 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function PasswordChangeModal({ onDone }) {
  const { t } = useI18n()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (pw !== confirm) { setError('Passwords do not match'); return }
    setError('')
    setLoading(true)
    try {
      await saApi.changePassword({ new_password: pw })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center">
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-lg font-bold text-warning">
            {t('changePassword') || 'Change Password Required'}
          </h2>
          <p class="text-sm text-base-content/60 mb-2">
            You are using a default password. Please change it now for security.
          </p>
          {error && <div class="alert alert-error text-sm py-2 mb-2"><span>{error}</span></div>}
          <form onSubmit={handleSubmit} class="space-y-3">
            <label class="form-control">
              <span class="label-text text-sm">{t('newPassword') || 'New Password'}</span>
              <input type="password" class="input input-bordered input-sm"
                value={pw} onInput={(e) => setPw(e.target.value)} required minLength={8} autoFocus />
            </label>
            <label class="form-control">
              <span class="label-text text-sm">{t('confirmPassword') || 'Confirm Password'}</span>
              <input type="password" class="input input-bordered input-sm"
                value={confirm} onInput={(e) => setConfirm(e.target.value)} required minLength={8} />
            </label>
            <button type="submit" class={`btn btn-warning btn-sm w-full ${loading ? 'loading' : ''}`} disabled={loading}>
              {t('changePassword') || 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function AdminLayout({ onClose }) {
  const { t } = useI18n()
  const [page, setPage] = useState('dashboard')
  const [mustChange, setMustChange] = useState(false)

  useEffect(() => {
    // Check if user must change password
    if (saUser.value?.must_change_password) {
      setMustChange(true)
    }
  }, [])

  function logout() {
    saApi.logout().catch(() => {})
    clearSaAuth()
  }

  const navItems = [
    { key: 'dashboard', label: t('dashboard') || 'Dashboard' },
    { key: 'plans', label: t('plans') || 'Plans' },
    { key: 'tenants', label: t('tenants') || 'Stores' },
    { key: 'admins', label: t('admins') || 'Admins' },
    { key: 'metrics', label: t('apiMetrics') || 'API Metrics' },
    { key: 'storage', label: t('storageUsage') || 'Storage' },
    { key: 'folders', label: t('folderRequests') || 'Folder Requests' },
  ]

  return (
    <div class="flex h-full">
      {mustChange && (
        <PasswordChangeModal onDone={() => setMustChange(false)} />
      )}

      {/* Sidebar */}
      <aside class="w-52 bg-base-100 border-r border-base-300 flex flex-col shrink-0">
        <div class="p-4 border-b border-base-300 flex items-center justify-between">
          <div>
            <h1 class="text-base font-bold text-primary">Admin Panel</h1>
            <p class="text-[10px] text-base-content/50">Super Admin</p>
          </div>
          <button onClick={onClose} class="btn btn-ghost btn-xs btn-circle" title="Close (Ctrl+Shift+F12)">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav class="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              class={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${page === item.key
                  ? 'bg-primary text-primary-content'
                  : 'hover:bg-base-200 text-base-content'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div class="p-3 border-t border-base-300 space-y-2">
          <p class="text-xs text-base-content/60 truncate">{saUser.value?.email}</p>
          <button onClick={logout} class="btn btn-sm btn-error btn-outline w-full">
            {t('logout') || 'Logout'}
          </button>
        </div>
      </aside>

      {/* Content */}
      <main class="flex-1 p-6 overflow-auto bg-base-200">
        {page === 'dashboard' && <AdminDashboard />}
        {page === 'plans' && <AdminPlans />}
        {page === 'tenants' && <AdminTenants />}
        {page === 'admins' && <AdminAdmins />}
        {page === 'metrics' && <AdminApiMetrics />}
        {page === 'storage' && <AdminStorage />}
        {page === 'folders' && <AdminFolderRequests />}
      </main>
    </div>
  )
}

export default function AdminPanel() {
  const [loggedIn, setLoggedIn] = useState(isSaLoggedIn())

  const handleClose = useCallback(() => {
    adminPanelOpen.value = false
  }, [])

  // Listen for auth changes
  useEffect(() => {
    const check = setInterval(() => {
      const current = isSaLoggedIn()
      if (current !== loggedIn) setLoggedIn(current)
    }, 500)
    return () => clearInterval(check)
  }, [loggedIn])

  if (!adminPanelOpen.value) return null

  return (
    <div class="fixed inset-0 z-50 bg-base-200 flex flex-col" style="backdrop-filter: blur(4px)">
      {/* Overlay header bar */}
      <div class="bg-neutral text-neutral-content px-4 py-1.5 flex items-center justify-between text-sm shrink-0">
        <span class="font-semibold">Admin Panel</span>
        <div class="flex items-center gap-3">
          <kbd class="kbd kbd-xs bg-neutral-focus">Ctrl+Shift+F12</kbd>
          <button onClick={handleClose} class="btn btn-ghost btn-xs text-neutral-content">Close</button>
        </div>
      </div>

      {/* Content area */}
      <div class="flex-1 overflow-hidden">
        {loggedIn ? (
          <AdminLayout onClose={handleClose} />
        ) : (
          <AdminLogin onLogin={() => setLoggedIn(true)} />
        )}
      </div>
    </div>
  )
}
