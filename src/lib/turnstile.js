import { useRef, useEffect, useCallback } from 'preact/hooks'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

export function useTurnstile() {
  const containerRef = useRef(null)
  const widgetId = useRef(null)
  const tokenRef = useRef('')

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return

    function render() {
      if (widgetId.current != null) return
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        size: 'invisible',
        callback: (token) => { tokenRef.current = token },
        'expired-callback': () => { tokenRef.current = '' },
      })
    }

    let interval
    if (window.turnstile) {
      render()
    } else {
      // wait for script to load
      interval = setInterval(() => {
        if (window.turnstile) { clearInterval(interval); interval = null; render() }
      }, 100)
    }

    return () => {
      if (interval) clearInterval(interval)
      if (widgetId.current != null) {
        try { window.turnstile.remove(widgetId.current) } catch {}
        widgetId.current = null
      }
    }
  }, [])

  const getToken = useCallback(async () => {
    if (!SITE_KEY) return '' // no key → dev mode
    if (tokenRef.current) return tokenRef.current
    // force a new challenge
    if (widgetId.current != null && window.turnstile) {
      window.turnstile.reset(widgetId.current)
      window.turnstile.execute(widgetId.current) // invisible widgets need explicit execute after reset
      // wait up to 10s for token
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 100))
        if (tokenRef.current) return tokenRef.current
      }
    }
    return ''
  }, [])

  return { containerRef, getToken }
}
