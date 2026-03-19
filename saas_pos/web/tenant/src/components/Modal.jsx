export function Modal({ id, title, children, size }) {
  const boxClass = size === 'xl' ? 'modal-box w-full sm:max-w-4xl'
    : size === 'lg' ? 'modal-box w-full sm:max-w-2xl'
    : 'modal-box w-full sm:max-w-lg'
  return (
    <dialog id={id} class="modal modal-bottom sm:modal-middle">
      <div class={boxClass}>
        <div class="flex items-start justify-between mb-4 gap-2">
          <h3 class="font-bold text-lg leading-tight">{title}</h3>
          <form method="dialog">
            <button class="btn btn-sm btn-ghost btn-square -mt-0.5 -me-1 opacity-60 hover:opacity-100">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </form>
        </div>
        {children}
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  )
}

export const openModal = (id) => document.getElementById(id)?.showModal()
export const closeModal = (id) => document.getElementById(id)?.close()
