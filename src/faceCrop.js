const MEDIAPIPE_PKG_VERSION = '0.10.21'
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_PKG_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

/** Max dimension for detection input (speed); box mapped back to full resolution. */
const MAX_DETECT_DIM = 1024
/** Expand face box by this fraction of max(faceW, faceH). */
const PADDING_FRAC = 0.28

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
        minDetectionConfidence: 0.5,
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
 * Detect main face, crop to square with padding. Returns null if none / error (caller keeps full image).
 * @param {ImageBitmap | HTMLImageElement} source
 * @returns {Promise<ImageBitmap | null>}
 */
export async function extractFaceCrop(source) {
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

  try {
    return await createImageBitmap(source, sx, sy, s, s)
  } catch {
    return null
  }
}
