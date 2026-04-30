const MEDIAPIPE_PKG_VERSION = '0.10.21'
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_PKG_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

/** Max dimension for detection input (speed); box mapped back to full resolution. */
const MAX_DETECT_DIM = 1024
/** Expand face box by this fraction of max(faceW, faceH). */
const PADDING_FRAC = 0.28

/** If the square crop would already span ≥ this fraction of the shorter side, keep full image. */
const TIGHT_FRAME_FRAC = 0.9

/**
 * Sample alpha outside an expanded face rect on a downscaled copy.
 * Many transparent pixels outside the face ⇒ sticker/cutout (“no background”) — keep full image.
 */
function transparentOutsideFaceDominates(
  source,
  iw,
  ih,
  ox,
  oy,
  bw,
  bh,
  padFrac,
) {
  const maxDim = 384
  const sc = Math.min(1, maxDim / Math.max(iw, ih))
  const sw = Math.max(1, Math.round(iw * sc))
  const sh = Math.max(1, Math.round(ih * sc))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.drawImage(source, 0, 0, sw, sh)

  let imageData
  try {
    imageData = ctx.getImageData(0, 0, sw, sh)
  } catch {
    return false
  }
  const data = imageData.data

  const fx = ox * sc
  const fy = oy * sc
  const fw = bw * sc
  const fh = bh * sc
  const pad = padFrac * Math.max(fw, fh)
  const innerX0 = fx - pad
  const innerY0 = fy - pad
  const innerX1 = fx + fw + pad
  const innerY1 = fy + fh + pad

  const step = Math.max(2, Math.floor(Math.min(sw, sh) / 96))
  let outside = 0
  let transparentOutside = 0

  for (let y = 0; y < sh; y += step) {
    for (let x = 0; x < sw; x += step) {
      const cx = x + step * 0.5
      const cy = y + step * 0.5
      if (
        cx >= innerX0 &&
        cx <= innerX1 &&
        cy >= innerY0 &&
        cy <= innerY1
      ) {
        continue
      }
      outside += 1
      const i = (Math.min(sh - 1, y) * sw + Math.min(sw - 1, x)) * 4
      if (data[i + 3] < 28) transparentOutside += 1
    }
  }

  if (outside === 0) return false
  if (outside < 48) return transparentOutside / outside > 0.5
  return transparentOutside / outside > 0.38
}

/** Avoid infinite spinner if WASM/model/network stalls. */
const CROP_TIMEOUT_MS = 16_000

/** @type {Promise<import('@mediapipe/tasks-vision').FaceDetector> | null} */
let detectorPromise = null

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        // Slightly lower threshold so faces still register on busy / cluttered backgrounds.
        minDetectionConfidence: 0.38,
      })
    })()
  }
  return detectorPromise
}

/**
 * @param {ImageBitmap | HTMLImageElement} source
 */
function readSize(source) {
  if (source instanceof HTMLImageElement) {
    return {
      w: source.naturalWidth || source.width,
      h: source.naturalHeight || source.height,
    }
  }
  return { w: source.width, h: source.height }
}

/**
 * @param {import('@mediapipe/tasks-vision').BoundingBox | undefined} box
 */
function boxArea(box) {
  if (!box) return 0
  return Math.max(0, box.width) * Math.max(0, box.height)
}

/**
 * @param {ImageBitmap | HTMLImageElement} source
 * @returns {Promise<ImageBitmap | null>}
 */
async function extractFaceCropInner(source) {
  // #region agent log
  const t0 = Date.now()
  fetch('http://127.0.0.1:7288/ingest/f3a06ad6-c19e-4494-9187-05bd4710398e', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'a0240a',
    },
    body: JSON.stringify({
      sessionId: 'a0240a',
      hypothesisId: 'H3',
      location: 'faceCrop.js:extractFaceCropInner:entry',
      message: 'crop_inner_start',
      data: { w: readSize(source).w, h: readSize(source).h },
      timestamp: t0,
    }),
  }).catch(() => {})
  // #endregion
  const { w: iw, h: ih } = readSize(source)
  if (iw < 32 || ih < 32) return null

  const scale = Math.min(1, MAX_DETECT_DIM / Math.max(iw, ih))
  const cw = Math.max(1, Math.round(iw * scale))
  const ch = Math.max(1, Math.round(ih * scale))

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, cw, ch)

  let detector
  try {
    detector = await getDetector()
  } catch {
    return null
  }

  let result
  try {
    result = detector.detect(canvas)
  } catch {
    return null
  }

  const dets = result.detections?.filter((d) => d.boundingBox) ?? []
  // #region agent log
  fetch('http://127.0.0.1:7288/ingest/f3a06ad6-c19e-4494-9187-05bd4710398e', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'a0240a',
    },
    body: JSON.stringify({
      sessionId: 'a0240a',
      hypothesisId: 'H3',
      location: 'faceCrop.js:after_detect',
      message: 'mediapipe_detect',
      data: { detCount: dets.length, ms: Date.now() - t0 },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  if (!dets.length) return null

  let best = dets[0]
  let bestA = boxArea(best.boundingBox)
  for (let i = 1; i < dets.length; i += 1) {
    const a = boxArea(dets[i].boundingBox)
    if (a > bestA) {
      best = dets[i]
      bestA = a
    }
  }

  const b = best.boundingBox
  if (!b) return null

  const inv = 1 / scale
  const ox = b.originX * inv
  const oy = b.originY * inv
  const bw = b.width * inv
  const bh = b.height * inv
  const faceCx = ox + bw / 2
  const faceCy = oy + bh / 2
  const pad = PADDING_FRAC * Math.max(bw, bh)
  let side = Math.max(bw + 2 * pad, bh + 2 * pad)
  side = Math.min(side, iw, ih)

  let x0 = faceCx - side / 2
  let y0 = faceCy - side / 2
  x0 = Math.max(0, Math.min(x0, iw - side))
  y0 = Math.max(0, Math.min(y0, ih - side))

  const sx = Math.round(x0)
  const sy = Math.round(y0)
  const s = Math.floor(side)

  if (s < 32) return null

  const shortSide = Math.min(iw, ih)
  const cropAlreadyFullFrame = s >= Math.floor(TIGHT_FRAME_FRAC * shortSide)
  const cutoutNoBackground = transparentOutsideFaceDominates(
    source,
    iw,
    ih,
    ox,
    oy,
    bw,
    bh,
    PADDING_FRAC,
  )

  // Face + no meaningful background / already framed → full image (caller keeps source).
  if (cropAlreadyFullFrame || cutoutNoBackground) return null

  try {
    return await createImageBitmap(source, sx, sy, s, s)
  } catch {
    return null
  }
}

/**
 * Face + opaque surroundings → square crop around face.
 * Face + transparent cutout or already tight headshot → null (use full image).
 * No face → null (use full image).
 * @param {ImageBitmap | HTMLImageElement} source
 * @returns {Promise<ImageBitmap | null>}
 */
export async function extractFaceCrop(source) {
  try {
    return await Promise.race([
      extractFaceCropInner(source),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('face-crop-timeout')), CROP_TIMEOUT_MS)
      }),
    ])
  } catch {
    return null
  }
}
