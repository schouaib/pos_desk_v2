import { useState, useEffect, useRef } from 'preact/hooks'
import { Modal, closeModal } from './Modal'
import { useI18n } from '../lib/i18n'

export const PRINT_MODAL_ID = 'print-label-modal'

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function BarcodePreview({ value }) {
  const ref = useRef()
  useEffect(() => {
    if (!ref.current || !value) return
    import('jsbarcode').then((m) => {
      const JsBarcode = m.default
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128',
          width: 1.2,
          height: 36,
          displayValue: true,
          fontSize: 9,
          margin: 2,
        })
      } catch {}
    })
  }, [value])
  if (!value) return null
  return <svg ref={ref} class="max-w-full" />
}

export function PrintLabelModal({ product }) {
  const { t } = useI18n()
  const [format, setFormat]         = useState('45x35')
  const [copies, setCopies]         = useState(1)
  const [priceField, setPriceField] = useState('prix_vente_1')
  const [barcodeVal, setBarcodeVal] = useState('')
  const [printing, setPrinting]     = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (!product) return
    setBarcodeVal(product.barcodes?.[0] || product.ref || '')
    setError('')
  }, [product])

  function handlePrint() {
    setError('')
    setPrinting(true)
    try {
      const price = product[priceField] ?? 0
      const [w, h] = format.split('x').map(Number)
      const safeName = esc(product.name)
      const safePrice = esc(price)

      const labels = Array.from({ length: copies }, (_, i) => `
        <div class="print-label">
          <div class="print-label-name">${safeName}</div>
          ${barcodeVal ? `<svg class="print-label-bc" id="print-bc-${i}"></svg>` : ''}
          <div class="print-label-price">${safePrice}</div>
        </div>`).join('')

      // Inject print-only content + style into the page
      const container = document.createElement('div')
      container.id = 'print-label-container'
      container.innerHTML = labels

      const style = document.createElement('style')
      style.id = 'print-label-style'
      style.textContent = `
        @media print {
          body > *:not(#print-label-container) { display: none !important; }
          #print-label-container { display: block !important; }
          @page { size: ${w}mm ${h}mm; margin: 0; }
        }
        @media screen {
          #print-label-container { display: none; }
        }
        .print-label {
          width: ${w}mm; height: ${h}mm;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 1mm; page-break-after: always; font-family: Arial, sans-serif;
        }
        .print-label:last-child { page-break-after: auto; }
        .print-label-name {
          font-size: ${format === '40x20' ? '7pt' : '9pt'}; font-weight: bold;
          text-align: center; max-width: 100%; overflow: hidden;
          white-space: nowrap; text-overflow: ellipsis;
        }
        .print-label-bc { max-width: 90%; }
        .print-label-price { font-size: ${format === '40x20' ? '10pt' : '13pt'}; font-weight: bold; }
      `

      document.head.appendChild(style)
      document.body.appendChild(container)

      // Render barcodes then print
      import('jsbarcode').then((m) => {
        const JsBarcode = m.default
        try {
          for (let i = 0; i < copies; i++) {
            const el = document.getElementById('print-bc-' + i)
            if (el) JsBarcode(el, barcodeVal, {
              format: 'CODE128', width: 1.5, height: format === '40x20' ? 28 : 45,
              displayValue: true, fontSize: 8, margin: 1, textMargin: 0
            })
          }
        } catch {}

        setTimeout(() => {
          window.print()
          // Cleanup after print dialog closes
          setTimeout(() => {
            container.remove()
            style.remove()
          }, 500)
          closeModal(PRINT_MODAL_ID)
        }, 100)
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setPrinting(false)
    }
  }

  if (!product) return null

  const price = product[priceField] ?? 0

  return (
    <Modal id={PRINT_MODAL_ID} title={t('printLabel')}>
      <div class="space-y-4">

        {error && <div class="alert alert-error text-sm py-2"><span>{error}</span></div>}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p class="label-text text-xs font-medium mb-1">{t('labelFormat')}</p>
            <div class="flex flex-col gap-1">
              {['40x20', '45x35'].map((f) => (
                <label key={f} class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" class="radio radio-sm radio-primary" name="lbl-format"
                    checked={format === f} onChange={() => setFormat(f)} />
                  <span class="text-sm">{f} mm</span>
                </label>
              ))}
            </div>
          </div>

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

          {(product.barcodes?.length > 1) && (
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

        <div class="border border-base-300 rounded-lg p-3 text-center bg-base-50">
          <p class="text-xs text-base-content/40 mb-2">{t('preview')}</p>
          <div class={`inline-flex flex-col items-center border-2 border-dashed border-base-300 rounded p-2 gap-0.5
            ${format === '40x20' ? 'w-36 min-h-16' : 'w-44 min-h-24'}`}>
            <span class="text-xs font-bold truncate max-w-full leading-tight">{product.name}</span>
            {barcodeVal && <BarcodePreview value={barcodeVal} />}
            <span class="text-sm font-bold">{price}</span>
          </div>
          <p class="text-xs text-base-content/40 mt-1">{format} mm · {copies} {t('copies')}</p>
        </div>

        <div class="modal-action">
          <button
            type="button"
            class={`btn btn-primary btn-sm ${printing ? 'loading' : ''}`}
            onClick={handlePrint}
            disabled={printing}
          >
            {t('print')}
          </button>
        </div>

      </div>
    </Modal>
  )
}
