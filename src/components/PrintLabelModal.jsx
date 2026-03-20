import { useState, useEffect, useRef } from 'preact/hooks'
import { Modal, closeModal } from './Modal'
import { useI18n } from '../lib/i18n'
import { buildBarcodeLabel } from '../lib/escpos'
import { buildTsplLabel } from '../lib/tspl'
import { printBytes, getConnection } from '../lib/webusbPrint'
import { toast } from './Toast'

export const PRINT_MODAL_ID = 'print-label-modal'

const LABEL_MODELS = [
  { id: 'standard', icon: '🏷️' },
  { id: '45x35',    icon: '📐' },
  { id: '40x20',    icon: '📏' },
  { id: 'optic',    icon: '👓' },
  { id: 'bijou',    icon: '💍' },
]

function BarcodePreview({ value }) {
  const ref = useRef()
  useEffect(() => {
    if (!ref.current || !value) return
    import('jsbarcode').then((m) => {
      const JsBarcode = m.default
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128', width: 1.2, height: 36,
          displayValue: true, fontSize: 9, margin: 2,
        })
      } catch {}
    })
  }, [value])
  if (!value) return null
  return <svg ref={ref} class="max-w-full" />
}

export function PrintLabelModal({ product, storeName }) {
  const { t } = useI18n()
  const [model, setModel]           = useState('standard')
  const [copies, setCopies]         = useState(1)
  const [priceField, setPriceField] = useState('prix_vente_1')
  const [barcodeVal, setBarcodeVal] = useState('')
  const [printing, setPrinting]     = useState(false)
  const [error, setError]           = useState('')

  const hasPrinter = !!getConnection()

  useEffect(() => {
    if (!product) return
    setBarcodeVal(product.barcodes?.[0] || product.ref || '')
    setError('')
  }, [product])

  async function handlePrint() {
    setError('')
    setPrinting(true)
    try {
      if (!getConnection()) {
        throw new Error(t('connectPrinter') || 'No printer connected')
      }
      const price = product[priceField] ?? 0
      const isLabelPrinter = model !== 'standard'
      let bytes
      if (isLabelPrinter) {
        // TSPL for label printers (TSC, Xprinter, etc.)
        bytes = buildTsplLabel({
          model,
          storeName: storeName || '',
          name: product.name,
          ref: product.ref || product.barcodes?.[0] || '',
          barcode: barcodeVal,
          price: String(price),
          copies,
        })
      } else {
        // ESC/POS for receipt/thermal printers
        bytes = buildBarcodeLabel({
          model,
          storeName: storeName || '',
          name: product.name,
          ref: product.ref || product.barcodes?.[0] || '',
          barcode: barcodeVal,
          price: String(price),
          copies,
        })
      }
      await printBytes(bytes)
      toast.success(`${copies} label(s) printed`)
      closeModal(PRINT_MODAL_ID)
    } catch (err) {
      setError(err.message)
    } finally {
      setPrinting(false)
    }
  }

  if (!product) return null
  const price = product[priceField] ?? 0

  return (
    <Modal id={PRINT_MODAL_ID} title={t('printLabel')} size="lg">
      <div class="space-y-4">

        {error && <div class="alert alert-error text-sm py-2"><span>{error}</span></div>}

        {!hasPrinter && (
          <div class="alert alert-warning text-sm py-2">
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{t('connectPrinter') || 'Connect a printer first'}</span>
          </div>
        )}

        {/* Label model selector */}
        <div>
          <p class="label-text text-xs font-medium mb-1.5">{t('labelModel') || 'Label model'}</p>
          <div class="grid grid-cols-3 gap-2">
            {LABEL_MODELS.map(m => (
              <button
                key={m.id}
                class={`btn btn-sm gap-1 ${model === m.id ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setModel(m.id)}
              >
                <span>{m.icon}</span>
                <span class="text-xs">{
                  m.id === 'standard' ? (t('labelStandard') || 'Standard') :
                  m.id === '45x35' ? '45×35' :
                  m.id === '40x20' ? '40×20' :
                  m.id === 'optic' ? (t('labelOptic') || 'Optic') :
                  (t('labelBijou') || 'Bijou')
                }</span>
              </button>
            ))}
          </div>
        </div>

        {/* Model description */}
        <div class="text-xs text-base-content/50 bg-base-200/50 rounded-lg px-3 py-2">
          {model === 'standard' && (t('labelStandardDesc') || 'Full thermal label: store name, product, barcode, price')}
          {model === '45x35' && (t('label45x35Desc') || '45×35mm sticker: product name, barcode, price')}
          {model === '40x20' && (t('label40x20Desc') || '40×20mm sticker: compact name, barcode, price')}
          {model === 'optic' && (t('labelOpticDesc') || 'Tiny label (12×7mm) for glasses: ref + price only')}
          {model === 'bijou' && (t('labelBijouDesc') || 'Compact jewelry label: store, product, ref, price')}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p class="label-text text-xs font-medium mb-1">{t('copies')}</p>
            <input type="number" min="1" max="99" class="input input-bordered input-sm w-24"
              value={copies}
              onInput={(e) => setCopies(Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))} />
          </div>

          <div>
            <p class="label-text text-xs font-medium mb-1">{t('price')}</p>
            <select class="select select-bordered select-sm w-full" value={priceField}
              onChange={(e) => setPriceField(e.target.value)}>
              <option value="prix_vente_1">{t('prixVente1')} ({product.prix_vente_1})</option>
              <option value="prix_vente_2">{t('prixVente2')} ({product.prix_vente_2})</option>
              <option value="prix_vente_3">{t('prixVente3')} ({product.prix_vente_3})</option>
            </select>
          </div>

          {model === 'standard' && (product.barcodes?.length > 1) && (
            <div>
              <p class="label-text text-xs font-medium mb-1">{t('barcode')}</p>
              <select class="select select-bordered select-sm w-full" value={barcodeVal}
                onChange={(e) => setBarcodeVal(e.target.value)}>
                {product.barcodes.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Preview */}
        <div class="border border-base-300 rounded-lg p-3 text-center bg-base-50">
          <p class="text-xs text-base-content/40 mb-2">{t('preview')}</p>

          {model === 'standard' && (
            <div class="inline-flex flex-col items-center border-2 border-dashed border-base-300 rounded p-2 gap-0.5 w-44 min-h-24">
              {storeName && <span class="text-[9px] text-base-content/50">{storeName}</span>}
              <span class={`font-bold truncate max-w-full leading-tight ${product.name.length > 25 ? 'text-[9px]' : 'text-xs'}`}>{product.name}</span>
              {barcodeVal && <BarcodePreview value={barcodeVal} />}
              <span class="text-sm font-bold">{price}</span>
            </div>
          )}

          {model === '45x35' && (
            <div class="inline-flex flex-col items-center border-2 border-dashed border-base-300 rounded p-2 gap-0.5 w-44 min-h-24">
              <span class="text-[9px] font-bold truncate max-w-full">{product.name}</span>
              {barcodeVal && <BarcodePreview value={barcodeVal} />}
              <span class="text-sm font-bold">{price}</span>
            </div>
          )}

          {model === '40x20' && (
            <div class="inline-flex flex-col items-center border-2 border-dashed border-base-300 rounded p-1.5 gap-0 w-36 min-h-16">
              <span class="text-[7px] font-bold truncate max-w-full">{product.name}</span>
              {barcodeVal && <BarcodePreview value={barcodeVal} />}
              <span class="text-[10px] font-bold">{price}</span>
            </div>
          )}

          {model === 'optic' && (
            <div class="inline-flex flex-col items-center border-2 border-dashed border-base-300 rounded px-2 py-1 gap-0 w-24 min-h-10">
              <span class="text-[8px] text-base-content/60 truncate max-w-full">{product.ref || barcodeVal}</span>
              <span class="text-xs font-bold">{price}</span>
            </div>
          )}

          {model === 'bijou' && (
            <div class="inline-flex flex-col items-center border-2 border-dashed border-base-300 rounded px-2 py-1.5 gap-0.5 w-32 min-h-16">
              {storeName && <span class="text-[7px] text-base-content/40">{storeName}</span>}
              <span class={`font-bold truncate max-w-full leading-tight ${product.name.length > 20 ? 'text-[8px]' : 'text-[10px]'}`}>{product.name}</span>
              {product.ref && <span class="text-[8px] text-base-content/50">{product.ref}</span>}
              <span class="text-xs font-bold">{price}</span>
            </div>
          )}

          <p class="text-xs text-base-content/40 mt-1">
            {model === '45x35' ? '45×35mm' : model === '40x20' ? '40×20mm' : model === 'optic' ? '12×7mm' : model === 'bijou' ? 'Compact' : '80mm'} · {copies} {t('copies')}
          </p>
        </div>

        <div class="modal-action">
          <button
            type="button"
            class={`btn btn-primary btn-sm gap-1.5 ${printing ? 'loading' : ''}`}
            onClick={handlePrint}
            disabled={printing || !hasPrinter}
          >
            {!printing && (
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
            )}
            {t('print')}
          </button>
        </div>

      </div>
    </Modal>
  )
}
