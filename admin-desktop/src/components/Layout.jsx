import { useState, useEffect, useRef } from 'preact/compat'
import { authUser, clearAuth } from '../lib/auth'
import { route } from 'preact-router'
import { useI18n } from '../lib/i18n'
import { LangSwitcher } from './LangSwitcher'
import { api } from '../lib/api'

export function Layout({ children, currentPath }) {
  const { t, lang } = useI18n()
  const [chatUnread, setChatUnread] = useState(0)
  const chatPollRef = useRef(null)

  useEffect(() => {
    const poll = () => api.getChatUnread().then(r => setChatUnread(r.count || 0)).catch(() => {})
    poll()
    chatPollRef.current = setInterval(poll, 60000)
    return () => clearInterval(chatPollRef.current)
  }, [])

  function logout() {
    clearAuth()
    route('/login')
  }

  const navItems = [
    { href: '/dashboard', label: t('dashboard') },
    { href: '/plans', label: t('plans') },
    { href: '/tenants', label: t('tenants') },
    { href: '/admins', label: t('admins') },
    { href: '/metrics', label: t('apiMetrics') },
    { href: '/storage', label: t('storageUsage') },
    { href: '/folder-requests', label: t('folderRequests') },
    { href: '/chat', label: t('chatPage'), badge: chatUnread },
  ]

  return (
    <div class={`min-h-screen flex bg-base-200 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
      <aside class={`w-56 bg-base-100 flex flex-col ${lang === 'ar' ? 'border-l' : 'border-r'} border-base-300`}>
        <div class="p-4 border-b border-base-300">
          <h1 class="text-lg font-bold text-primary">CiPOSdz Admin</h1>
          <p class="text-xs text-base-content/60">{t('superAdmin')}</p>
        </div>

        <nav class="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              class={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${currentPath === item.href
                  ? 'bg-primary text-primary-content'
                  : 'hover:bg-base-200 text-base-content'}`}
            >
              <span class="flex-1">{item.label}</span>
              {item.badge > 0 && <span class="badge badge-error badge-xs text-[10px] px-1.5">{item.badge}</span>}
            </a>
          ))}
        </nav>

        <div class="p-3 border-t border-base-300 space-y-2">
          <LangSwitcher />
          <p class="text-xs text-base-content/60 truncate">{authUser.value?.email}</p>
          <button onClick={logout} class="btn btn-sm btn-error btn-outline w-full">
            {t('logout')}
          </button>
        </div>
      </aside>

      <main class="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
