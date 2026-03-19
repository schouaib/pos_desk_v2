// Known thermal printer vendor IDs (Xprinter, Epson, Star, generic Chinese printers)
const USB_FILTERS = [
  { vendorId: 0x0FE6 },
  { vendorId: 0x6868 },
  { vendorId: 0x1504 },
  { vendorId: 0x04B8 },
  { vendorId: 0x0519 },
  { vendorId: 0x28E9 },
  { vendorId: 0x0483 },
  { vendorId: 0x1A86 },
]

// Module-level connected device (survives modal open/close)
// Shape: { type: 'usb', device, epNum, ifaceNum } | { type: 'serial', port, writer }
let _conn = null

// ─── WebUSB helpers ────────────────────────────────────────────────────────────

function findBulkOut(device) {
  for (const iface of device.configuration?.interfaces ?? []) {
    for (const alt of iface.alternates) {
      const ep = alt.endpoints.find(e => e.direction === 'out' && e.type === 'bulk')
      if (ep) return { ep, ifaceNum: iface.interfaceNumber }
    }
  }
  return null
}

async function openUsbDevice(device) {
  await device.open()
  if (device.configuration === null) await device.selectConfiguration(1)
  const found = findBulkOut(device)
  if (!found) throw new Error('No bulk-OUT endpoint found')
  await device.claimInterface(found.ifaceNum)
  return { type: 'usb', device, epNum: found.ep.endpointNumber, ifaceNum: found.ifaceNum }
}

// ─── Web Serial helpers ────────────────────────────────────────────────────────

async function openSerialPort(port) {
  await port.open({ baudRate: 9600 })
  const writer = port.writable.getWriter()
  return { type: 'serial', port, writer }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Prompt the user to select a printer via the specified mode ('usb' or 'serial'). */
export async function connectPrinter(mode = 'usb') {
  if (mode === 'usb') {
    if (!navigator.usb) throw new Error('WebUSB not supported. Use Chrome or Edge.')
    const device = await navigator.usb.requestDevice({ filters: USB_FILTERS })
    _conn = await openUsbDevice(device)
    return _conn
  }

  if (mode === 'serial') {
    if (!navigator.serial) throw new Error('Web Serial not supported. Use Chrome or Edge.')
    const port = await navigator.serial.requestPort()
    _conn = await openSerialPort(port)
    return _conn
  }

  throw new Error('Unknown connection mode: ' + mode)
}

/** Try to silently reconnect to a previously-authorised printer (no prompt). */
export async function tryAutoConnect() {
  if (_conn) return _conn

  // Try WebUSB auto-reconnect
  if (navigator.usb) {
    const devices = await navigator.usb.getDevices()
    for (const device of devices) {
      try {
        _conn = await openUsbDevice(device)
        return _conn
      } catch {
        // try next
      }
    }
  }

  // Try Web Serial auto-reconnect
  if (navigator.serial) {
    const ports = await navigator.serial.getPorts()
    for (const port of ports) {
      try {
        _conn = await openSerialPort(port)
        return _conn
      } catch {
        // try next
      }
    }
  }

  return null
}

/** Returns the current connection or null. */
export function getConnection() {
  return _conn
}

/** Send raw bytes to the printer. Throws if not connected. */
export async function printBytes(data) {
  if (!_conn) throw new Error('Printer not connected')

  if (_conn.type === 'usb') {
    const result = await _conn.device.transferOut(_conn.epNum, data)
    if (result.status !== 'ok') throw new Error(`USB transfer failed: ${result.status}`)
  } else {
    await _conn.writer.write(data instanceof Uint8Array ? data : new Uint8Array(data))
  }
}

/** Cleanly release the interface and close the device. */
export async function disconnectPrinter() {
  if (!_conn) return
  try {
    if (_conn.type === 'usb') {
      await _conn.device.releaseInterface(_conn.ifaceNum)
      await _conn.device.close()
    } else {
      _conn.writer.releaseLock()
      await _conn.port.close()
    }
  } catch {}
  _conn = null
}
