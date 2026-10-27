// A photo from the phone's camera is 4–12 MB; the server takes 3 MB. Shrink it HERE to a
// 1600 px JPEG (≈ 300 KB) before it leaves the device. Throws when the browser cannot
// decode the file (an unsupported HEIC on a desktop browser, say) — the caller shows a line.
const MAX_SIDE = 1600

export function fitSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

export async function resizeToJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { w, h } = fitSize(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
  if (!blob) throw new Error('encode')
  return blob
}
