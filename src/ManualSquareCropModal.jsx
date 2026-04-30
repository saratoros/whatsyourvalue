import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'

/**
 * @param {{
 *   open: boolean
 *   imageUrl: string | null
 *   onClose: () => void
 *   onApply: (bitmap: ImageBitmap) => void
 * }} props
 */
export function ManualSquareCropModal({ open, imageUrl, onClose, onApply }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState(null)

  const onCropComplete = useCallback((_, croppedAreaPixels) => {
    setPixels(croppedAreaPixels)
  }, [])

  const handleApply = useCallback(async () => {
    if (!pixels || !imageUrl) return
    const img = new Image()
    img.decoding = 'async'
    img.src = imageUrl
    await new Promise((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('crop-image-load'))
    })
    const canvas = document.createElement('canvas')
    canvas.width = pixels.width
    canvas.height = pixels.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(
      img,
      pixels.x,
      pixels.y,
      pixels.width,
      pixels.height,
      0,
      0,
      pixels.width,
      pixels.height,
    )
    const bmp = await createImageBitmap(canvas)
    onApply(bmp)
  }, [imageUrl, pixels, onApply])

  if (!open || !imageUrl) return null

  return (
    <div
      className="crop-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-modal-title"
    >
      <div className="crop-modal">
        <h2 id="crop-modal-title" className="crop-modal__title">
          Adjust square crop
        </h2>
        <p className="crop-modal__hint">
          Drag to reframe. Pinch or use the slider to zoom. Output is square.
        </p>
        <div className="crop-modal__viewport">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid={false}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        </div>
        <label className="crop-modal__zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <div className="crop-modal__actions">
          <button type="button" className="crop-modal__btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="crop-modal__btn crop-modal__btn--primary"
            onClick={() => void handleApply()}
          >
            Apply crop
          </button>
        </div>
      </div>
    </div>
  )
}
