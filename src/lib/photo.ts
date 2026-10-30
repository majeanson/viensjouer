// A photo from the phone's camera is 4–12 MB; the server takes 3 MB. Shrink it HERE to a
// 1600 px JPEG (≈ 300 KB) before it leaves the device. Throws when the browser cannot
// decode the file (an unsupported HEIC on a desktop browser, say) — the caller shows a line.
const MAX_SIDE = 1600

export function fitSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

// The file is decoded by an <img>, not createImageBitmap: every current browser turns a phone photo upright by itself that way, while
// Safari's createImageBitmap(..., { imageOrientation }) can hand back a bitmap whose size and pixels disagree (the top of the picture blank).
async function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function resizeToJpeg(file: File): Promise<Blob> {
  const img = await decode(file)
  const { w, h } = fitSize(img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  // JPEG has no transparency: a see-through PNG would turn black, so it goes onto white.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
  if (!blob) throw new Error('encode')
  return blob
}

// A face: a centred square crop, shrunk to 256 px, as a JPEG (a few kilobytes). The server caps it at 400 KB.
export async function resizeToSquare(file: File, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
  bmp.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
  if (!blob) throw new Error('encode')
  return blob
}
