export function Skeleton({ w, h, rounded, className = '' }) {
  const style = {}
  if (w) style.width = typeof w === 'number' ? `${w}rem` : w
  if (h) style.height = typeof h === 'number' ? `${h}rem` : h
  return <div class={`skeleton ${rounded ? 'rounded-full' : ''} ${className}`} style={style} />
}

export function SkeletonRow({ cols = 4 }) {
  return (
    <tr>
      {Array.from({ length: cols }, (_, i) => (
        <td key={i} class="px-3 py-2.5">
          <Skeleton h={0.75} w={i === 0 ? '70%' : '50%'} />
        </td>
      ))}
    </tr>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <tbody>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </tbody>
  )
}

export function SkeletonCard() {
  return (
    <div class="card bg-base-100 p-4">
      <div class="flex items-center gap-3 mb-3">
        <Skeleton w={2.5} h={2.5} rounded />
        <Skeleton h={0.75} w="60%" />
      </div>
      <Skeleton h={1.5} w="40%" className="mb-2" />
      <Skeleton h={0.625} w="80%" />
    </div>
  )
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} class="card bg-base-100 p-4">
          <div class="flex items-center gap-3">
            <Skeleton w={2.5} h={2.5} rounded />
            <div class="flex-1">
              <Skeleton h={0.625} w="60%" className="mb-2" />
              <Skeleton h={1.25} w="45%" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
