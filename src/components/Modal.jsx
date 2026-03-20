import { useEffect, useRef } from 'preact/hooks'

export function Modal({ id, title, children, size }) {
  const boxClass = size === 'xl' ? 'modal-box w-full sm:max-w-4xl'
    : size === 'lg' ? 'modal-box w-full sm:max-w-2xl'
    : 'modal-box w-full sm:max-w-lg'

  const boxRef = useRef()

  // Auto-focus first input when modal opens
  useEffect(() => {
    const dialog = document.getElementById(id)
    if (!dialog) return
    function onOpen() {
      requestAnimationFrame(() => {
        const first = boxRef.current?.querySelector('input:not([type=hidden]), select, textarea')
        first?.focus()
      })
    }
    // MutationObserver to detect open attribute change
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.attributeName === 'open' && dialog.hasAttribute('open')) {
          onOpen()
        }
      }
    })
    obs.observe(dialog, { attributes: true })
    return () => obs.disconnect()
  }, [id])

  return (
    <dialog id={id} class="modal modal-bottom sm:modal-middle" role="dialog" aria-labelledby={`${id}-title`}>
      <div class={boxClass} ref={boxRef}>
        <div class="flex items-start justify-between mb-4 gap-2">
          <h3 id={`${id}-title`} class="font-bold text-lg leading-tight">{title}</h3>
          <form method="dialog">
            <button class="btn btn-sm btn-ghost btn-square -mt-0.5 -me-1 opacity-60 hover:opacity-100" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </form>
        </div>
        {children}
      </div>
      <form method="dialog" class="modal-backdrop">
        <button aria-label="Close dialog">close</button>
      </form>
    </dialog>
  )
}

export const openModal = (id) => document.getElementById(id)?.showModal()
export const closeModal = (id) => document.getElementById(id)?.close()
