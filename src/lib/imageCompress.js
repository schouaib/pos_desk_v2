const MAX_DIM = 800
const MAX_BYTES = 1024 * 1024 // 1 MB
const QUALITIES = [0.85, 0.75, 0.65, 0.5, 0.35]

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let { width, height } = img
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) {
          height = Math.round((height / width) * MAX_DIM)
          width = MAX_DIM
        } else {
          width = Math.round((width / height) * MAX_DIM)
          height = MAX_DIM
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      let idx = 0
      function tryNext() {
        const quality = QUALITIES[idx]
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Compression failed')); return }
            if (blob.size <= MAX_BYTES || idx === QUALITIES.length - 1) {
              resolve(blob)
            } else {
              idx++
              tryNext()
            }
          },
          'image/webp',
          quality,
        )
      }
      tryNext()
    }

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Invalid image')) }
    img.src = objectUrl
  })
}
