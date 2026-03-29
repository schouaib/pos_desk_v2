import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { useI18n } from '../lib/i18n'

export const shortcutsOpen = signal(false)

function getSections(t) {
  return [
    {
      title: t('shortcutNav'),
      shortcuts: [
        { keys: ['Ctrl', 'D'], desc: t('scGoToDashboard') },
        { keys: ['Ctrl', 'P'], desc: t('scGoToPOS') },
        { keys: ['Ctrl', 'F'], desc: t('scFocusSearch') },
        { keys: ['Ctrl', 'N'], desc: t('scAddNew') },
        { keys: ['?'], desc: t('scShowHelp') },
        { keys: ['Esc'], desc: t('scCloseModal') },
      ],
    },
    {
      title: t('shortcutTables'),
      shortcuts: [
        { keys: ['↑', '↓'], desc: t('scNavRows') },
        { keys: ['Enter'], desc: t('scEditRow') },
        { keys: ['Delete'], desc: t('scDeleteRow') },
      ],
    },
    {
      title: t('shortcutPOS'),
      shortcuts: [
        { keys: ['F1'], desc: t('scHelp') },
        { keys: ['F2'], desc: t('scSearchProducts') },
        { keys: ['F3'], desc: t('scClearTicket') },
        { keys: ['F4'], desc: t('scEditPrice') },
        { keys: ['F5'], desc: t('scFocusScanner') },
        { keys: ['F6'], desc: t('scSelectClient') },
        { keys: ['F7'], desc: t('scParkTicket') },
        { keys: ['F8'], desc: t('scParkedTickets') },
        { keys: ['F10'], desc: t('scCheckout') },
        { keys: ['+', '-'], desc: t('scQtyPlusMinus') },
      ],
    },
  ]
}

export function ShortcutsOverlay() {
  const { t } = useI18n()
  const open = shortcutsOpen.value

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault()
        shortcutsOpen.value = false
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const sections = getSections(t)

  return (
    <div
      class="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) shortcutsOpen.value = false }}
    >
      <div class="bg-base-100 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" style="animation: modal-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-bold">{t('keyboardShortcuts')}</h2>
          <button class="btn btn-ghost btn-sm btn-square" onClick={() => shortcutsOpen.value = false}>
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sections.map(section => (
            <div key={section.title}>
              <h3 class="text-xs font-semibold uppercase tracking-widest text-base-content/70 mb-2">{section.title}</h3>
              <div class="space-y-1.5">
                {section.shortcuts.map(s => (
                  <div key={s.desc} class="flex items-center justify-between py-1">
                    <span class="text-sm text-base-content/80">{s.desc}</span>
                    <div class="flex gap-1">
                      {s.keys.map(k => (
                        <kbd key={k} class="kbd-hint">{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div class="mt-5 pt-4 border-t border-base-200 text-center">
          <p class="text-xs text-base-content/70">
            Press <kbd class="kbd-hint">?</kbd> or <kbd class="kbd-hint">Esc</kbd> to {t('close').toLowerCase()}
          </p>
        </div>
      </div>
    </div>
  )
}
