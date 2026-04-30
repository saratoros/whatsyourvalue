/** Longest edge cap before segmentation (memory + speed on mobile). */
const MAX_SEGMENT_DIM = 1536

/**
 * Client-side background removal (@imgly/background-removal). No API key.
 * @param {ImageBitmap} bitmap
 * @returns {Promise<ImageBitmap | null>} New bitmap, or null on failure (caller keeps original).
 */
export async function removeBackgroundFromBitmap(bitmap) {
  let scaled = null
  try {
    const { removeBackground } = await import('@imgly/background-removal')
    let src = bitmap
    const maxDim = Math.max(bitmap.width, bitmap.height)
    if (maxDim > MAX_SEGMENT_DIM) {
      const sc = MAX_SEGMENT_DIM / maxDim
      const w = Math.round(bitmap.width * sc)
      const h = Math.round(bitmap.height * sc)
      scaled = await createImageBitmap(bitmap, {
        resizeWidth: w,
        resizeHeight: h,
        resizeQuality: 'high',
      })
      src = scaled
    }

    const canvas = document.createElement('canvas')
    canvas.width = src.width
    canvas.height = src.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      scaled?.close()
      return null
    }
    ctx.drawImage(src, 0, 0)
    scaled?.close()
    scaled = null

    const pngBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    )
    if (!pngBlob) return null

    const outBlob = await removeBackground(pngBlob, {
      output: { format: 'image/png' },
      model: 'isnet_quint8',
    })
    return await createImageBitmap(outBlob)
  } catch {
    scaled?.close()
    return null
  }
}
