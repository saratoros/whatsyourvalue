/**
 * Decode the first usable frame from a video File/Blob as ImageBitmap for the same pipeline as photos.
 */
export async function extractVideoFrameBitmap(file) {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('muted', '')
    video.preload = 'auto'
    video.src = url

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('video-metadata'))
      video.load()
    })

    let w = video.videoWidth
    let h = video.videoHeight
    // Some codecs (e.g. phone MOV) only populate dimensions after decode kicks in.
    try {
      await video.play()
      video.pause()
      w = video.videoWidth
      h = video.videoHeight
    } catch {
      // ignore — seek path may still work
    }
    if (!w || !h) throw new Error('video-no-size')

    const seekTo =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(0.15, video.duration * 0.05)
        : 0

    if (seekTo > 0) {
      await new Promise((resolve, reject) => {
        const done = () => {
          video.removeEventListener('seeked', done)
          video.removeEventListener('error', onErr)
          resolve()
        }
        const onErr = () => {
          video.removeEventListener('seeked', done)
          video.removeEventListener('error', onErr)
          reject(new Error('video-seek'))
        }
        video.addEventListener('seeked', done, { once: true })
        video.addEventListener('error', onErr, { once: true })
        video.currentTime = seekTo
      })
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('video-no-2d')
    ctx.drawImage(video, 0, 0)

    const bmp = await createImageBitmap(canvas)
    return bmp
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * JPEG object URL for dropzone thumbnail (videos cannot use <img src="blob:video"> reliably).
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
