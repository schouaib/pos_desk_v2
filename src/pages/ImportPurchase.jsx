import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { route } from 'preact-router'

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif'

export default function ImportPurchase({ path }) {
  const { t } = useI18n()
  const fileInputRef = useRef(null)

  const [step, setStep] = useState('upload')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [parseResult, setParseResult] = useState(null)
  const [lines, setLines] = useState([])
  const [supplierID, setSupplierID] = useState('')
  const [supplierInvoice, setSupplierInvoice] = useState('')
  const [note, setNote] = useState('')
  const [suppliers, setSuppliers] = useState([])
  const [confirmResult, setConfirmResult] = useState(null)

  useEffect(() => {
    api.listSuppliers().then(r => setSuppliers(r || [])).catch(() => {})
  }, [])

  const handleFileSelect = useCallback((e) => {
    e.preventDefault()
    const f = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0]
    if (f) setFile(f)
  }, [])

  const handleParse = useCallback(async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const result = await api.parsePurchaseDocument(file)
      setParseResult(result)
      setLines((result.lines || []).map((l, i) => ({
        _idx: i,
        product_id: l.product_id || '',
        product_name: l.product_name || '',
        name: l.name || '',
        barcode: l.barcode || '',
        qty: l.qty || 0,
        prix_achat: l.unit_price || 0,
        prix_vente_1: 0,
        vat: l.vat || 19,
        is_new: l.is_new,
        confidence: l.confidence || 0,
        candidates: l.candidates || [],
        skip: false,
      })))
      if (result.document && result.document.supplier_invoice) {
        setSupplierInvoice(result.document.supplier_invoice)
      }
      setStep('review')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [file])

  const updateLine = useCallback((idx, field, value) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }, [])

  const handleConfirm = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const body = {
        supplier_id: supplierID,
        supplier_invoice: supplierInvoice,
        note: note || (t('importedFromDocument') + ': ' + (file ? file.name : '')),
        lines: lines.map(l => ({
          product_id: l.is_new ? '' : l.product_id,
          name: l.is_new ? l.name : (l.product_name || l.name),
          barcode: l.barcode,
          qty: l.qty,
          prix_achat: l.prix_achat,
          prix_vente_1: l.is_new ? l.prix_vente_1 : 0,
          vat: 19,
          skip: l.skip,
        })),
      }
      const result = await api.confirmPurchaseImport(body)
      setConfirmResult(result)
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [lines, supplierID, supplierInvoice, note, file, t])

  const activeLines = lines.filter(l => !l.skip)
  const newCount = activeLines.filter(l => l.is_new).length
  const matchedCount = activeLines.filter(l => !l.is_new).length

  return (
    <Layout currentPath={path}>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">{t('importPurchaseDoc') || 'Import Document'}</h2>
        <button class="btn btn-ghost btn-sm" onClick={() => route('/purchases')}>
          {t('backToPurchases') || 'Back'}
        </button>
      </div>

      {/* Steps */}
      <ul class="steps steps-horizontal w-full mb-8">
        <li class={'step' + (step === 'upload' || step === 'review' || step === 'done' ? ' step-primary' : '')}>{t('upload') || 'Upload'}</li>
        <li class={'step' + (step === 'review' || step === 'done' ? ' step-primary' : '')}>{t('reviewLines') || 'Review'}</li>
        <li class={'step' + (step === 'done' ? ' step-primary' : '')}>{t('confirm') || 'Confirm'}</li>
      </ul>

      {error && (
        <div class="alert alert-error mb-4">
          <span>{error}</span>
          <button class="btn btn-ghost btn-xs" onClick={() => setError('')}>x</button>
        </div>
      )}

      {/* STEP 1: Upload */}
      {step === 'upload' && (
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body items-center text-center">
            <div
              class="w-full border-2 border-dashed border-base-300 rounded-xl p-12 cursor-pointer hover:border-primary transition-colors"
              onDrop={handleFileSelect}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                class="hidden"
                onChange={handleFileSelect}
              />
              <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-base-content/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p class="text-lg font-medium mb-1">
                {file ? file.name : (t('dropDocumentHere') || 'Drop your invoice here (PDF or image)')}
              </p>
              <p class="text-sm text-base-content/60">
                PDF, JPG, PNG — {t('maxSize') || 'Max'} 10MB
              </p>
            </div>

            {file && (
              <div class="mt-4 flex gap-2">
                <button class="btn btn-primary" onClick={handleParse} disabled={loading}>
                  {loading && <span class="loading loading-spinner loading-sm"></span>}
                  {t('analyzeDocument') || 'Analyze Document'}
                </button>
                <button class="btn btn-ghost" onClick={() => { setFile(null); setError('') }}>
                  {t('cancel') || 'Cancel'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Review */}
      {step === 'review' && parseResult && (
        <div>
          {/* Warnings */}
          {parseResult.document && parseResult.document.warnings && parseResult.document.warnings.length > 0 && (
            <div class="alert alert-warning mb-4">
              <div>
                {parseResult.document.warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            </div>
          )}

          {/* Stats */}
          <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="bg-base-100 rounded-lg p-3 shadow-sm text-center">
              <div class="text-sm text-base-content/60">{t('totalLines') || 'Total Lines'}</div>
              <div class="text-xl font-bold">{activeLines.length}</div>
            </div>
            <div class="bg-base-100 rounded-lg p-3 shadow-sm text-center">
              <div class="text-sm text-base-content/60">{t('matchedProducts') || 'Matched'}</div>
              <div class="text-xl font-bold text-success">{matchedCount}</div>
            </div>
            <div class="bg-base-100 rounded-lg p-3 shadow-sm text-center">
              <div class="text-sm text-base-content/60">{t('newProducts') || 'New'}</div>
              <div class="text-xl font-bold text-warning">{newCount}</div>
            </div>
          </div>

          {/* Supplier & Invoice info */}
          <div class="bg-base-100 rounded-lg shadow-sm p-4 mb-4">
            <h3 class="font-semibold mb-2">{t('purchaseInfo') || 'Purchase Info'}</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="label label-text text-xs">{t('supplier') || 'Supplier'}</label>
                <select class="select select-bordered select-sm w-full" value={supplierID} onChange={e => setSupplierID(e.target.value)}>
                  <option value="">{t('anonymousSupplier') || 'Fournisseur Anonyme'}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <p class="text-xs text-base-content/50 mt-1">{t('supplierCanBeChangedLater') || 'Peut être modifié après'}</p>
              </div>
              <div>
                <label class="label label-text text-xs">{t('supplierInvoice') || 'Supplier Invoice'}</label>
                <input type="text" class="input input-bordered input-sm w-full" value={supplierInvoice} onInput={e => setSupplierInvoice(e.target.value)} />
              </div>
              <div>
                <label class="label label-text text-xs">{t('note') || 'Note'}</label>
                <input type="text" class="input input-bordered input-sm w-full" value={note} onInput={e => setNote(e.target.value)} placeholder={t('optionalNote') || 'Optional note...'} />
              </div>
            </div>
          </div>

          {/* Lines table */}
          <div class="bg-base-100 rounded-lg shadow-sm p-2 mb-4">
            <div class="overflow-x-auto">
              <table class="table table-xs">
                <thead>
                  <tr>
                    <th class="w-8"></th>
                    <th>{t('status') || 'Status'}</th>
                    <th>{t('productName') || 'Product'}</th>
                    <th>{t('barcode') || 'Barcode'}</th>
                    <th class="text-right">{t('qty') || 'Qty'}</th>
                    <th class="text-right">{t('prixAchat') || 'PA'}</th>
                    <th class="text-right">{t('prixVente') || 'PV'}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} class={l.skip ? 'opacity-40' : ''}>
                      <td>
                        <input type="checkbox" class="checkbox checkbox-xs" checked={!l.skip} onChange={() => updateLine(i, 'skip', !l.skip)} />
                      </td>
                      <td>
                        {l.is_new ? (
                          <span class="badge badge-warning badge-xs">{t('new') || 'New'}</span>
                        ) : l.confidence >= 80 ? (
                          <span class="badge badge-success badge-xs">{l.confidence}%</span>
                        ) : l.confidence >= 50 ? (
                          <span class="badge badge-info badge-xs">{l.confidence}%</span>
                        ) : (
                          <span class="badge badge-error badge-xs">{l.confidence}%</span>
                        )}
                      </td>
                      <td>
                        {l.is_new ? (
                          <input type="text" class="input input-bordered input-xs w-full min-w-[180px]"
                            value={l.name}
                            onInput={e => updateLine(i, 'name', e.target.value)}
                            disabled={l.skip} />
                        ) : l.candidates && l.candidates.length > 1 ? (
                          <select class="select select-bordered select-xs w-full min-w-[180px]"
                            value={l.product_id} disabled={l.skip}
                            onChange={e => {
                              const sel = l.candidates.find(c => c.product_id === e.target.value)
                              if (sel) {
                                setLines(prev => prev.map((ll, ii) => ii === i ? {
                                  ...ll, product_id: sel.product_id, product_name: sel.product_name, confidence: sel.confidence
                                } : ll))
                              } else if (e.target.value === '__new__') {
                                setLines(prev => prev.map((ll, ii) => ii === i ? {
                                  ...ll, product_id: '', product_name: '', is_new: true, confidence: 0
                                } : ll))
                              }
                            }}>
                            {l.candidates.map(c => (
                              <option key={c.product_id} value={c.product_id}>
                                {c.product_name} ({c.confidence}%)
                              </option>
                            ))}
                            <option value="__new__">-- {t('new') || 'Create new'} --</option>
                          </select>
                        ) : (
                          <div>
                            <span class="text-sm">{l.product_name || l.name}</span>
                            {l.candidates && l.candidates.length === 1 && (
                              <button class="btn btn-ghost btn-xs ms-1" onClick={() => {
                                setLines(prev => prev.map((ll, ii) => ii === i ? {
                                  ...ll, product_id: '', product_name: '', is_new: true, confidence: 0
                                } : ll))
                              }}>x</button>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <input type="text" class="input input-bordered input-xs w-20" value={l.barcode}
                          onInput={e => updateLine(i, 'barcode', e.target.value)} disabled={l.skip} />
                      </td>
                      <td class="text-right">
                        <input type="number" class="input input-bordered input-xs w-16 text-right" value={l.qty}
                          onInput={e => updateLine(i, 'qty', parseFloat(e.target.value) || 0)} disabled={l.skip} min="0" step="1" />
                      </td>
                      <td class="text-right">
                        <input type="number" class="input input-bordered input-xs w-24 text-right" value={l.prix_achat}
                          onInput={e => updateLine(i, 'prix_achat', parseFloat(e.target.value) || 0)} disabled={l.skip} min="0" step="0.01" />
                      </td>
                      <td class="text-right">
                        {l.is_new ? (
                          <input type="number" class="input input-bordered input-xs w-24 text-right" value={l.prix_vente_1}
                            onInput={e => updateLine(i, 'prix_vente_1', parseFloat(e.target.value) || 0)} disabled={l.skip} min="0" step="0.01"
                            placeholder="PV" />
                        ) : (
                          <span class="text-xs text-base-content/40">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Raw text */}
          <details class="collapse collapse-arrow bg-base-100 shadow-sm mb-4">
            <summary class="collapse-title text-sm font-medium">{t('rawExtractedText') || 'Raw Text'}</summary>
            <div class="collapse-content">
              <pre class="text-xs whitespace-pre-wrap bg-base-200 p-3 rounded-lg max-h-60 overflow-auto">{parseResult.document ? parseResult.document.raw_text : ''}</pre>
            </div>
          </details>

          {/* Actions */}
          <div class="flex justify-between">
            <button class="btn btn-ghost" onClick={() => { setStep('upload'); setFile(null); setParseResult(null) }}>
              {t('back') || 'Back'}
            </button>
            <button class="btn btn-primary" onClick={handleConfirm} disabled={loading || activeLines.length === 0}>
              {loading && <span class="loading loading-spinner loading-sm"></span>}
              {t('createPurchase') || 'Create Purchase'} ({activeLines.length} {t('lines') || 'lines'})
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Done */}
      {step === 'done' && confirmResult && (
        <div class="bg-base-100 rounded-lg shadow-sm p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-success mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 class="text-xl font-bold mb-4">{t('importSuccess') || 'Import Successful!'}</h2>
          <div class="grid grid-cols-3 gap-3 mb-6 max-w-md mx-auto">
            <div>
              <div class="text-sm text-base-content/60">{t('purchaseRef') || 'Ref'}</div>
              <div class="font-bold">{confirmResult.purchase_ref}</div>
            </div>
            <div>
              <div class="text-sm text-base-content/60">{t('linesImported') || 'Lines'}</div>
              <div class="font-bold">{confirmResult.lines_imported}</div>
            </div>
            <div>
              <div class="text-sm text-base-content/60">{t('productsCreated') || 'New'}</div>
              <div class="font-bold text-warning">{confirmResult.products_created}</div>
            </div>
          </div>
          <div class="flex gap-2 justify-center">
            <button class="btn btn-primary" onClick={() => route('/purchases')}>
              {t('viewPurchases') || 'View Purchases'}
            </button>
            <button class="btn btn-ghost" onClick={() => { setStep('upload'); setFile(null); setParseResult(null); setConfirmResult(null) }}>
              {t('importAnother') || 'Import Another'}
            </button>
          </div>
        </div>
      )}
    </Layout>
  )
}
