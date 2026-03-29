import { useState, useEffect, useRef } from 'preact/hooks'
import qrcode from 'qrcode-generator'
import { invoke } from '@tauri-apps/api/core'
import { api } from '../lib/api'
import { getServerUrl } from '../lib/config'
import { useI18n } from '../lib/i18n'

function generateQRDataUrl(text) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createDataURL(6, 4)
}

// Convert base64 string to File object
function base64ToFile(base64, filename) {
  const byteStr = atob(base64)
  const arr = new Uint8Array(byteStr.length)
  for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)
  return new File([arr], filename, { type: 'image/jpeg' })
}

export default function RemoteScanner({ onScan, onPhoto, onClose }) {
  const { t } = useI18n()
  const [status, setStatus] = useState('loading')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [scanUrl, setScanUrl] = useState('')
  const [httpUrl, setHttpUrl] = useState('')
  const [lastBarcode, setLastBarcode] = useState('')
  const [scanCount, setScanCount] = useState(0)
  const tokenRef = useRef(null)
  const wsRef = useRef(null)
  const [minimized, setMinimized] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const data = await api.createScanSession()
        if (cancelled) return
        tokenRef.current = data.token

        const serverUrl = getServerUrl()
        const port = serverUrl.match(/:(\d+)/)?.[1] || '3000'
        let lanIp = 'localhost'
        try { lanIp = await invoke('get_lan_ip') } catch {}
        const phoneUrlHttp = `http://${lanIp}:${port}/scan/${data.token}`
        const phoneUrlHttps = `https://${lanIp}:3443/scan/${data.token}`
        setScanUrl(phoneUrlHttp)
        setQrDataUrl(generateQRDataUrl(phoneUrlHttp))
        setHttpUrl(phoneUrlHttps)

        const wsProto = serverUrl.startsWith('https') ? 'wss:' : 'ws:'
        const host = serverUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
        const wsUrl = wsProto + '//' + host + '/api/scan/ws/desktop?token=' + data.token
        const authToken = sessionStorage.getItem('tenant_token')
        connectWS(wsUrl + '&auth=' + encodeURIComponent(authToken))
        setStatus('waiting')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    function connectWS(url) {
      if (cancelled) return
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'phone_connected') {
            setStatus('connected')
            setMinimized(true)
          }
          if (msg.type === 'phone_disconnected') {
            setStatus('waiting')
            setMinimized(false)
          }
          if (msg.type === 'scan' && msg.barcode) {
            setLastBarcode(msg.barcode)
            setScanCount(c => c + 1)
            onScan(msg.barcode)
          }
          if (msg.type === 'photo' && msg.data) {
            // Convert base64 to File and pass to parent
            const file = base64ToFile(msg.data, msg.filename || 'invoice.jpg')
            if (onPhoto) onPhoto(file)
            // Ack back to phone
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'photo_received' }))
            }
          }
        } catch {}
      }

      ws.onclose = () => {
        if (!cancelled) setTimeout(() => connectWS(url), 2000)
      }
    }

    init()

    return () => {
      cancelled = true
      if (wsRef.current) wsRef.current.close()
      if (tokenRef.current) api.deleteScanSession(tokenRef.current).catch(() => {})
    }
  }, [])

  if (minimized) {
    return (
      <div style="position:fixed;bottom:16px;right:16px;z-index:1000;cursor:pointer" onClick={() => setMinimized(false)}>
        <div class="flex items-center gap-2 bg-base-300 rounded-full px-4 py-2 shadow-lg border border-base-content/10">
          <span class="w-2.5 h-2.5 rounded-full bg-success" />
          <span class="text-sm font-medium">{t('phoneConnected')}</span>
          {scanCount > 0 && <span class="badge badge-sm badge-primary">{scanCount}</span>}
          <button class="btn btn-xs btn-circle btn-ghost ml-1" onClick={(e) => { e.stopPropagation(); onClose() }}>✕</button>
        </div>
      </div>
    )
  }

  return (
    <div class="modal modal-open" style="z-index:1000">
      <div class="modal-box max-w-sm text-center">
        <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>✕</button>
        <h3 class="font-bold text-lg mb-1">{t('remoteScan')}</h3>
        <p class="text-sm text-base-content/70 mb-4">{t('scanQRWithPhone')}</p>

        {status === 'loading' && (
          <div class="flex justify-center py-8"><span class="loading loading-spinner loading-md" /></div>
        )}

        {status === 'error' && (
          <div class="alert alert-error text-sm py-2">{t('remoteScanError')}</div>
        )}

        {(status === 'waiting' || status === 'connected') && (
          <>
            {qrDataUrl && <img src={qrDataUrl} alt="QR" class="mx-auto rounded-lg border border-base-300" style="width:220px;height:220px" />}
            <div class="mt-3 flex items-center justify-center gap-2">
              <span class={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'bg-success' : 'bg-warning animate-pulse'}`} />
              <span class="text-sm">{status === 'connected' ? t('phoneConnected') : t('waitingForPhone')}</span>
            </div>
            {lastBarcode && (
              <div class="mt-2 text-xs text-base-content/60">
                {t('lastScan')}: <span class="font-mono font-semibold">{lastBarcode}</span>
              </div>
            )}
            <p class="text-xs text-base-content/50 mt-3">{scanUrl}</p>
            {httpUrl && (
              <button class="btn btn-xs btn-ghost mt-1 text-base-content/40" onClick={() => { const tmp = scanUrl; setScanUrl(httpUrl); setQrDataUrl(generateQRDataUrl(httpUrl)); setHttpUrl(tmp) }}>
                {scanUrl.startsWith('http:') ? 'HTTPS (camera)' : 'HTTP (keyboard)'}
              </button>
            )}
          </>
        )}
      </div>
      <div class="modal-backdrop" onClick={onClose} />
    </div>
  )
}
