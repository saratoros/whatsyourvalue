/**
 * JPEG object URL from an ImageBitmap (e.g. dropzone thumbnail, manual crop source).
 */
export async function imageBitmapToJpegObjectURL(bitmap, quality = 0.85) {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0)
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) return null
  return URL.createObjectURL(blob)
}
