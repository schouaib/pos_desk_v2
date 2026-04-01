import { useI18n } from '../lib/i18n'

export function Pagination({ page, pages, total, limit, onPageChange }) {
  const { t } = useI18n()
  if (!total || total <= 0) return null

  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

  const btns = []
  const wing = 2
  let s = Math.max(1, page - wing)
  let e = Math.min(pages, page + wing)
  if (s > 1) { btns.push(1); if (s > 2) btns.push('...') }
  for (let i = s; i <= e; i++) btns.push(i)
  if (e < pages) { if (e < pages - 1) btns.push('...'); btns.push(pages) }

  return (
    <div class="flex items-center justify-between mt-4 text-sm">
      <span class="text-base-content/80">{t('showing')} {start}–{end} {t('of')} {total}</span>
      <div class="join">
        <button class="join-item btn btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>«</button>
        {btns.map((b, i) =>
          b === '...'
            ? <button key={`d${i}`} class="join-item btn btn-sm btn-disabled">...</button>
            : <button key={b} class={`join-item btn btn-sm ${b === page ? 'btn-active' : ''}`} onClick={() => onPageChange(b)}>{b}</button>
        )}
        <button class="join-item btn btn-sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>»</button>
      </div>
    </div>
  )
}
