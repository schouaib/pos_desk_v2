export function Modal({ id, title, children }) {
  return (
    <dialog id={id} class="modal">
      <div class="modal-box w-full max-w-lg">
        <h3 class="font-bold text-lg mb-4">{title}</h3>
        {children}
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  )
}

export function openModal(id) {
  document.getElementById(id)?.showModal()
}

export function closeModal(id) {
  document.getElementById(id)?.close()
}
