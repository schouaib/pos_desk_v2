import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'

const toasts = signal([])

let _id = 0

const MAX_TOASTS = 5

export function toast(message, type = 'success', duration = 3000) {
  const id = ++_id
  let items = [...toasts.value, { id, message, type, exiting: false }]
  if (items.length > MAX_TOASTS) items = items.slice(-MAX_TOASTS)
  toasts.value = items
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration)
  }
  return id
}

export function dismissToast(id) {
  toasts.value = toasts.value.map(t =>
    t.id === id ? { ...t, exiting: true } : t
  )
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 200)
}

toast.success = (msg, dur) => toast(msg, 'success', dur)
toast.error = (msg, dur) => toast(msg, 'error', dur ?? 5000)
toast.warning = (msg, dur) => toast(msg, 'warning', dur)
toast.info = (msg, dur) => toast(msg, 'info', dur)

const ICONS = {
  success: (
    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  info: (
    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
}

const COLORS = {
  success: 'bg-success text-success-content',
  error: 'bg-error text-error-content',
  warning: 'bg-warning text-warning-content',
  info: 'bg-info text-info-content',
}

export function ToastContainer() {
  const items = toasts.value
  if (items.length === 0) return null

  return (
    <div class="toast-container">
      {items.map(t => (
        <div
          key={t.id}
          class={`toast-item alert ${COLORS[t.type]} shadow-lg py-2 px-4 flex items-center gap-2 text-sm ${t.exiting ? 'toast-exit' : ''}`}
          onClick={() => dismissToast(t.id)}
          role="alert"
        >
          {ICONS[t.type]}
          <span class="flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
