// Native Tauri printer support — replaces WebUSB/Serial
// Same exported API so Pos.jsx and Sales.jsx need no changes

let _selectedPrinter = null
let _printerList = []

async function invoke(cmd, args) {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
  return tauriInvoke(cmd, args)
}

async function loadSavedPrinter() {
  try {
    const { LazyStore } = await import('@tauri-apps/plugin-store')
    const store = new LazyStore('printer.json')
    // Prefer receipt_printer (set in Settings), fall back to selected_printer
    const receipt = await store.get('receipt_printer')
    if (receipt) return receipt
    return await store.get('selected_printer')
  } catch { return null }
}

async function savePrinter(name) {
  try {
    const { LazyStore } = await import('@tauri-apps/plugin-store')
    const store = new LazyStore('printer.json')
    await store.set('selected_printer', name)
    await store.save()
  } catch {}
}

/** List available system printers */
export async function listPrinters() {
  const result = await invoke('list_printers')
  _printerList = result.printers
  return result
}

/** "Connect" = select a printer (auto-selects default or first available) */
export async function connectPrinter() {
  const { printers, default: defaultPrinter } = await listPrinters()
  if (printers.length === 0) throw new Error('No printers found')
  _selectedPrinter = defaultPrinter || printers[0]
  await savePrinter(_selectedPrinter)
  return { type: 'native', printer: _selectedPrinter }
}

/** Auto-reconnect: check if a previously-used printer is still available */
export async function tryAutoConnect() {
  if (_selectedPrinter) return { type: 'native', printer: _selectedPrinter }
  try {
    const saved = await loadSavedPrinter()
    const { printers, default: defaultPrinter } = await listPrinters()
    if (saved && printers.includes(saved)) {
      _selectedPrinter = saved
    } else if (printers.length > 0) {
      _selectedPrinter = defaultPrinter || printers[0]
    }
    if (_selectedPrinter) return { type: 'native', printer: _selectedPrinter }
  } catch {}
  return null
}

/** Returns the current connection or null */
export function getConnection() {
  return _selectedPrinter ? { type: 'native', printer: _selectedPrinter } : null
}

/** Send raw bytes to the selected printer, or a specific printer by name */
export async function printBytes(data, printerName) {
  const target = printerName || _selectedPrinter
  if (!target) throw new Error('Printer not connected')
  const bytes = data instanceof Uint8Array ? Array.from(data) : Array.from(new Uint8Array(data))
  await invoke('print_raw', { printer: target, data: bytes })
}

/** Clear the printer selection */
export async function disconnectPrinter() {
  _selectedPrinter = null
}

/** Get the list of available printer names (for UI picker) */
export function getPrinterList() {
  return _printerList
}

/** Manually select a specific printer by name */
export async function selectPrinter(name) {
  _selectedPrinter = name
  await savePrinter(name)
  return { type: 'native', printer: _selectedPrinter }
}
