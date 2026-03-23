import { useState, useEffect, useCallback, useRef, memo } from 'preact/compat'
import { authUser, clearAuth, isTenantAdmin, hasPerm, hasFeature, batchAlerts } from '../lib/auth'
import { route } from 'preact-router'
import { useI18n } from '../lib/i18n'
import { LangSwitcher } from './LangSwitcher'
import { api } from '../lib/api'
import { shortcutsOpen } from '../components/ShortcutsOverlay'

const inventoryPaths = ['/products', '/categories', '/brands', '/units', '/favorites']
const stockPaths = ['/losses', '/low-stock', '/expiring-batches', '/archived-products', '/transfers']
const purchasePaths = ['/purchases', '/suppliers']
const salesPaths = ['/pos', '/sales', '/sale-returns', '/facturation']
const financePaths = ['/sales-stats', '/expenses', '/retraits', '/user-summary', '/declarations']
const peoplePaths = ['/clients', '/users']
const systemPaths = ['/settings', '/folders', '/chat']

const Icon = memo(({ d, className = 'w-4 h-4 shrink-0' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" class={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d={d} />
  </svg>
))

const ICONS = {
  dashboard:  'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  products:   'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
  purchases:  'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
  suppliers:  'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
  categories: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L9.568 3zM6 6h.008v.008H6V6z',
  brands:     'M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9',
  units:      'M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z',
  staff:      'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  clients:    'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  settings:   'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  favorites:  'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
  losses:     'M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  pos:        'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  sales:      'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6',
  salesStats: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  expenses:   'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  retraits:   'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
  userSummary:'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
  logout:     'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
  chevron:    'M19 9l-7 7-7-7',
  store:      'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.375.375 0 00.375-.375v-1.5a.375.375 0 00-.375-.375h-3.75a.375.375 0 00-.375.375v1.5c0 .207.168.375.375.375z',
  folders:    'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z',
  chat:       'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
  stock:      'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125',
  finance:    'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  people:     'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  systemGear: 'M11.42 15.17l-5.1 3.03a.75.75 0 01-1.14-.76l1.28-5.63a.75.75 0 00-.24-.7L1.53 7.11a.75.75 0 01.43-1.32l5.79-.49a.75.75 0 00.63-.43L10.97.74a.75.75 0 011.37 0l2.59 5.13a.75.75 0 00.63.43l5.79.49a.75.75 0 01.43 1.32l-4.28 3.7a.75.75 0 00-.24.7l1.28 5.63a.75.75 0 01-1.14.76l-5.1-3.03a.75.75 0 00-.74 0z',
  facturation: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.888L15.721 18.75M13.481 16.638a.75.75 0 11-1.06-1.06.75.75 0 011.06 1.06zm0 0L11.228 18.89a1.5 1.5 0 01-2.121 0l-1.5-1.5a1.5 1.5 0 010-2.121l6.364-6.364a.75.75 0 011.06 0l1.5 1.5a.75.75 0 010 1.06l-6.364 6.364zM10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  declarations: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  menu:       'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  close:      'M6 18L18 6M6 6l12 12',
}

const NavLink = memo(({ href, label, icon, active, onNavigate, badge, kbdHint }) => (
  <a
    href={href}
    onClick={onNavigate}
    class={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
      ${active
        ? 'bg-primary text-primary-content shadow-sm'
        : 'text-base-content/65 hover:text-base-content hover:bg-base-200'}`}
  >
    {icon && <Icon d={icon} />}
    <span class="flex-1">{label}</span>
    {badge > 0 && <span class="badge badge-error badge-xs text-[10px] px-1.5">{badge}</span>}
    {kbdHint && <span class="kbd-hint hidden lg:group-hover:inline-flex ms-auto">{kbdHint}</span>}
  </a>
))

const GroupButton = memo(({ label, icon, isActive, isOpen, onClick }) => (
  <button
    onClick={onClick}
    class={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
      ${isActive ? 'text-primary bg-primary/8' : 'text-base-content/65 hover:text-base-content hover:bg-base-200'}`}
  >
    <span class="flex items-center gap-2.5">
      <Icon d={icon} />
      {label}
    </span>
    <Icon d={ICONS.chevron} className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
  </button>
))

export function Layout({ children, currentPath }) {
  const { t, lang } = useI18n()
  const rtl = lang === 'ar'
  const [open, setOpen] = useState(false)

  // Accordion: only one group open at a time
  const initialGroup =
    inventoryPaths.includes(currentPath) ? 'inventory' :
    stockPaths.includes(currentPath) ? 'stock' :
    purchasePaths.includes(currentPath) ? 'purchases' :
    salesPaths.includes(currentPath) ? 'sales' :
    financePaths.includes(currentPath) ? 'finance' :
    peoplePaths.includes(currentPath) ? 'people' :
    systemPaths.includes(currentPath) ? 'system' : null
  const [activeGroup, setActiveGroup] = useState(initialGroup)
  const toggleGroup = useCallback((group) => setActiveGroup((v) => v === group ? null : group), [])

  const [chatUnread, setChatUnread] = useState(0)
  const chatPollRef = useRef(null)

  // Expired / expiring batches alert (admin only, fetched once on login)
  const expiredBatches = batchAlerts.value
  const [batchAlertDismissed, setBatchAlertDismissed] = useState(false)

  useEffect(() => {
    if (!isTenantAdmin()) return
    let active = true
    const poll = () => api.getChatUnread().then(r => { if (active) setChatUnread(r.count || 0) }).catch(() => {})
    poll()
    chatPollRef.current = setInterval(poll, 60000)
    return () => { active = false; clearInterval(chatPollRef.current) }
  }, [])

  const closeMenu = useCallback(() => setOpen(false), [])

  function logout() {
    clearAuth()
    route('/login')
  }

  const email = authUser.value?.email || ''
  const initial = email[0]?.toUpperCase() || '?'

  const sidebarContent = (
    <>
      {/* Header */}
      <div class="p-4 border-b border-base-300">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Icon d={ICONS.store} className="w-4.5 h-4.5 text-primary-content w-5 h-5" />
            </div>
            <div class="min-w-0">
              <p class="font-bold text-sm leading-tight truncate">{t('storeAdmin')}</p>
              <p class="text-xs text-base-content/50 capitalize">{authUser.value?.role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button class="md:hidden btn btn-sm btn-ghost btn-square" onClick={() => setOpen(false)}>
            <Icon d={ICONS.close} />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav class="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <NavLink href="/dashboard" label={t('dashboard')} icon={ICONS.dashboard} active={currentPath === '/dashboard'} onNavigate={closeMenu} kbdHint="Ctrl+D" />

        {/* Inventory: products, categories, brands, units, favorites */}
        {hasFeature('products') && (
          <GroupButton
            label={t('inventory')}
            icon={ICONS.products}
            isActive={inventoryPaths.includes(currentPath)}
            isOpen={activeGroup === 'inventory'}
            onClick={() => toggleGroup('inventory')}
          />
        )}
        {hasFeature('products') && activeGroup === 'inventory' && (
          <div class="ms-4 mt-0.5 space-y-0.5 border-s-2 border-base-300 ps-2">
            {hasPerm('products',   'view') && <NavLink href="/products"   label={t('productsPage')}   icon={ICONS.products}   active={currentPath === '/products'}   onNavigate={closeMenu} />}
            {hasPerm('categories', 'view') && <NavLink href="/categories" label={t('categoriesPage')} icon={ICONS.categories} active={currentPath === '/categories'} onNavigate={closeMenu} />}
            {hasPerm('brands',     'view') && <NavLink href="/brands"     label={t('brandsPage')}     icon={ICONS.brands}     active={currentPath === '/brands'}     onNavigate={closeMenu} />}
            {hasPerm('units',      'view') && <NavLink href="/units"      label={t('unitsPage')}      icon={ICONS.units}      active={currentPath === '/units'}      onNavigate={closeMenu} />}
            {hasFeature('favorites') && hasPerm('favorites', 'view') && <NavLink href="/favorites" label={t('favoritesPage')} icon={ICONS.favorites} active={currentPath === '/favorites'} onNavigate={closeMenu} />}
          </div>
        )}

        {/* Stock: losses, low-stock, expiring, archived, transfers */}
        {hasFeature('products') && (
          <GroupButton
            label={t('stockManagement')}
            icon={ICONS.stock}
            isActive={stockPaths.includes(currentPath)}
            isOpen={activeGroup === 'stock'}
            onClick={() => toggleGroup('stock')}
          />
        )}
        {hasFeature('products') && activeGroup === 'stock' && (
          <div class="ms-4 mt-0.5 space-y-0.5 border-s-2 border-base-300 ps-2">
            {hasFeature('losses') && hasPerm('products', 'loss') && <NavLink href="/losses" label={t('losses')} icon={ICONS.losses} active={currentPath === '/losses'} onNavigate={closeMenu} />}
            {hasPerm('products', 'alert') && <NavLink href="/low-stock" label={t('lowStockAlert')} icon={ICONS.losses} active={currentPath === '/low-stock'} onNavigate={closeMenu} />}
            {hasFeature('batch_tracking') && hasPerm('products', 'view') && <NavLink href="/expiring-batches" label={t('expiring')} icon={ICONS.losses} active={currentPath === '/expiring-batches'} onNavigate={closeMenu} />}
            {hasPerm('products', 'archive') && <NavLink href="/archived-products" label={t('archivedProducts')} icon={ICONS.products} active={currentPath === '/archived-products'} onNavigate={closeMenu} />}
            {hasFeature('stock_transfers') && hasPerm('products', 'view') && <NavLink href="/transfers" label={t('transfers')} icon={ICONS.products} active={currentPath === '/transfers'} onNavigate={closeMenu} />}
          </div>
        )}

        {/* Purchases */}
        {(hasFeature('purchases') || hasFeature('suppliers')) && (
          <GroupButton
            label={t('purchasesPage')}
            icon={ICONS.purchases}
            isActive={purchasePaths.includes(currentPath)}
            isOpen={activeGroup === 'purchases'}
            onClick={() => toggleGroup('purchases')}
          />
        )}
        {(hasFeature('purchases') || hasFeature('suppliers')) && activeGroup === 'purchases' && (
          <div class="ms-4 mt-0.5 space-y-0.5 border-s-2 border-base-300 ps-2">
            {hasFeature('purchases') && hasPerm('purchases', 'view') && <NavLink href="/purchases" label={t('purchasesPage')} icon={ICONS.purchases} active={currentPath === '/purchases'} onNavigate={closeMenu} />}
            {hasFeature('suppliers') && hasPerm('suppliers', 'view') && <NavLink href="/suppliers" label={t('suppliersPage')} icon={ICONS.suppliers} active={currentPath === '/suppliers'} onNavigate={closeMenu} />}
          </div>
        )}

        {/* Sales: pos, sales history, returns */}
        {(hasFeature('pos') || hasFeature('sales')) && (hasPerm('sales', 'add') || hasPerm('sales', 'view')) && (
          <GroupButton
            label={t('salesPage')}
            icon={ICONS.pos}
            isActive={salesPaths.includes(currentPath)}
            isOpen={activeGroup === 'sales'}
            onClick={() => toggleGroup('sales')}
          />
        )}
        {activeGroup === 'sales' && (
          <div class="ms-4 mt-0.5 space-y-0.5 border-s-2 border-base-300 ps-2">
            {hasFeature('pos')   && hasPerm('sales', 'add')    && <NavLink href="/pos"          label={t('posNav')}      icon={ICONS.pos}   active={currentPath === '/pos'}          onNavigate={closeMenu} kbdHint="Ctrl+P" />}
            {hasFeature('sales') && hasPerm('sales', 'view')   && <NavLink href="/sales"        label={t('salesPage')}   icon={ICONS.sales} active={currentPath === '/sales'}        onNavigate={closeMenu} />}
            {hasFeature('sales') && hasPerm('sales', 'return') && <NavLink href="/sale-returns" label={t('saleReturns')} icon={ICONS.sales} active={currentPath === '/sale-returns'} onNavigate={closeMenu} />}
            {hasFeature('facturation') && hasPerm('facturation', 'view') && <NavLink href="/facturation" label={t('facturationPage')} icon={ICONS.facturation} active={currentPath === '/facturation'} onNavigate={closeMenu} />}
          </div>
        )}

        {/* Finance: stats, expenses, retraits, user summary */}
        {(hasFeature('stats') || hasFeature('expenses') || hasFeature('retraits') || hasFeature('user_summary')) && (
          <GroupButton
            label={t('finance')}
            icon={ICONS.finance}
            isActive={financePaths.includes(currentPath)}
            isOpen={activeGroup === 'finance'}
            onClick={() => toggleGroup('finance')}
          />
        )}
        {activeGroup === 'finance' && (
          <div class="ms-4 mt-0.5 space-y-0.5 border-s-2 border-base-300 ps-2">
            {hasFeature('stats')    && hasPerm('sales', 'earnings')      && <NavLink href="/sales-stats"  label={t('salesStatsPage')}  icon={ICONS.salesStats}  active={currentPath === '/sales-stats'}  onNavigate={closeMenu} />}
            {hasFeature('expenses') && hasPerm('expenses', 'view')       && <NavLink href="/expenses"     label={t('expensesPage')}    icon={ICONS.expenses}    active={currentPath === '/expenses'}     onNavigate={closeMenu} />}
            {hasFeature('retraits') && hasPerm('retraits', 'view')       && <NavLink href="/retraits"     label={t('retraitsPage')}    icon={ICONS.retraits}    active={currentPath === '/retraits'}     onNavigate={closeMenu} />}
            {hasFeature('user_summary') && hasPerm('sales', 'user_summary') && <NavLink href="/user-summary" label={t('userSummaryPage')} icon={ICONS.userSummary} active={currentPath === '/user-summary'} onNavigate={closeMenu} />}
            {hasFeature('stats') && isTenantAdmin() && <NavLink href="/declarations" label={t('declarationsPage')} icon={ICONS.declarations} active={currentPath === '/declarations'} onNavigate={closeMenu} />}
          </div>
        )}

        {/* People: clients, staff */}
        {(hasFeature('clients') || (isTenantAdmin() && hasFeature('access_management'))) && (
          <GroupButton
            label={t('people')}
            icon={ICONS.people}
            isActive={peoplePaths.includes(currentPath)}
            isOpen={activeGroup === 'people'}
            onClick={() => toggleGroup('people')}
          />
        )}
        {activeGroup === 'people' && (
          <div class="ms-4 mt-0.5 space-y-0.5 border-s-2 border-base-300 ps-2">
            {hasFeature('clients') && hasPerm('clients', 'view') && <NavLink href="/clients" label={t('clientsPage')} icon={ICONS.clients} active={currentPath === '/clients'} onNavigate={closeMenu} />}
            {isTenantAdmin() && hasFeature('access_management') && <NavLink href="/users" label={t('staff')} icon={ICONS.staff} active={currentPath === '/users'} onNavigate={closeMenu} />}
          </div>
        )}

        {/* System: settings, folders, chat */}
        {isTenantAdmin() && (
          <GroupButton
            label={t('system')}
            icon={ICONS.settings}
            isActive={systemPaths.includes(currentPath)}
            isOpen={activeGroup === 'system'}
            onClick={() => toggleGroup('system')}
          />
        )}
        {isTenantAdmin() && activeGroup === 'system' && (
          <div class="ms-4 mt-0.5 space-y-0.5 border-s-2 border-base-300 ps-2">
            <NavLink href="/settings" label={t('storeSettings')} icon={ICONS.settings} active={currentPath === '/settings'} onNavigate={closeMenu} />
            {hasFeature('multi_folders') && (isTenantAdmin() || hasPerm('folders', 'view')) && <NavLink href="/folders" label={t('folders')} icon={ICONS.folders} active={currentPath === '/folders'} onNavigate={closeMenu} />}
            <NavLink href="/chat" label={t('chat')} icon={ICONS.chat} active={currentPath === '/chat'} onNavigate={closeMenu} badge={chatUnread} />
          </div>
        )}
      </nav>

      {/* Shortcuts help button */}
      <div class="px-3 pb-1">
        <button
          onClick={() => shortcutsOpen.value = true}
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-base-content/50 hover:text-base-content hover:bg-base-200 transition-all duration-150"
          title="Keyboard shortcuts"
        >
          <span class="w-5 h-5 rounded border border-base-300 flex items-center justify-center text-xs font-bold shrink-0">?</span>
          <span class="text-xs">{t('keyboardShortcuts') || 'Shortcuts'}</span>
        </button>
      </div>

      {/* Footer */}
      <div class="p-3 border-t border-base-300 space-y-2">
        <LangSwitcher />
        <div class="flex items-center gap-2 px-1 py-0.5">
          <div class="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold shrink-0">
            {initial}
          </div>
          <p class="text-xs text-base-content/60 truncate flex-1">{email}</p>
        </div>
        <button
          onClick={logout}
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-error/80 hover:text-error-content hover:bg-error transition-all duration-150"
        >
          <Icon d={ICONS.logout} />
          {t('logout')}
        </button>
      </div>
    </>
  )

  return (
    <div class="min-h-screen flex flex-col md:flex-row bg-base-200">

      {/* Mobile top bar */}
      <header class="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-base-100 border-b border-base-300 flex items-center px-4 gap-3 shadow-sm">
        <button class="btn btn-sm btn-ghost btn-square" onClick={() => setOpen(true)} aria-label="open menu">
          <Icon d={ICONS.menu} className="w-5 h-5" />
        </button>
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
            <Icon d={ICONS.store} className="w-4 h-4 text-primary-content" />
          </div>
          <span class="font-bold text-primary text-sm">{t('storeAdmin')}</span>
        </div>
      </header>

      {/* Mobile backdrop */}
      {open && (
        <div
          class="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside class={`
        fixed inset-y-0 z-50 w-64 bg-base-100 flex flex-col shadow-xl
        border-e border-base-300
        ${rtl ? 'right-0' : 'left-0'}
        ${open ? 'translate-x-0' : (rtl ? 'translate-x-full' : '-translate-x-full')}
        md:static md:shadow-none md:w-60 md:translate-x-0
      `}>
        {sidebarContent}
      </aside>

      {/* Page content */}
      <main class="flex-1 p-4 md:p-6 overflow-auto mt-14 md:mt-0 min-w-0">
        {!batchAlertDismissed && expiredBatches.length > 0 && (
          <div class="alert alert-warning mb-4 shadow-sm cursor-pointer" onClick={() => document.getElementById('expiry-alert-dialog')?.showModal()}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div class="flex-1">
              <p class="font-semibold text-sm">{expiredBatches.length} {t('expiredBatchesAlert')}</p>
              <p class="text-xs opacity-70">{t('clickToView')}</p>
            </div>
            <button class="btn btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); setBatchAlertDismissed(true) }}>✕</button>
          </div>
        )}
        <div class="page-enter">{children}</div>
      </main>
      {/* Expiry alert dialog */}
      <dialog id="expiry-alert-dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box w-full sm:max-w-3xl">
          <h3 class="font-bold text-lg mb-1 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {t('expiredBatchesAlert')}
          </h3>
          <div class="overflow-x-auto mt-3" style="max-height:400px; overflow-y:auto">
            <table class="table table-sm">
              <thead class="sticky top-0 bg-base-100">
                <tr>
                  <th>{t('productName')}</th>
                  <th>{t('batchNumber')}</th>
                  <th>{t('expiryDate')}</th>
                  <th class="text-end">{t('qty')}</th>
                  <th class="text-end">{t('prixAchat')}</th>
                </tr>
              </thead>
              <tbody>
                {expiredBatches.map(b => (
                  <tr key={b.id}>
                    <td class="font-medium">{b.product_name}</td>
                    <td class="font-mono text-xs">{b.batch_number}</td>
                    <td class="text-sm">{b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '—'}</td>
                    <td class="text-end font-mono">{b.qty}</td>
                    <td class="text-end font-mono">{b.prix_achat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="modal-action">
            <a href="/expiring-batches" class="btn btn-sm btn-primary"
              onClick={() => document.getElementById('expiry-alert-dialog')?.close()}>
              {t('viewAll')}
            </a>
            <form method="dialog"><button class="btn btn-sm btn-ghost">{t('back')}</button></form>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>
    </div>
  )
}
