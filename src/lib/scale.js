import { signal } from '@preact/signals'
import { api } from './api'

// Reactive signals for scale state
export const scaleStatus = signal({ connected: false, ip: '', name: '' })
export const scaleWeight = signal(0)
export const scaleError = signal('')

let weightPollTimer = null

// Load saved scale settings on startup
export async function loadScaleSettings() {
  try {
    const data = await api.getScaleSettings()
    scaleStatus.value = { ...scaleStatus.value, ip: data.ip || '', name: data.name || '' }
  } catch {
    // No settings saved yet
  }
}

// Connect to scale
export async function connectScale(ip, name) {
  try {
    scaleError.value = ''
    const status = await api.scaleConnect({ ip, name })
    scaleStatus.value = { connected: true, ip: status.ip, name: status.name, conn_id: status.conn_id }
    startWeightPolling()
    return status
  } catch (err) {
    scaleError.value = err.message
    throw err
  }
}

// Disconnect from scale
export async function disconnectScale() {
  try {
    stopWeightPolling()
    await api.scaleDisconnect()
    scaleStatus.value = { ...scaleStatus.value, connected: false, conn_id: 0 }
    scaleWeight.value = 0
  } catch (err) {
    scaleError.value = err.message
    throw err
  }
}

// Read weight once
export async function readWeight() {
  try {
    const data = await api.scaleGetWeight()
    scaleWeight.value = data.weight
    scaleError.value = ''
    return data.weight
  } catch (err) {
    scaleError.value = err.message
    return 0
  }
}

// Weight polling removed — weight is read from barcode label scan instead
export function startWeightPolling() {}
export function stopWeightPolling() {}

// Sync PLU data to scale
export async function syncPLU() {
  try {
    scaleError.value = ''
    return await api.scaleSyncPLU()
  } catch (err) {
    scaleError.value = err.message
    throw err
  }
}

// Clear all PLU from scale
export async function clearPLU() {
  try {
    scaleError.value = ''
    await api.scaleClearPLU()
  } catch (err) {
    scaleError.value = err.message
    throw err
  }
}

// Save scale settings without connecting
export async function saveScaleSettings(ip, name) {
  try {
    await api.saveScaleSettings({ ip, name })
    scaleStatus.value = { ...scaleStatus.value, ip, name }
  } catch (err) {
    scaleError.value = err.message
    throw err
  }
}

// Refresh status from server
export async function refreshScaleStatus() {
  try {
    const status = await api.scaleGetStatus()
    scaleStatus.value = status
    if (status.connected && !weightPollTimer) {
      startWeightPolling()
    }
    if (!status.connected) {
      stopWeightPolling()
      scaleWeight.value = 0
    }
  } catch {
    // ignore
  }
}
