import { useEffect } from 'preact/hooks'

/**
 * Lightweight hotkey system.
 * Usage:
 *   useHotkeys({ 'ctrl+p': () => route('/pos'), 'F2': openSearch })
 *
 * Modifier support: ctrl, alt, shift, meta
 * Automatically skips when user is typing in input/select/textarea.
 */
export function useHotkeys(keyMap, deps = []) {
  useEffect(() => {
    function handler(e) {
      // Skip if typing in form fields (unless key is Escape or F-key)
      const tag = document.activeElement?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      const isFKey = e.key.startsWith('F') && e.key.length > 1
      if (isInput && !isFKey && e.key !== 'Escape') return

      // Build key string: "ctrl+shift+p"
      const parts = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.altKey) parts.push('alt')
      if (e.shiftKey) parts.push('shift')
      parts.push(e.key.toLowerCase())
      const combo = parts.join('+')

      // Also match without modifiers for single keys
      const plain = e.key

      // Try combo first, then plain key
      const fn = keyMap[combo] || keyMap[plain]
      if (fn) {
        e.preventDefault()
        e.stopPropagation()
        fn(e)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, deps)
}
