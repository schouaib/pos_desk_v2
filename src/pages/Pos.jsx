import { useState, useEffect, useRef } from 'preact/hooks'
import { route } from 'preact-router'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { authUser, hasFeature, hasPerm, isTenantAdmin } from '../lib/auth'
import { buildReceipt } from '../lib/escpos'
import { printBL } from '../lib/blPrint'
import { printInvoice } from '../lib/invoicePrint'
import {
  connectPrinter, disconnectPrinter, printBytes,
  getConnection, tryAutoConnect,
} from '../lib/webusbPrint'

// ─── helpers ──────────────────────────────────────────────────────────────────

function lineHT(line) {
  return line.qty * line.unitPrice - line.discount
}
function lineTTC(line) {
  return lineHT(line) * (1 + line.vat / 100)
}
function round2(v) {
  return Math.round(v * 100) / 100
}

// ─── HelpModal ────────────────────────────────────────────────────────────────

function HelpModal({ onClose, t }) {
  const shortcuts = [
    { key: 'F1',     desc: t('shortcutHelp') },
    { key: 'F2',     desc: t('shortcutSearch') },
    { key: 'F3',     desc: t('shortcutClearTicket') },
    { key: 'F4',     desc: t('shortcutPriceEditor') },
    { key: 'F5',     desc: t('shortcutFocus') },
    { key: 'F6',     desc: t('shortcutClient') },
    { key: 'F7',     desc: t('shortcutHold') },
    { key: 'F8',     desc: t('shortcutParked') },
    { key: 'F9',     desc: t('shortcutDiscount') },
    { key: 'F10',    desc: t('shortcutCheckout') },
    { key: '↑ / ↓', desc: t('shortcutNavigate') },
    { key: '+',      desc: t('shortcutQtyInc') },
    { key: '−',      desc: t('shortcutQtyDec') },
    { key: 'Del',    desc: t('shortcutDeleteLine') },
    { key: '3*code', desc: t('shortcutQtyPrefix') },
    { key: 'Esc',    desc: t('close') },
  ]

  return (
    <dialog class="modal modal-bottom sm:modal-middle" open>
      <div class="modal-box max-w-sm">
        <h3 class="font-bold text-base mb-4">{t('keyboardShortcuts')}</h3>
        <table class="table table-sm">
          <tbody>
            {shortcuts.map(({ key, desc }) => (
              <tr key={key}>
                <td class="w-24">
                  <kbd class="kbd kbd-sm">{key}</kbd>
                </td>
                <td class="text-sm text-base-content/70">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="modal-action">
          <button class="btn btn-sm btn-ghost" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
      <div class="modal-backdrop" onClick={onClose} />
    </dialog>
  )
}

// ─── PriceEditor modal ────────────────────────────────────────────────────────

function PriceEditor({ line, onApply, onClose, t }) {
  const [price, setPrice] = useState(line.unitPrice)
  const [discount, setDiscount] = useState(line.discount)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const minPrice = line.pvMin || 0
  const effectiveUnitPrice = discount > 0
    ? round2((line.qty * price - discount) / line.qty)
    : price
  const belowMin = minPrice > 0 && effectiveUnitPrice < minPrice

  function quickSet(pv) {
    setPrice(pv)
    setDiscount(0)
  }

  function handleApply() {
    if (belowMin) return
    onApply(round2(price), round2(discount))
  }

  return (
    <dialog class="modal modal-bottom sm:modal-middle" open>
      <div class="modal-box">
        <h3 class="font-bold text-base mb-1">{t('editPrice')}</h3>
        <p class="text-sm text-base-content/60 mb-4">{line.name}</p>

        {/* Quick PV buttons */}
        <div class="flex gap-2 mb-3 flex-wrap">
          {line.pv1 > 0 && (
            <button class={`btn btn-sm ${price === line.pv1 ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => quickSet(line.pv1)}>
              {t('pv1')} — {line.pv1.toFixed(2)}
            </button>
          )}
          {line.pv2 > 0 && (
            <button class={`btn btn-sm ${price === line.pv2 ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => quickSet(line.pv2)}>
              {t('pv2')} — {line.pv2.toFixed(2)}
            </button>
          )}
          {line.pv3 > 0 && (
            <button class={`btn btn-sm ${price === line.pv3 ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => quickSet(line.pv3)}>
              {t('pv3')} — {line.pv3.toFixed(2)}
            </button>
          )}
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <label class="form-control">
            <span class="label-text text-xs">{t('customPrice')} (HT)</span>
            <input
              ref={inputRef}
              type="number" step="any" min="0"
              class="input input-bordered input-sm"
              value={price}
              onInput={(e) => setPrice(parseFloat(e.target.value) || 0)}
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs">{t('discount')} (HT)</span>
            <input
              type="number" step="any" min="0"
              class="input input-bordered input-sm"
              value={discount}
              onInput={(e) => setDiscount(parseFloat(e.target.value) || 0)}
            />
          </label>
        </div>

        {minPrice > 0 && (
          <p class={`text-xs mb-3 ${belowMin ? 'text-error font-medium' : 'text-base-content/50'}`}>
            {t('pvMin')}: {minPrice.toFixed(2)}
            {belowMin && ` — ${t('priceBelow')}`}
          </p>
        )}

        <div class="modal-action">
          <button class="btn btn-sm btn-ghost" onClick={onClose}>{t('back')}</button>
          <button class="btn btn-sm btn-primary" onClick={handleApply} disabled={belowMin}>
            {t('applyPrice')}
          </button>
        </div>
      </div>
      <div class="modal-backdrop" onClick={onClose} />
    </dialog>
  )
}

// ─── PaymentModal ─────────────────────────────────────────────────────────────

function PaymentModal({ total, onConfirm, onClose, loading, error, t }) {
  const [amount, setAmount] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    setAmount('')
  }, [])

  const paid = parseFloat(amount) || 0
  const change = round2(paid - total)
  const insufficient = paid < total - 0.001

  function handleKey(e) {
    if (e.key === 'Enter' && !insufficient) onConfirm(paid)
  }

  // Quick denomination buttons
  const denominations = [100, 200, 500, 1000, 2000, 5000]

  return (
    <dialog class="modal modal-bottom sm:modal-middle" open>
      <div class="modal-box max-w-sm">
        <h3 class="font-bold text-lg mb-4">{t('payment')}</h3>

        <div class="flex items-center justify-between mb-4 p-3 bg-base-200 rounded-lg">
          <span class="text-sm font-medium">{t('totalTTC')}</span>
          <span class={`text-xl font-bold font-mono ${total < 0 ? 'text-error' : 'text-primary'}`}>{total.toFixed(2)}</span>
        </div>

        <label class="form-control mb-2">
          <span class="label-text text-sm">{t('amountPaid')}</span>
          <input
            ref={inputRef}
            type="number" step="any"
            class="input input-bordered input-lg text-center font-mono text-lg"
            placeholder={total.toFixed(2)}
            value={amount}
            onInput={(e) => setAmount(e.target.value)}
            onKeyDown={handleKey}
          />
        </label>

        {/* Quick-pay buttons */}
        <div class="flex flex-wrap gap-1.5 mb-3">
          <button
            class={`btn btn-sm flex-1 min-w-[4.5rem] ${paid === total ? 'btn-primary' : 'btn-outline btn-primary'}`}
            onClick={() => setAmount(total.toFixed(2))}
          >
            {t('exactAmount')}
          </button>
          {denominations.filter(d => d >= total).slice(0, 4).map(d => (
            <button
              key={d}
              class={`btn btn-sm flex-1 min-w-[3.5rem] ${paid === d ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setAmount(String(d))}
            >
              {d}
            </button>
          ))}
        </div>

        {paid !== 0 && (
          <div class={`flex items-center justify-between p-3 rounded-lg mb-3 ${
            change >= 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
          }`}>
            <span class="text-sm font-medium">{t('changeDue')}</span>
            <span class="text-lg font-bold font-mono">{change.toFixed(2)}</span>
          </div>
        )}

        {insufficient && paid !== 0 && (
          <p class="text-error text-sm mb-3">{t('amountInsufficient')}</p>
        )}
        {error && <p class="text-error text-sm mb-3">{error}</p>}

        <div class="modal-action">
          <button class="btn btn-ghost btn-sm" onClick={onClose}>{t('back')}</button>
          <button
            class={`btn btn-success btn-sm flex-1 ${loading ? 'loading' : ''}`}
            onClick={() => onConfirm(paid)}
            disabled={loading || insufficient || paid === 0}
          >
            {t('checkout')}
          </button>
        </div>
      </div>
      <div class="modal-backdrop" onClick={onClose} />
    </dialog>
  )
}

// ─── SaleSuccessModal ─────────────────────────────────────────────────────────

function SaleSuccessModal({ sale, store, onClose, t, client, lang }) {
  const [printing, setPrinting] = useState(false)
  const [printErr, setPrintErr] = useState('')
  const timerRef = useRef(null)

  const hasPrinter = !!getConnection()

  // Auto-print receipt if printer is connected
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const autoPrinted = useRef(false)
  useEffect(() => {
    if (hasPrinter && !autoPrinted.current) {
      autoPrinted.current = true
      handlePrint()
    }
    if (!hasPrinter) {
      timerRef.current = setTimeout(() => onCloseRef.current(), 15000)
    }
    return () => clearTimeout(timerRef.current)
  }, [hasPrinter])

  async function handlePrint() {
    setPrinting(true)
    setPrintErr('')
    clearTimeout(timerRef.current) // don't auto-close while printing
    try {
      const bytes = buildReceipt({
        store,
        sale,
        labels: {
          date:       t('receiptDate'),
          cashier:    t('receiptCashier'),
          subtotalHT: t('receiptSubtotalHT'),
          vat:        t('receiptVAT'),
          totalTTC:   t('receiptTotalTTC'),
          paid:       t('receiptPaid'),
          change:     t('receiptChange'),
          discount:   t('receiptDiscount'),
          thanks:     t('receiptThanks'),
        },
      })
      await printBytes(bytes)
      onClose()
    } catch (err) {
      setPrintErr(err.message || t('printError'))
      timerRef.current = setTimeout(onClose, 15000) // restart auto-close
    } finally {
      setPrinting(false)
    }
  }

  return (
    <dialog class="modal modal-bottom sm:modal-middle" open>
      <div class="modal-box max-w-sm text-center">
        {/* Success icon */}
        <div class="flex justify-center mb-3">
          <div class="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-9 h-9 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
        </div>

        <h3 class="font-bold text-lg mb-1">{t('saleSuccess')}</h3>
        <p class="text-2xl font-bold font-mono text-primary mb-4">
          {Number(sale?.total ?? 0).toFixed(2)}
        </p>

        {printErr && <p class="text-error text-sm mb-3">{printErr}</p>}

        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-ghost btn-sm flex-1" onClick={onClose}>{t('close')}</button>
          {/* ESC/POS Receipt — direct print, no dialog */}
          <button
            class={`btn btn-primary btn-sm flex-1 gap-1.5 ${printing ? 'loading' : ''}`}
            onClick={handlePrint}
            disabled={printing || !hasPrinter}
            title={!hasPrinter ? t('connectPrinter') : ''}
          >
            {!printing && (
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
            )}
            {printing ? t('printing') : t('printReceipt')}
          </button>
          {/* BL — browser print, always available */}
          <button
            class="btn btn-outline btn-sm flex-1 gap-1.5"
            onClick={() => printBL({
              store,
              sale,
              client,
              lang,
              labels: {
                title:           t('blTitle'),
                colDesignation:  t('blColDesignation'),
                colQty:          t('blColQty'),
                colUnitHT:       t('blColUnitHT'),
                colDiscount:     t('blColDiscount'),
                colTotalHT:      t('blColTotalHT'),
                colVAT:          t('blColVAT'),
                colTotalTTC:     t('blColTotalTTC'),
                subtotalHT:      t('receiptSubtotalHT'),
                vat:             t('receiptVAT'),
                totalTTC:        t('receiptTotalTTC'),
                paid:            t('receiptPaid'),
                change:          t('receiptChange'),
                cashier:         t('receiptCashier'),
                date:            t('receiptDate'),
                signatureSeller: t('blSignatureSeller'),
                signatureClient: t('blSignatureClient'),
                datePlace:       t('blDatePlace'),
                itemsCount:      t('blItemsCount'),
                paymentMethod:   t('blPaymentMethod'),
              },
            })}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            {t('printBL')}
          </button>
          {/* Invoice — browser print */}
          <button
            class="btn btn-outline btn-sm flex-1 gap-1.5"
            onClick={() => printInvoice({
              store,
              sale,
              client,
              lang,
              labels: {
                title:           t('invoiceTitle'),
                invoiceNum:      t('invoiceNum'),
                from:            t('invoiceFrom'),
                billedTo:        t('invoiceBilledTo'),
                colDesignation:  t('blColDesignation'),
                colQty:          t('blColQty'),
                colUnitHT:       t('blColUnitHT'),
                colDiscount:     t('blColDiscount'),
                colTotalHT:      t('blColTotalHT'),
                colVAT:          t('blColVAT'),
                colTotalTTC:     t('blColTotalTTC'),
                subtotalHT:      t('receiptSubtotalHT'),
                vat:             t('receiptVAT'),
                totalTTC:        t('receiptTotalTTC'),
                paid:            t('receiptPaid'),
                change:          t('receiptChange'),
                cashier:         t('receiptCashier'),
                date:            t('receiptDate'),
                amountDue:       t('invoiceAmountDue'),
                amountWords:     t('invoiceAmountWords'),
                stampSignature:  t('invoiceStampSignature'),
                thankYou:        t('invoiceThankYou'),
                itemsCount:      t('blItemsCount'),
                paymentMethod:   t('blPaymentMethod'),
                page:            t('invoicePage'),
              },
            })}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            {t('printInvoice')}
          </button>
        </div>
      </div>
      <div class="modal-backdrop" onClick={onClose} />
    </dialog>
  )
}

// ─── Main POS page ────────────────────────────────────────────────────────────

export default function Pos({ path }) {
  const { t, lang } = useI18n()

  // Caisse (cash register session)
  const [caisseSession, setCaisseSession] = useState(undefined) // undefined=loading, null=no session, object=open
  const [caisseOpenAmount, setCaisseOpenAmount] = useState('')
  const [caisseOpenNotes, setCaisseOpenNotes] = useState('')
  const [caisseOpenLoading, setCaisseOpenLoading] = useState(false)
  const [caisseCloseOpen, setCaisseCloseOpen] = useState(false)
  const [caisseCloseAmount, setCaisseCloseAmount] = useState('')
  const [caisseCloseNotes, setCaisseCloseNotes] = useState('')
  const [caisseCloseLoading, setCaisseCloseLoading] = useState(false)
  const [caisseStats, setCaisseStats] = useState(null) // { sales, returns, retraits }

  // Ticket
  const [lines, setLines] = useState([])

  // Selected line (keyboard navigation)
  const [selectedKey, setSelectedKey] = useState(null)

  // Barcode scan
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const scanRef = useRef(null)
  const refocusTimerRef = useRef(null)
  function refocusScan() {
    clearTimeout(refocusTimerRef.current)
    refocusTimerRef.current = setTimeout(() => scanRef.current?.focus(), 80)
  }
  const focusTimerRef = useRef(null)

  // Product search dialog
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchRef = useRef(null)
  const lastPosSearchRef = useRef('')

  // Price editor
  const [editingLine, setEditingLine] = useState(null)

  // Payment
  const [payOpen, setPayOpen] = useState(false)
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState('')

  // Client selector (requires 'clients' feature)
  const canSelectClient = hasFeature('clients')
  const canCreditSale   = hasFeature('client_payments')
  const [selectedClient, setSelectedClient]     = useState(null)  // { id, name, code }
  const [saleType, setSaleType]                 = useState('cash')
  const [clientSearch, setClientSearch]         = useState('')
  const [clientResults, setClientResults]       = useState([])
  const [clientSearchOpen, setClientSearchOpen] = useState(false)
  const [clientSearchLoading, setClientSearchLoading] = useState(false)
  const clientSearchRef = useRef(null)
  const lastClientRef = useRef(null)

  // Help overlay
  const [helpOpen, setHelpOpen] = useState(false)

  // Hold/park tickets
  const [parkedTickets, setParkedTickets] = useState([])
  const [parkedOpen, setParkedOpen] = useState(false)

  // Sale success + print
  const [lastSale, setLastSale] = useState(null)

  // Store info (for receipt header)
  const [store, setStore] = useState({})

  // Printer connected state (drives UI only — actual check via getConnection())
  const [printerConnected, setPrinterConnected] = useState(false)
  const [printerError, setPrinterError] = useState('')

  // Scan success toast
  const [scanToast, setScanToast] = useState('')
  const scanToastRef = useRef(null)

  // ── POS speed features ──────────────────────────────────────────────────────

  // Favorites (configurable by tenant admin)
  const [favorites, setFavorites] = useState([])        // product objects
  const [catalogOpen, setCatalogOpen] = useState(false)  // favorites/category catalog dialog
  const [favGroups, setFavGroups] = useState([])          // sub-favorite groups [{name, color, products:[]}]
  const [favColors, setFavColors] = useState({})          // product_id → color hex for favorites
  const [catalogSearch, setCatalogSearch] = useState('')  // search within catalog dialog
  const [catalogResults, setCatalogResults] = useState([])
  const [catalogSearching, setCatalogSearching] = useState(false)
  const catalogSearchTimer = useRef(null)

  // Category quick-access tabs
  const [categories, setCategories] = useState([])
  const [activeCat, setActiveCat] = useState(null)       // null = show favorites, 'group:idx' = sub-fav group, string id = category
  const [catProducts, setCatProducts] = useState([])
  const [catLoading, setCatLoading] = useState(false)

  // Recent clients (last 5 used)
  const recentClientsRef = useRef(JSON.parse(sessionStorage.getItem('pos_recent_clients') || '[]'))

  // Repeat last sale
  const lastSaleItemsRef = useRef(null) // stores lines from previous sale for repeat

  // Touch numpad
  const [numpadKey, setNumpadKey] = useState(null)       // line _key being edited via numpad
  const [numpadVal, setNumpadVal] = useState('')

  // Auto-submit barcode (scanner detection — auto-submit after 50ms idle)
  const scanIdleRef = useRef(null)
  const scanStartRef = useRef(0) // timestamp of first char in current scan burst

  // Scan beep audio (lazy-created, reused)
  const beepRef = useRef(null)
  function playBeep() {
    if (!beepRef.current) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      beepRef.current = ctx
    }
    const ctx = beepRef.current
    if (ctx.state === 'suspended') ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 1200
    gain.gain.value = 0.15
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
  }

  // Fullscreen
  const posRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const el = posRef.current
    if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {})
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else if (posRef.current) {
      posRef.current.requestFullscreen().catch(() => {})
    }
  }

  // Load caisse session on mount
  useEffect(() => {
    api.getCurrentCaisse().then(session => {
      setCaisseSession(session || null)
    }).catch(() => setCaisseSession(null))
  }, [])

  async function handleOpenCaisse() {
    setCaisseOpenLoading(true)
    try {
      const session = await api.openCaisse({
        opening_amount: parseFloat(caisseOpenAmount) || 0,
        notes: caisseOpenNotes,
      })
      setCaisseSession(session)
      setCaisseOpenAmount('')
      setCaisseOpenNotes('')
      refocusScan()
    } catch (err) {
      alert(err.message)
    } finally {
      setCaisseOpenLoading(false)
    }
  }

  async function handleCloseCaisse() {
    setCaisseCloseLoading(true)
    try {
      await api.closeCaisse({
        closing_amount: parseFloat(caisseCloseAmount) || 0,
        notes: caisseCloseNotes,
      })
      setCaisseCloseOpen(false)
      setCaisseCloseAmount('')
      setCaisseCloseNotes('')
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      route('/dashboard')
    } catch (err) {
      alert(err.message)
    } finally {
      setCaisseCloseLoading(false)
    }
  }

  // Load store settings + try auto-connect printer on mount; release all resources on unmount
  useEffect(() => {
    let cancelled = false
    api.getStoreSettings().then((d) => {
      if (cancelled) return
      setStore(d)
      // Load favorite products by IDs
      const favIds = d.pos_favorites || []
      const groupDefs = d.pos_fav_groups || []
      setFavColors(d.pos_fav_colors || {})
      // Collect all product IDs needed (favorites + all groups)
      const allIds = [...favIds]
      for (const g of groupDefs) if (g.product_ids) allIds.push(...g.product_ids)
      const uniqueIds = [...new Set(allIds)]
      if (uniqueIds.length > 0) {
        api.getProductsByIds(uniqueIds).then((prods) => {
          if (cancelled) return
          const map = {}
          for (const p of prods) map[p.id] = p
          setFavorites(favIds.map(id => map[id]).filter(Boolean))
          setFavGroups(groupDefs.map(g => ({
            name: g.name,
            color: g.color || '',
            products: (g.product_ids || []).map(id => map[id]).filter(Boolean),
          })))
        }).catch(() => {})
      }
    }).catch(() => {})
    // Load categories for quick-access tabs
    api.listCategories().then((cats) => { if (!cancelled) setCategories(cats) }).catch(() => {})
    tryAutoConnect().then((conn) => { if (!cancelled && conn) setPrinterConnected(true) }).catch(() => {})
    return () => {
      cancelled = true
      clearTimeout(focusTimerRef.current)
      clearTimeout(refocusTimerRef.current)
      clearTimeout(scanToastRef.current)
      clearTimeout(searchTimerRef.current)
      clearTimeout(scanIdleRef.current)
      clearTimeout(catalogSearchTimer.current)
      disconnectPrinter()
      if (beepRef.current) {
        beepRef.current.close().catch(() => {})
        beepRef.current = null
      }
    }
  }, [])

  // Catalog search debounce
  useEffect(() => {
    const q = catalogSearch.trim()
    if (!q) { setCatalogResults([]); setCatalogSearching(false); return }
    let cancelled = false
    setCatalogSearching(true)
    clearTimeout(catalogSearchTimer.current)
    catalogSearchTimer.current = setTimeout(async () => {
      try {
        const data = await api.listProducts({ q, limit: 20 })
        if (!cancelled) setCatalogResults(data.items || [])
      } catch { if (!cancelled) setCatalogResults([]) }
      finally { if (!cancelled) setCatalogSearching(false) }
    }, 300)
    return () => { cancelled = true; clearTimeout(catalogSearchTimer.current) }
  }, [catalogSearch])

  async function handleConnectPrinter() {
    setPrinterError('')
    try {
      await connectPrinter()
      setPrinterConnected(true)
    } catch (err) {
      setPrinterError(err.message || t('printError'))
    }
  }

  async function handleDisconnectPrinter() {
    await disconnectPrinter()
    setPrinterConnected(false)
  }

  // Totals
  const totalHT  = round2(lines.reduce((s, l) => s + lineHT(l), 0))
  const totalVAT = round2(lines.reduce((s, l) => s + lineHT(l) * l.vat / 100, 0))
  const total    = round2(totalHT + totalVAT)
  const itemCount = lines.reduce((s, l) => s + l.qty, 0)

  // VAT breakdown by rate
  const vatBreakdown = {}
  for (const l of lines) {
    if (l.vat > 0) {
      vatBreakdown[l.vat] = round2((vatBreakdown[l.vat] || 0) + lineHT(l) * l.vat / 100)
    }
  }

  // Auto-focus scan input when dialogs close
  useEffect(() => {
    if (!searchOpen && !editingLine && !payOpen && !helpOpen && !lastSale && !parkedOpen && !numpadKey && !catalogOpen) {
      clearTimeout(focusTimerRef.current)
      focusTimerRef.current = setTimeout(() => scanRef.current?.focus(), 50)
      return () => clearTimeout(focusTimerRef.current)
    }
  }, [searchOpen, editingLine, payOpen, helpOpen, lastSale, parkedOpen, numpadKey, catalogOpen])

  // Focus search input when dialog opens
  useEffect(() => {
    if (searchOpen) {
      setSearchQ('')
      setSearchResults([])
      lastPosSearchRef.current = ''
      clearTimeout(focusTimerRef.current)
      focusTimerRef.current = setTimeout(() => searchRef.current?.focus(), 50)
      return () => clearTimeout(focusTimerRef.current)
    }
  }, [searchOpen])

  // Product search — fires on Enter or debounced auto-search
  async function doProductSearch(query) {
    const q = (query ?? searchQ).trim()
    if (!q || q === lastPosSearchRef.current) return
    lastPosSearchRef.current = q
    setSearchLoading(true)
    try {
      const data = await api.listProducts({ q, limit: 10 })
      setSearchResults(data.items || [])
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  // Debounced auto-search (300ms after typing stops)
  const searchTimerRef = useRef(null)
  useEffect(() => {
    if (!searchOpen) return
    const q = searchQ.trim()
    if (!q) { setSearchResults([]); lastPosSearchRef.current = ''; return }
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => doProductSearch(q), 300)
    return () => clearTimeout(searchTimerRef.current)
  }, [searchQ, searchOpen])

  // ── Ticket operations ────────────────────────────────────────────────────────

  function addToTicketSelecting(product, qty = 1) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === product.id)
      if (idx !== -1) {
        const updated = { ...prev[idx], qty: prev[idx].qty + qty }
        const next = [updated, ...prev.filter((_, i) => i !== idx)]
        setSelectedKey(updated._key)
        return next
      }
      const newLine = {
        _key: `${product.id}-${Date.now()}`,
        productId: product.id,
        name: product.name,
        barcode: product.barcodes?.[0] || '',
        ref: product.ref || '',
        qty,
        unitPrice: (store.default_sale_price === 2 ? product.prix_vente_2 : store.default_sale_price === 3 ? product.prix_vente_3 : product.prix_vente_1) || 0,
        discount: 0,
        vat: product.vat || 0,
        pv1: product.prix_vente_1 || 0,
        pv2: product.prix_vente_2 || 0,
        pv3: product.prix_vente_3 || 0,
        pvMin: product.prix_minimum || 0,
        isService: product.is_service,
        stockQty: product.qty_available ?? 0,
        stockMin: product.qty_min ?? 0,
      }
      setSelectedKey(newLine._key)
      return [newLine, ...prev]
    })
  }

  function removeLine(key) {
    setLines((prev) => {
      const next = prev.filter((l) => l._key !== key)
      if (selectedKey === key) {
        setSelectedKey(next.length > 0 ? next[0]._key : null)
      }
      return next
    })
  }

  function updateQty(key, qty) {
    const q = parseFloat(qty) || 0
    if (q === 0) { removeLine(key); return }
    setLines((prev) => prev.map((l) => l._key === key ? { ...l, qty: q } : l))
  }

  function adjustQty(key, delta) {
    setLines((prev) => {
      const line = prev.find((l) => l._key === key)
      if (!line) return prev
      let newQty = round2(line.qty + delta)
      // Skip 0: jump from 1 → -1 or -1 → 1
      if (newQty === 0) newQty = delta < 0 ? -1 : 1
      return prev.map((l) => l._key === key ? { ...l, qty: newQty } : l)
    })
  }

  function applyPrice(key, unitPrice, discount) {
    setLines((prev) => prev.map((l) => l._key === key ? { ...l, unitPrice, discount } : l))
    setEditingLine(null)
  }

  function navigateLine(dir) {
    if (lines.length === 0) return
    if (!selectedKey) {
      setSelectedKey(dir === 1 ? lines[0]._key : lines[lines.length - 1]._key)
      return
    }
    const idx = lines.findIndex((l) => l._key === selectedKey)
    if (idx === -1) { setSelectedKey(lines[0]._key); return }
    const next = idx + dir
    if (next >= 0 && next < lines.length) setSelectedKey(lines[next]._key)
  }

  // ── Hold/park ticket ────────────────────────────────────────────────────────

  const MAX_PARKED = 20
  function parkCurrentTicket() {
    if (lines.length === 0) return
    if (parkedTickets.length >= MAX_PARKED) return // Cap to prevent memory bloat
    setParkedTickets(prev => [...prev, {
      id: Date.now(),
      lines: [...lines],
      client: selectedClient,
      saleType,
      total,
      itemCount,
      parkedAt: new Date(),
    }])
    setLines([])
    setSelectedKey(null)
    clearClient()
    refocusScan()
  }

  function restoreTicket(ticket) {
    // If current ticket has items, park it first
    if (lines.length > 0) {
      setParkedTickets(prev => [...prev, {
        id: Date.now(),
        lines: [...lines],
        client: selectedClient,
        saleType,
        total,
        itemCount,
        parkedAt: new Date(),
      }])
    }
    setLines(ticket.lines)
    setSelectedKey(ticket.lines[0]?._key || null)
    if (ticket.client) {
      setSelectedClient(ticket.client)
      setSaleType(ticket.saleType || 'cash')
    } else {
      clearClient()
    }
    setParkedTickets(prev => prev.filter(t => t.id !== ticket.id))
    setParkedOpen(false)
    refocusScan()
  }

  function deleteParkedTicket(ticketId) {
    setParkedTickets(prev => prev.filter(t => t.id !== ticketId))
  }

  // ── Barcode scan ─────────────────────────────────────────────────────────────

  async function handleScan(e) {
    if (e.key !== 'Enter') return
    const raw = scanInput.trim()
    if (!raw) return

    // Parse qty prefix: "3*barcode" or "3 * barcode"
    let barcode = raw
    let qty = 1
    const prefixMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*\*\s*(.+)$/)
    if (prefixMatch) {
      qty = parseFloat(prefixMatch[1]) || 1
      barcode = prefixMatch[2].trim()
    }

    setScanError('')
    setScanLoading(true)
    try {
      const data = await api.listProducts({ q: barcode, limit: 5 })
      const product = data.items?.find((p) => p.barcodes?.includes(barcode)) || data.items?.[0]
      if (!product) {
        setScanError(t('productNotFound'))
      } else {
        addToTicketSelecting(product, qty)
        setScanInput('')
        playBeep()
        refocusScan()
        // Show scan success toast
        clearTimeout(scanToastRef.current)
        setScanToast(qty !== 1 ? `${qty} × ${product.name}` : product.name)
        scanToastRef.current = setTimeout(() => setScanToast(''), 2000)
      }
    } catch {
      setScanError(t('productNotFound'))
    } finally {
      setScanLoading(false)
    }
  }

  // ── Client search ─────────────────────────────────────────────────────────────

  function openClientDialog() {
    setClientSearch('')
    setClientResults([])
    setClientSearchOpen(true)
    clearTimeout(focusTimerRef.current)
    focusTimerRef.current = setTimeout(() => clientSearchRef.current?.focus(), 50)
  }

  function closeClientDialog() {
    setClientSearchOpen(false)
    setClientSearch('')
    setClientResults([])
  }

  async function doClientSearch(q) {
    setClientSearchLoading(true)
    try {
      const data = await api.listClients({ q, page: 1, limit: 10 })
      setClientResults(data.items || [])
    } catch {} finally {
      setClientSearchLoading(false)
    }
  }

  function handleClientSearchInput(e) {
    setClientSearch(e.target.value)
    setClientResults([])
  }

  function selectClient(c) {
    setSelectedClient(c)
    closeClientDialog()
  }

  function clearClient() {
    setSelectedClient(null)
    setClientSearch('')
    setClientResults([])
    setClientSearchOpen(false)
    setSaleType('cash')
  }

  // ── Category tab products ──────────────────────────────────────────────────

  async function loadCategoryProducts(catId) {
    if (activeCat === catId) { setActiveCat(null); setCatProducts([]); return }
    setActiveCat(catId)
    setCatLoading(true)
    try {
      const data = await api.listProducts({ category_id: catId, limit: 25 })
      setCatProducts(data.items || [])
    } catch { setCatProducts([]) }
    finally { setCatLoading(false) }
  }

  // ── Repeat last sale ────────────────────────────────────────────────────────

  function repeatLastSale() {
    if (!lastSaleItemsRef.current || lastSaleItemsRef.current.length === 0) return
    const newLines = lastSaleItemsRef.current.map(l => ({
      ...l,
      _key: `${l.productId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    }))
    setLines(newLines)
    setSelectedKey(newLines[0]?._key || null)
  }

  // ── Payment ──────────────────────────────────────────────────────────────────

  async function handleConfirmSale(amountPaid) {
    setPayLoading(true)
    setPayError('')
    try {
      const result = await api.createSale({
        lines: lines.map((l) => ({
          product_id: l.productId,
          qty: l.qty,
          unit_price: l.unitPrice,
          discount: l.discount,
        })),
        payment_method: 'cash',
        amount_paid: amountPaid,
        client_id: selectedClient?.id ?? '',
        sale_type: saleType,
      })
      // Save lines for repeat-last-sale
      lastSaleItemsRef.current = [...lines]
      // Track recent clients
      if (selectedClient) {
        const rc = recentClientsRef.current.filter(c => c.id !== selectedClient.id)
        rc.unshift(selectedClient)
        if (rc.length > 5) rc.length = 5
        recentClientsRef.current = rc
        try { sessionStorage.setItem('pos_recent_clients', JSON.stringify(rc)) } catch {}
      }
      setLines([])
      setSelectedKey(null)
      setPayOpen(false)
      lastClientRef.current = selectedClient
      clearClient()
      setLastSale(result.data ?? result)
      refocusScan()
    } catch (err) {
      setPayError(err.message)
    } finally {
      setPayLoading(false)
    }
  }

  // ── Global keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e) {
      const anyModalOpen = editingLine || searchOpen || payOpen || helpOpen || lastSale || parkedOpen || numpadKey || catalogOpen

      // F1 – help
      if (e.key === 'F1') { e.preventDefault(); setHelpOpen(true); return }

      // F2 – search
      if (e.key === 'F2') { e.preventDefault(); setSearchOpen(true); return }

      // F3 – clear ticket
      if (e.key === 'F3') {
        e.preventDefault()
        if (lines.length === 0 || anyModalOpen) return
        if (lines.length <= 3 || window.confirm(t('confirmClearTicket'))) {
          setLines([])
          setSelectedKey(null)
        }
        return
      }

      // F4 – price editor for selected line
      if (e.key === 'F4') {
        e.preventDefault()
        if (anyModalOpen) return
        const line = lines.find((l) => l._key === selectedKey) || lines[0]
        if (line) setEditingLine(line)
        return
      }

      // F5 – refocus scan
      if (e.key === 'F5') {
        e.preventDefault()
        scanRef.current?.focus()
        return
      }

      // F6 – open client selector
      if (e.key === 'F6') {
        e.preventDefault()
        if (!anyModalOpen && canSelectClient) openClientDialog()
        return
      }

      // F7 – park current ticket
      if (e.key === 'F7') {
        e.preventDefault()
        if (!anyModalOpen && lines.length > 0) parkCurrentTicket()
        return
      }

      // F8 – show parked tickets
      if (e.key === 'F8') {
        e.preventDefault()
        if (!anyModalOpen && parkedTickets.length > 0) setParkedOpen(true)
        return
      }

      // F9 – toggle discount on selected line (open price editor)
      if (e.key === 'F9') {
        e.preventDefault()
        if (anyModalOpen) return
        const line = lines.find((l) => l._key === selectedKey) || lines[0]
        if (line) {
          if (line.discount > 0) {
            applyPrice(line._key, line.unitPrice, 0)
          } else {
            setEditingLine(line)
          }
        }
        return
      }

      // F10 – checkout
      if (e.key === 'F10') {
        e.preventDefault()
        if (lines.length > 0 && !anyModalOpen) {
          if (saleType === 'credit' && selectedClient) {
            handleConfirmSale(0)
          } else {
            setPayOpen(true)
          }
        }
        return
      }

      // Escape – close any open modal
      if (e.key === 'Escape') {
        if (numpadKey)     { setNumpadKey(null); refocusScan(); return }
        if (catalogOpen)  { setCatalogOpen(false); refocusScan(); return }
        if (helpOpen)     { setHelpOpen(false); refocusScan(); return }
        if (editingLine)  { setEditingLine(null); refocusScan(); return }
        if (searchOpen)   { setSearchOpen(false); refocusScan(); return }
        if (payOpen)      { setPayOpen(false); refocusScan(); return }
        if (parkedOpen)   { setParkedOpen(false); return }
        return
      }

      // The following shortcuts only work when no modal is open
      if (anyModalOpen) return

      // Arrow Up/Down – navigate lines
      // Allow from scan input or anywhere not inside a different input
      const tag = document.activeElement?.tagName
      const isScanFocused = document.activeElement === scanRef.current
      const isOtherInput = tag === 'INPUT' && !isScanFocused
      const isTextarea = tag === 'TEXTAREA'
      if (!isOtherInput && !isTextarea) {
        if (e.key === 'ArrowDown') { e.preventDefault(); navigateLine(1); return }
        if (e.key === 'ArrowUp')   { e.preventDefault(); navigateLine(-1); return }
      }

      // + / = – qty increment (only when no input is focused)
      if ((e.key === '+' || e.key === '=' || e.key === 'NumpadAdd') && !isOtherInput && !isScanFocused) {
        e.preventDefault()
        const key = selectedKey || (lines.length > 0 ? lines[0]._key : null)
        if (key) adjustQty(key, 1)
        return
      }

      // - – qty decrement (only when no input is focused)
      if ((e.key === '-' || e.key === 'NumpadSubtract') && !isOtherInput && !isScanFocused) {
        e.preventDefault()
        const key = selectedKey || (lines.length > 0 ? lines[0]._key : null)
        if (key) adjustQty(key, -1)
        return
      }

      // Delete – remove selected/first line (when scan input is empty)
      if (e.key === 'Delete' && scanInput === '' && !isOtherInput) {
        e.preventDefault()
        const key = selectedKey || (lines.length > 0 ? lines[0]._key : null)
        if (key) removeLine(key)
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lines, selectedKey, scanInput, searchOpen, editingLine, payOpen, helpOpen, parkedOpen, parkedTickets, saleType, selectedClient, numpadKey, catalogOpen, canSelectClient])

  // ─── render ─────────────────────────────────────────────────────────────────

  return (
    <div ref={posRef} class="page-enter min-h-screen bg-base-200 p-4 md:p-6 overflow-auto">

      {/* Caisse opening modal — blocks POS until session is opened */}
      {caisseSession === undefined && (
        <div class="min-h-[60vh] flex items-center justify-center">
          <span class="loading loading-spinner loading-lg text-primary" />
        </div>
      )}

      {caisseSession === null && (
        <dialog class="modal modal-open">
          <div class="modal-box max-w-sm">
            <h3 class="font-bold text-lg mb-4">{t('openCaisse')}</h3>
            <p class="text-sm text-base-content/60 mb-4">{t('caisseRequired')}</p>
            <div class="form-control mb-3">
              <label class="label"><span class="label-text">{t('openingAmount')}</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                class="input input-bordered w-full"
                value={caisseOpenAmount}
                onInput={e => setCaisseOpenAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleOpenCaisse()}
                autoFocus
              />
            </div>
            <div class="form-control mb-4">
              <label class="label"><span class="label-text">{t('caisseNotes')}</span></label>
              <input
                type="text"
                class="input input-bordered w-full"
                value={caisseOpenNotes}
                onInput={e => setCaisseOpenNotes(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleOpenCaisse()}
              />
            </div>
            <div class="modal-action">
              <button class="btn btn-ghost btn-sm" onClick={() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); route('/dashboard') }}>
                {t('back')}
              </button>
              <button
                class={`btn btn-primary btn-sm ${caisseOpenLoading ? 'loading' : ''}`}
                onClick={handleOpenCaisse}
                disabled={caisseOpenLoading}
              >
                {t('caisseOpen')}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {caisseSession && (<>
      {/* Page title + shortcuts hint + printer button */}
      <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div class="flex items-center gap-3">
          <button class="btn btn-sm btn-ghost btn-square" onClick={() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); route('/dashboard') }} title={t('dashboard')}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <h2 class="text-2xl font-bold">{t('posPage')}</h2>
          <button class="btn btn-sm btn-ghost btn-square" onClick={toggleFullscreen} title="Fullscreen">
            {isFullscreen
              ? <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
            }
          </button>
        </div>
        <div class="flex items-center gap-3">
          {/* Close caisse */}
          <button class="btn btn-sm btn-outline btn-error gap-1.5" onClick={() => {
            setCaisseCloseOpen(true)
            setCaisseStats(null)
            if (caisseSession?.opened_at) {
              const opened = new Date(caisseSession.opened_at)
              const uid = authUser.value?.id || ''
              api.getUserSummary({
                from: opened.toISOString().slice(0, 10),
                to: new Date().toISOString().slice(0, 10),
                hour_from: opened.getHours(),
                user_id: uid,
              }).then(summary => {
                const u = summary?.users?.[0]
                setCaisseStats({
                  sales: u?.sales_total || 0,
                  returns: u?.returns_total || 0,
                  retraits: u?.retraits_total || 0,
                })
              }).catch(() => {})
            }
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
            {t('closeCaisse')}
          </button>
          {/* Printer connect/disconnect */}
          {printerConnected ? (
            <div class="flex items-center gap-2">
              <span class="flex items-center gap-1 text-xs text-success">
                <span class="w-2 h-2 rounded-full bg-success inline-block" />
                {t('printerConnected')}
              </span>
              <button class="btn btn-xs btn-ghost text-error" onClick={handleDisconnectPrinter}>
                {t('disconnectPrinter')}
              </button>
            </div>
          ) : (
            <button class="btn btn-xs btn-outline gap-1" onClick={handleConnectPrinter}>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              {t('connectPrinter')}
            </button>
          )}
          {printerError && <p class="text-xs text-error">{printerError}</p>}
          {/* Shortcuts hint */}
          <div class="hidden sm:flex gap-1 items-center text-xs text-base-content/40">
            <kbd class="kbd kbd-xs">F1</kbd> Help
            <span class="mx-1">·</span>
            <kbd class="kbd kbd-xs">F2</kbd> {t('searchProduct')}
            <span class="mx-1">·</span>
            <kbd class="kbd kbd-xs">F10</kbd> {t('checkout')}
          </div>
        </div>
      </div>

      {/* ── Scan success toast ───────────────────────────────────────────────── */}
      {scanToast && (
        <div class="scan-success mb-2 flex items-center gap-2 px-3 py-1.5 bg-success/10 text-success rounded-lg text-sm font-medium animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          {scanToast}
        </div>
      )}

      {/* ── Scan bar ─────────────────────────────────────────────────────────── */}
      <div class="flex gap-2 mb-4">
        <div class="relative flex-1">
          <input
            ref={scanRef}
            data-search
            class={`input input-bordered w-full ps-10 ${scanLoading ? 'input-disabled' : ''}`}
            placeholder={t('scanBarcode')}
            value={scanInput}
            onInput={(e) => {
              const val = e.target.value
              setScanInput(val); setScanError('')
              // Auto-submit: if chars arrive quickly (scanner), submit after 50ms idle
              const now = Date.now()
              if (val.length === 1) scanStartRef.current = now
              clearTimeout(scanIdleRef.current)
              if (val.length >= 4 && (now - scanStartRef.current) < 300) {
                scanIdleRef.current = setTimeout(() => {
                  handleScan({ key: 'Enter', preventDefault: () => {} })
                }, 50)
              }
            }}
            onKeyDown={handleScan}
            disabled={scanLoading}
            autoComplete="off"
          />
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 absolute start-3 top-1/2 -translate-y-1/2 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
          </svg>
          {scanError && (
            <p class="scan-error absolute -bottom-5 start-0 text-xs text-error">{scanError}</p>
          )}
        </div>
        <button class="btn btn-outline gap-1.5" onClick={() => setSearchOpen(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <span class="hidden sm:inline">{t('searchProduct')}</span>
        </button>
        {(favorites.length > 0 || categories.length > 0 || isTenantAdmin()) && (
          <button class="btn btn-outline gap-1.5" onClick={() => setCatalogOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <span class="hidden sm:inline">{t('favorites')}</span>
          </button>
        )}
      </div>

      {/* ── Main area: Ticket + Summary ──────────────────────────────────────── */}
      <div class="flex flex-col lg:flex-row gap-4 mt-6">

        {/* Ticket table */}
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold text-sm">
              {t('ticket')}
              {lines.length > 0 && (
                <span class="badge badge-sm badge-neutral ms-2">{itemCount}</span>
              )}
            </span>
            <div class="flex items-center gap-1">
              {lines.length === 0 && lastSaleItemsRef.current && (
                <button class="btn btn-xs btn-ghost text-accent gap-1" onClick={repeatLastSale} title={t('repeatLastSale')}>
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                  {t('repeatLastSale')}
                </button>
              )}
              {lines.length > 0 && (
                <button class="btn btn-xs btn-ghost text-info" onClick={parkCurrentTicket} title="F7">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                  </svg>
                  {t('holdTicket')}
                </button>
              )}
              {parkedTickets.length > 0 && (
                <button class="btn btn-xs btn-outline btn-warning gap-1" onClick={() => setParkedOpen(true)} title="F8">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {t('parkedTickets')}
                  <span class="badge badge-xs badge-warning">{parkedTickets.length}</span>
                </button>
              )}
              {lines.length > 0 && (
                <button class="btn btn-xs btn-ghost text-error" onClick={() => setLines([])}>
                  {t('clearTicket')}
                </button>
              )}
            </div>
          </div>

          <div class="card bg-base-100 shadow overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th class="min-w-32">{t('productName')}</th>
                  <th class="text-center w-20">{t('qty')}</th>
                  <th class="text-end w-28">{t('prixVente1')}</th>
                  <th class="text-end w-24">{t('discount')}</th>
                  <th class="text-end w-28">{t('totalTTC')}</th>
                  <th class="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={6} class="py-16 text-center">
                      <div class="flex flex-col items-center gap-2 text-base-content/30">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                        </svg>
                        <p class="text-sm">{t('scanOrSearch')}</p>
                        <p class="text-xs opacity-60"><kbd class="kbd kbd-xs">F1</kbd> {t('keyboardShortcuts')}</p>
                      </div>
                    </td>
                  </tr>
                )}
                {lines.map((line) => {
                  const isSelected = line._key === selectedKey
                  return (
                    <tr
                      key={line._key}
                      class={`hover cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 outline outline-1 outline-primary/30' : ''}`}
                      onClick={() => setSelectedKey(line._key)}
                    >
                      {/* Product */}
                      <td>
                        <div class="font-medium text-sm leading-tight flex items-center gap-1.5">
                          {line.name}
                          {!line.isService && line.qty > line.stockQty && (
                            <span class="badge badge-xs badge-error gap-0.5 whitespace-nowrap" title={`${t('qtyAvailable')}: ${line.stockQty}`}>
                              {t('lowStock')}
                            </span>
                          )}
                          {!line.isService && line.qty <= line.stockQty && line.stockQty <= line.stockMin && (
                            <span class="badge badge-xs badge-warning gap-0.5 whitespace-nowrap" title={`${t('qtyAvailable')}: ${line.stockQty}`}>
                              {t('lowStock')}
                            </span>
                          )}
                        </div>
                        {line.barcode && <div class="text-xs text-base-content/40">{line.barcode}</div>}
                      </td>

                      {/* Qty — click to open numpad */}
                      <td class="text-center">
                        <button
                          class={`btn btn-xs btn-ghost font-mono min-w-10 ${isSelected ? 'btn-primary' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setNumpadKey(line._key); setNumpadVal(String(line.qty)) }}
                        >
                          {line.qty % 1 === 0 ? line.qty : line.qty.toFixed(3)}
                        </button>
                      </td>

                      {/* Unit price — click to open price editor */}
                      <td class="text-end">
                        <button
                          class="btn btn-xs btn-ghost font-mono text-end w-full justify-end"
                          onClick={(e) => { e.stopPropagation(); setEditingLine(line) }}
                        >
                          {line.unitPrice.toFixed(2)}
                          {line.vat > 0 && (
                            <span class="badge badge-xs badge-warning ms-1">{line.vat}%</span>
                          )}
                        </button>
                      </td>

                      {/* Discount */}
                      <td class="text-end">
                        {line.discount > 0
                          ? <span class="text-xs font-mono text-warning">-{line.discount.toFixed(2)}</span>
                          : <span class="text-base-content/20 text-xs">—</span>
                        }
                      </td>

                      {/* Total TTC */}
                      <td class={`text-end font-mono text-sm font-medium ${line.qty < 0 ? 'text-error' : ''}`}>
                        {lineTTC(line).toFixed(2)}
                      </td>

                      {/* Delete */}
                      <td>
                        <button class="btn btn-xs btn-ghost btn-square text-error"
                          onClick={(e) => { e.stopPropagation(); removeLine(line._key) }}>
                          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Summary + Pay ─────────────────────────────────────────────────── */}
        <div class="lg:w-72 shrink-0">
          <div class="card bg-base-100 shadow p-4 space-y-2 sticky top-4">
            <p class="font-semibold text-sm mb-1">{t('ticket')}</p>

            {/* Client selector */}
            {canSelectClient && (
              <div class="pb-1">
                {selectedClient ? (
                  <div class="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-lg px-2 py-1.5">
                    <div class="min-w-0">
                      <p class="text-xs font-semibold text-primary truncate">{selectedClient.name}</p>
                      <p class="text-xs text-base-content/50 font-mono">{selectedClient.code}</p>
                    </div>
                    <button class="btn btn-xs btn-ghost text-base-content/40 shrink-0" onClick={clearClient}>✕</button>
                  </div>
                ) : (
                  <button
                    class="btn btn-outline btn-xs w-full justify-start font-normal text-base-content/50 gap-1"
                    onClick={openClientDialog}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    {t('selectClient')}
                  </button>
                )}
                {/* Sale type toggle — only shown when client is selected and plan allows */}
                {selectedClient && canCreditSale && (
                  <div class="join w-full mt-1">
                    <button
                      class={`join-item btn btn-xs flex-1 ${saleType === 'cash' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setSaleType('cash')}
                    >{t('cashSale')}</button>
                    <button
                      class={`join-item btn btn-xs flex-1 ${saleType === 'credit' ? 'btn-error' : 'btn-outline'}`}
                      onClick={() => setSaleType('credit')}
                    >{t('creditSale')}</button>
                  </div>
                )}
              </div>
            )}

            <div class="flex justify-between text-sm">
              <span class="text-base-content/60">{t('subtotalHT')}</span>
              <span class="font-mono">{totalHT.toFixed(2)}</span>
            </div>

            {/* VAT breakdown */}
            {Object.entries(vatBreakdown).map(([rate, amount]) => (
              <div key={rate} class="flex justify-between text-sm">
                <span class="text-base-content/60">{t('totalVAT')} {rate}%</span>
                <span class="font-mono text-warning">{amount.toFixed(2)}</span>
              </div>
            ))}
            {totalVAT === 0 && (
              <div class="flex justify-between text-sm">
                <span class="text-base-content/60">{t('totalVAT')}</span>
                <span class="font-mono">0.00</span>
              </div>
            )}

            <div class="divider my-1" />

            <div class="flex justify-between items-center">
              <span class="font-bold">{t('totalTTC')}</span>
              <span class={`text-xl font-bold font-mono ${total < 0 ? 'text-error' : 'text-primary'}`}>{total.toFixed(2)}</span>
            </div>

            <button
              class={`btn w-full mt-2 gap-2 ${saleType === 'credit' ? 'btn-error' : 'btn-primary'}`}
              disabled={lines.length === 0 || payLoading}
              onClick={() => {
                if (saleType === 'credit' && selectedClient) {
                  handleConfirmSale(0)
                } else {
                  setPayOpen(true)
                }
              }}
            >
              {payLoading
                ? <span class="loading loading-spinner loading-sm" />
                : <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
              }
              {saleType === 'credit' ? t('confirmCredit') : t('checkout')} — F10
            </button>

            {/* Selected line quick actions */}
            {selectedKey && lines.find((l) => l._key === selectedKey) && (
              <div class="flex gap-1 pt-1">
                <button class="btn btn-xs btn-outline flex-1"
                  onClick={() => adjustQty(selectedKey, -1)}>−</button>
                <button class="btn btn-xs btn-outline flex-1"
                  onClick={() => adjustQty(selectedKey, 1)}>+</button>
                <button class="btn btn-xs btn-outline flex-1"
                  onClick={() => { const l = lines.find((x) => x._key === selectedKey); if (l) setEditingLine(l) }}>
                  {t('editPrice')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Product search dialog ─────────────────────────────────────────────── */}
      {searchOpen && (
        <dialog class="modal modal-bottom sm:modal-middle" open>
          <div class="modal-box !max-w-none w-[60vw] h-[70vh] max-h-[70vh] flex flex-col">
            <h3 class="font-bold text-base mb-3">{t('searchProduct')}</h3>

            <input
              ref={searchRef}
              class="input input-bordered w-full mb-3"
              placeholder={t('searchProducts')}
              value={searchQ}
              onInput={(e) => { setSearchQ(e.target.value); lastPosSearchRef.current = '' }}
              onKeyDown={(e) => { if (e.key === 'Enter') { clearTimeout(searchTimerRef.current); doProductSearch() } }}
              autoComplete="off"
            />

            {searchLoading && (
              <div class="flex justify-center py-4">
                <span class="loading loading-spinner loading-sm text-primary" />
              </div>
            )}

            {!searchLoading && searchResults.length === 0 && searchQ.trim() && (
              <p class="text-center text-base-content/40 text-sm py-4">{t('productNotFound')}</p>
            )}

            {!searchLoading && searchResults.length === 0 && !searchQ.trim() && (
              <p class="text-center text-base-content/30 text-sm py-4">{t('scanOrSearch')}</p>
            )}

            <div class="space-y-1 flex-1 min-h-0 overflow-y-auto">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-base-200 text-start transition-colors"
                  onClick={() => { addToTicketSelecting(p); setSearchOpen(false); refocusScan() }}
                >
                  <div class="min-w-0">
                    <p class="font-medium text-sm truncate">{p.name}</p>
                    <p class="text-xs text-base-content/50">
                      {[p.ref, p.barcodes?.[0]].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div class="text-end shrink-0 ms-3">
                    <p class="font-mono text-sm font-semibold">{((store.default_sale_price === 2 ? p.prix_vente_2 : store.default_sale_price === 3 ? p.prix_vente_3 : p.prix_vente_1) || 0).toFixed(2)}</p>
                    {!p.is_service && (
                      <p class={`text-xs ${p.qty_available <= p.qty_min ? 'text-warning' : 'text-base-content/40'}`}>
                        {t('qtyAvailable')}: {p.qty_available}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div class="modal-action mt-3 shrink-0">
              <button class="btn btn-sm btn-ghost" onClick={() => { setSearchOpen(false); refocusScan() }}>{t('back')}</button>
            </div>
          </div>
          <div class="modal-backdrop" onClick={() => { setSearchOpen(false); refocusScan() }} />
        </dialog>
      )}

      {/* ── Price editor ─────────────────────────────────────────────────────── */}
      {editingLine && (
        <PriceEditor
          line={editingLine}
          onApply={(price, discount) => applyPrice(editingLine._key, price, discount)}
          onClose={() => { setEditingLine(null); refocusScan() }}
          t={t}
        />
      )}

      {/* ── Client search dialog ──────────────────────────────────────────────── */}
      {clientSearchOpen && (
        <dialog class="modal modal-bottom sm:modal-middle" open>
          <div class="modal-box !max-w-none w-[50vw] h-[60vh] max-h-[60vh] flex flex-col">
            <h3 class="font-bold text-base mb-3">{t('selectClient')}</h3>

            <div class="flex gap-2 mb-3">
              <input
                ref={clientSearchRef}
                class="input input-bordered flex-1"
                placeholder={t('searchClients')}
                value={clientSearch}
                onInput={handleClientSearchInput}
                onKeyDown={(e) => e.key === 'Enter' && doClientSearch(clientSearch.trim())}
                autoComplete="off"
              />
              <button class="btn btn-primary btn-sm self-center" onClick={() => doClientSearch(clientSearch.trim())}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </button>
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto">
            {clientSearchLoading && (
              <div class="flex justify-center py-4">
                <span class="loading loading-spinner loading-sm text-primary" />
              </div>
            )}

            {!clientSearchLoading && clientResults.length === 0 && clientSearch.trim() && (
              <p class="text-center text-base-content/40 text-sm py-4">{t('noClients')}</p>
            )}

            {!clientSearchLoading && clientResults.length === 0 && !clientSearch.trim() && recentClientsRef.current.length > 0 && (
              <div>
                <p class="text-xs font-semibold text-base-content/50 mb-1">{t('recentClients')}</p>
                <div class="space-y-1">
                  {recentClientsRef.current.map(c => (
                    <button
                      key={c.id}
                      class="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-base-200 text-start transition-colors"
                      onClick={() => selectClient(c)}
                    >
                      <div class="min-w-0">
                        <p class="font-medium text-sm truncate">{c.name}</p>
                        <p class="text-xs text-base-content/50">{c.phone || c.email || '—'}</p>
                      </div>
                      <p class="font-mono text-xs text-base-content/40 shrink-0 ms-3">{c.code}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!clientSearchLoading && clientResults.length === 0 && !clientSearch.trim() && recentClientsRef.current.length === 0 && (
              <p class="text-center text-base-content/30 text-sm py-4">{t('searchClients')}</p>
            )}

            <div class="space-y-1">
              {clientResults.map((c) => (
                <button
                  key={c.id}
                  class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-base-200 text-start transition-colors"
                  onClick={() => selectClient(c)}
                >
                  <div class="min-w-0">
                    <p class="font-medium text-sm truncate">{c.name}</p>
                    <p class="text-xs text-base-content/50">{c.phone || c.email || '—'}</p>
                  </div>
                  <div class="text-end shrink-0 ms-3">
                    <p class="font-mono text-xs text-base-content/40">{c.code}</p>
                    {c.balance > 0 && (
                      <p class="text-xs text-error font-mono">{c.balance.toFixed(2)}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
            </div>

            <div class="modal-action mt-3 shrink-0">
              <button class="btn btn-sm btn-ghost" onClick={closeClientDialog}>{t('back')}</button>
            </div>
          </div>
          <div class="modal-backdrop" onClick={closeClientDialog} />
        </dialog>
      )}

      {/* ── Payment modal ─────────────────────────────────────────────────────── */}
      {payOpen && (
        <PaymentModal
          total={total}
          onConfirm={handleConfirmSale}
          onClose={() => { setPayOpen(false); setPayError(''); refocusScan() }}
          loading={payLoading}
          error={payError}
          t={t}
        />
      )}

      {/* ── Help overlay ──────────────────────────────────────────────────────── */}
      {helpOpen && (
        <HelpModal onClose={() => { setHelpOpen(false); refocusScan() }} t={t} />
      )}

      {/* ── Parked tickets dialog ───────────────────────────────────────────── */}
      {parkedOpen && (
        <dialog class="modal modal-bottom sm:modal-middle" open>
          <div class="modal-box max-w-md">
            <h3 class="font-bold text-base mb-3">{t('parkedTickets')}</h3>
            {parkedTickets.length === 0 ? (
              <p class="text-center text-base-content/40 text-sm py-4">{t('noParkedTickets')}</p>
            ) : (
              <div class="space-y-2">
                {parkedTickets.map(ticket => (
                  <div key={ticket.id} class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                    <div class="min-w-0">
                      <p class="text-sm font-medium">
                        {ticket.lines.length} {t('saleItems')} · <span class="font-mono font-bold">{ticket.total.toFixed(2)}</span>
                      </p>
                      <p class="text-xs text-base-content/50">
                        {ticket.client ? ticket.client.name + ' · ' : ''}
                        {new Date(ticket.parkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div class="flex gap-1 shrink-0">
                      <button class="btn btn-xs btn-primary" onClick={() => restoreTicket(ticket)}>
                        {t('restore')}
                      </button>
                      <button class="btn btn-xs btn-ghost text-error" onClick={() => deleteParkedTicket(ticket.id)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div class="modal-action mt-3">
              <button class="btn btn-sm btn-ghost" onClick={() => setParkedOpen(false)}>{t('close')}</button>
            </div>
          </div>
          <div class="modal-backdrop" onClick={() => setParkedOpen(false)} />
        </dialog>
      )}

      {/* ── Catalog dialog (favorites + sub-favorites + categories + search) ── */}
      {catalogOpen && (
        <dialog class="modal modal-bottom sm:modal-middle" open>
          <div class="modal-box !max-w-none w-[98vw] h-[85vh] max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-base">{t('favorites')}</h3>
              <div class="flex items-center gap-1">
                {hasFeature('favorites') && hasPerm('favorites', 'view') && (
                  <a
                    href="/favorites"
                    class="btn btn-xs btn-ghost text-base-content/40 gap-1"
                    onClick={() => setCatalogOpen(false)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {t('manageFavorites')}
                  </a>
                )}
              </div>
            </div>

            {/* Search input */}
            <input
              class="input input-bordered w-full input-sm mb-3"
              placeholder={t('searchCatalog')}
              value={catalogSearch}
              onInput={(e) => setCatalogSearch(e.target.value)}
              autoComplete="off"
            />

            {/* Search results (shown when typing) */}
            <div class="flex-1 min-h-0 flex flex-col">
            {catalogSearch.trim() ? (
              catalogSearching ? (
                <div class="flex justify-center py-6">
                  <span class="loading loading-spinner loading-sm text-primary" />
                </div>
              ) : catalogResults.length > 0 ? (
                <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2 flex-1 min-h-0 overflow-y-auto">
                  {catalogResults.map(p => (
                    <button
                      key={p.id}
                      class="btn btn-sm btn-outline h-auto py-2.5 flex flex-col items-center gap-0.5 min-h-0"
                      onClick={() => { addToTicketSelecting(p); setCatalogOpen(false); setCatalogSearch('') }}
                    >
                      <span class="text-xs font-medium leading-tight w-full text-center line-clamp-3">{p.name}</span>
                      <span class="text-[11px] font-mono font-bold text-primary">
                        {((store.default_sale_price === 2 ? p.prix_vente_2 : store.default_sale_price === 3 ? p.prix_vente_3 : p.prix_vente_1) || 0).toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p class="text-center text-base-content/30 text-sm py-6">{t('noProducts')}</p>
              )
            ) : (
              <>
                {/* Tabs: Favorites | Sub-favorite groups | Categories */}
                <div class="flex flex-wrap gap-1 mb-3 max-h-16 overflow-y-auto">
                  <button
                    class={`btn btn-xs whitespace-nowrap gap-1 ${activeCat === null ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => { setActiveCat(null); setCatProducts([]) }}
                  >
                    {t('favorites')}
                    {favorites.length > 0 && <span class={`badge badge-xs ${activeCat === null ? 'badge-neutral' : 'badge-ghost'}`}>{favorites.length}</span>}
                  </button>
                  {favGroups.map((g, idx) => (
                    <button
                      key={`g${idx}`}
                      class={`btn btn-xs whitespace-nowrap gap-1 ${activeCat === `group:${idx}` ? 'btn-primary' : 'btn-outline'}`}
                      style={g.color ? { backgroundColor: g.color, borderColor: g.color, color: '#fff' } : {}}
                      onClick={() => { setActiveCat(`group:${idx}`); setCatProducts([]) }}
                    >
                      {g.name}
                      {g.products.length > 0 && <span class={`badge badge-xs ${activeCat === `group:${idx}` ? 'badge-neutral' : 'badge-ghost'}`}>{g.products.length}</span>}
                    </button>
                  ))}
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      class={`btn btn-xs whitespace-nowrap ${activeCat === cat.id ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => loadCategoryProducts(cat.id)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Favorites grid */}
                {activeCat === null && favorites.length > 0 && (
                  <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2 flex-1 min-h-0 overflow-y-auto">
                    {favorites.map(p => {
                      const fc = favColors[p.id]
                      return (
                        <button
                          key={p.id}
                          class={`btn btn-sm h-auto py-2.5 flex flex-col items-center gap-0.5 min-h-0 ${fc ? '' : 'btn-outline'}`}
                          style={fc ? { backgroundColor: fc, borderColor: fc, color: '#fff' } : {}}
                          onClick={() => { addToTicketSelecting(p); setCatalogOpen(false) }}
                        >
                          <span class="text-xs font-medium leading-tight w-full text-center line-clamp-3">{p.name}</span>
                          <span class={`text-[11px] font-mono font-bold ${fc ? 'text-white/80' : 'text-primary'}`}>
                            {((store.default_sale_price === 2 ? p.prix_vente_2 : store.default_sale_price === 3 ? p.prix_vente_3 : p.prix_vente_1) || 0).toFixed(2)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {activeCat === null && favorites.length === 0 && (
                  <p class="text-center text-base-content/30 text-sm py-6">{t('noFavorites')}</p>
                )}

                {/* Sub-favorite group grid */}
                {typeof activeCat === 'string' && activeCat.startsWith('group:') && (() => {
                  const gIdx = parseInt(activeCat.split(':')[1], 10)
                  const group = favGroups[gIdx]
                  if (!group) return null
                  const gc = group.color
                  return group.products.length > 0 ? (
                    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2 flex-1 min-h-0 overflow-y-auto">
                      {group.products.map(p => {
                        const pc = favColors[p.id] || gc
                        return (
                          <button
                            key={p.id}
                            class={`btn btn-sm h-auto py-2.5 flex flex-col items-center gap-0.5 min-h-0 ${pc ? '' : 'btn-outline'}`}
                            style={pc ? { backgroundColor: pc, borderColor: pc, color: '#fff' } : {}}
                            onClick={() => { addToTicketSelecting(p); setCatalogOpen(false) }}
                          >
                            <span class="text-xs font-medium leading-tight w-full text-center line-clamp-3">{p.name}</span>
                            <span class={`text-[11px] font-mono font-bold ${pc ? 'text-white/80' : 'text-primary'}`}>
                              {((store.default_sale_price === 2 ? p.prix_vente_2 : store.default_sale_price === 3 ? p.prix_vente_3 : p.prix_vente_1) || 0).toFixed(2)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p class="text-center text-base-content/30 text-sm py-6">{t('noProducts')}</p>
                  )
                })()}

                {/* Category grid */}
                {activeCat !== null && !String(activeCat).startsWith('group:') && (
                  catLoading ? (
                    <div class="flex justify-center py-6">
                      <span class="loading loading-spinner loading-sm text-primary" />
                    </div>
                  ) : catProducts.length > 0 ? (
                    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2 flex-1 min-h-0 overflow-y-auto">
                      {catProducts.map(p => (
                        <button
                          key={p.id}
                          class="btn btn-sm btn-outline h-auto py-2.5 flex flex-col items-center gap-0.5 min-h-0"
                          onClick={() => { addToTicketSelecting(p); setCatalogOpen(false) }}
                        >
                          <span class="text-xs font-medium leading-tight w-full text-center line-clamp-3">{p.name}</span>
                          <span class="text-[11px] font-mono font-bold text-primary">
                            {((store.default_sale_price === 2 ? p.prix_vente_2 : store.default_sale_price === 3 ? p.prix_vente_3 : p.prix_vente_1) || 0).toFixed(2)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p class="text-center text-base-content/30 text-sm py-6">{t('noProducts')}</p>
                  )
                )}
              </>
            )}
            </div>

            <div class="modal-action mt-3 shrink-0">
              <button class="btn btn-sm btn-ghost" onClick={() => { setCatalogOpen(false); setCatalogSearch('') }}>{t('close')}</button>
            </div>
          </div>
          <div class="modal-backdrop" onClick={() => { setCatalogOpen(false); setCatalogSearch('') }} />
        </dialog>
      )}

      {/* ── Numpad modal ──────────────────────────────────────────────────────── */}
      {numpadKey && (
        <dialog class="modal modal-bottom sm:modal-middle" open>
          <div class="modal-box max-w-xs">
            <h3 class="font-bold text-base mb-3">{t('qty')}</h3>
            <div class="text-center mb-3">
              <input
                type="text"
                class="input input-bordered input-lg text-center font-mono text-xl w-full"
                value={numpadVal}
                readOnly
              />
            </div>
            <div class="grid grid-cols-3 gap-1.5">
              {[7,8,9,4,5,6,1,2,3].map(n => (
                <button key={n} class="btn btn-outline btn-lg text-lg"
                  onClick={() => setNumpadVal(prev => prev === '0' ? String(n) : prev + n)}>
                  {n}
                </button>
              ))}
              <button class="btn btn-outline btn-lg text-lg"
                onClick={() => setNumpadVal(prev => prev.includes('.') ? prev : prev + '.')}>.</button>
              <button class="btn btn-outline btn-lg text-lg"
                onClick={() => setNumpadVal('0')}>0</button>
              <button class="btn btn-outline btn-lg text-lg"
                onClick={() => setNumpadVal(prev => prev.slice(0, -1) || '0')}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
                </svg>
              </button>
            </div>
            <div class="modal-action mt-3">
              <button class="btn btn-ghost btn-sm" onClick={() => { setNumpadKey(null); refocusScan() }}>{t('back')}</button>
              <button class="btn btn-primary btn-sm flex-1" onClick={() => {
                updateQty(numpadKey, numpadVal)
                setNumpadKey(null)
              }}>{t('applyPrice')}</button>
            </div>
          </div>
          <div class="modal-backdrop" onClick={() => { setNumpadKey(null); refocusScan() }} />
        </dialog>
      )}

      {/* ── Sale success + print ──────────────────────────────────────────────── */}
      {lastSale && (
        <SaleSuccessModal
          sale={lastSale}
          store={store}
          onClose={() => { setLastSale(null); refocusScan() }}
          t={t}
          client={lastClientRef.current}
          lang={lang}
        />
      )}
      {/* Caisse close modal */}
      {caisseCloseOpen && (
        <dialog class="modal modal-open">
          <div class="modal-box max-w-sm">
            <h3 class="font-bold text-lg mb-4">{t('closeCaisse')}</h3>
            {(() => {
              const opening = caisseSession?.opening_amount || 0
              const sales = caisseStats?.sales || 0
              const returns = caisseStats?.returns || 0
              const retraits = caisseStats?.retraits || 0
              const expected = round2(opening + sales - returns - retraits)
              const closing = parseFloat(caisseCloseAmount) || 0
              const ecart = round2(closing - expected)
              return (<>
            <div class="bg-base-200 rounded-lg p-3 mb-4 space-y-1.5 text-sm">
              <div class="flex justify-between">
                <span class="text-base-content/60">{t('caisseOpenedAt')}</span>
                <span>{caisseSession?.opened_at ? new Date(caisseSession.opened_at).toLocaleTimeString() : '-'}</span>
              </div>
              <div class="divider my-1"></div>
              <div class="flex justify-between">
                <span class="text-base-content/60">{t('openingAmount')}</span>
                <span class="font-semibold">{opening.toFixed(2)}</span>
              </div>
              {caisseStats ? (<>
              <div class="flex justify-between">
                <span class="text-base-content/60">{t('summSalesTotal')}</span>
                <span class="font-semibold text-success">+{sales.toFixed(2)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-base-content/60">{t('summReturnsTotal')}</span>
                <span class="font-semibold text-error">-{returns.toFixed(2)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-base-content/60">{t('summRetraitsTotal')}</span>
                <span class="font-semibold text-warning">-{retraits.toFixed(2)}</span>
              </div>
              <div class="divider my-1"></div>
              <div class="flex justify-between font-bold">
                <span>{t('caisseExpectedAmount')}</span>
                <span>{expected.toFixed(2)}</span>
              </div>
              </>) : (
              <div class="flex justify-center py-2">
                <span class="loading loading-spinner loading-sm"></span>
              </div>
              )}
            </div>
            <div class="form-control mb-3">
              <label class="label"><span class="label-text">{t('closingAmount')}</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                class="input input-bordered w-full"
                value={caisseCloseAmount}
                onInput={e => setCaisseCloseAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCloseCaisse()}
                autoFocus
              />
            </div>
            {caisseCloseAmount !== '' && caisseStats && (
              <div class={`rounded-lg p-3 mb-3 text-sm ${ecart >= 0 ? 'bg-success/10' : 'bg-error/10'}`}>
                <div class="flex justify-between font-bold">
                  <span>{t('caisseDifference')}</span>
                  <span class={ecart >= 0 ? 'text-success' : 'text-error'}>
                    {ecart >= 0 ? '+' : ''}{ecart.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
              </>)
            })()}
            <div class="form-control mb-4">
              <label class="label"><span class="label-text">{t('caisseNotes')}</span></label>
              <input
                type="text"
                class="input input-bordered w-full"
                value={caisseCloseNotes}
                onInput={e => setCaisseCloseNotes(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCloseCaisse()}
              />
            </div>
            <div class="modal-action">
              <button class="btn btn-ghost btn-sm" onClick={() => { setCaisseCloseOpen(false); refocusScan() }}>{t('back')}</button>
              <button
                class={`btn btn-error btn-sm ${caisseCloseLoading ? 'loading' : ''}`}
                onClick={handleCloseCaisse}
                disabled={caisseCloseLoading}
              >
                {t('caisseConfirmClose')}
              </button>
            </div>
          </div>
          <div class="modal-backdrop" onClick={() => { setCaisseCloseOpen(false); refocusScan() }} />
        </dialog>
      )}

      </>)}
    </div>
  )
}
