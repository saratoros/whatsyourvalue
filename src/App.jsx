import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RadarOverlay } from './RadarOverlay.jsx'
import { WarpCanvas } from './WarpCanvas.jsx'
import {
  WORK_SECTORS,
  compositeScore,
  normalizeCompliant,
  normalizeCreditworthy,
  normalizeHealthy,
  normalizeProductive,
  normalizeVisible,
} from './scoring.js'
import './App.css'
import { extractFaceCrop } from './faceCrop.js'
import { imageBitmapToJpegObjectURL } from './decodeVideoFrame.js'
import { ManualSquareCropModal } from './ManualSquareCropModal.jsx'
import { removeBackgroundFromBitmap } from './removeImageBackground.js'
import { FOLLOWER_MAX_INDEX, FOLLOWER_TIERS } from './followerTiers.js'

const SALARY_OPTIONS = [
  { value: 'lt20', label: '< $20k' },
  { value: '20_50', label: '$20k–50k' },
  { value: '50_100', label: '$50k–100k' },
  { value: '100_200', label: '$100k–200k' },
  { value: '200p', label: '$200k+' },
]

function fmt01(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

/** Object URL for manual crop editor (JPEG). */
async function rasterToJpegObjectUrl(source) {
  if (source instanceof ImageBitmap) {
    return imageBitmapToJpegObjectURL(source)
  }
  if (source instanceof HTMLImageElement) {
    const w = source.naturalWidth || source.width
    const h = source.naturalHeight || source.height
    if (!w || !h) return null
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(source, 0, 0)
    const blob = await new Promise((resolve) =>
      c.toBlob(resolve, 'image/jpeg', 0.92),
    )
    return blob ? URL.createObjectURL(blob) : null
  }
  return null
}

/** CSS var for WebKit range track fill (Firefox uses ::-moz-range-progress). */
function rangeFillStyle(value, min, max) {
  const v = Number(value)
  const lo = Number(min)
  const hi = Number(max)
  if (!Number.isFinite(v) || !(hi > lo)) {
    return { '--range-pct': '0%' }
  }
  const t = (v - lo) / (hi - lo)
  const pct = Math.min(1, Math.max(0, t)) * 100
  return { '--range-pct': `${pct}%` }
}

export default function App() {
  const [credit, setCredit] = useState(0)
  const [ownsHome, setOwnsHome] = useState(false)
  const [igIdx, setIgIdx] = useState(0)
  const [liIdx, setLiIdx] = useState(0)
  const [xfIdx, setXfIdx] = useState(0)
  const [stravaIdx, setStravaIdx] = useState(0)
  const [uber, setUber] = useState(0)
  const [airbnb, setAirbnb] = useState(0)
  const [years, setYears] = useState(0)
  const [salary, setSalary] = useState('lt20')
  const [sector, setSector] = useState('')
  const [closeFriends, setCloseFriends] = useState(0)
  const [marital, setMarital] = useState('single')
  const [steps, setSteps] = useState(0)
  const [tracker, setTracker] = useState(false)
  const [age, setAge] = useState(1)
  const [weightKg, setWeightKg] = useState(30)
  const [stravaKmWeek, setStravaKmWeek] = useState(0)
  const [vo2Known, setVo2Known] = useState(false)
  const [vo2max, setVo2max] = useState(42)
  const [takesVitamins, setTakesVitamins] = useState(false)

  const ig = FOLLOWER_TIERS[igIdx]
  const li = FOLLOWER_TIERS[liIdx]
  const xFollow = FOLLOWER_TIERS[xfIdx]
  const stravaFollowers = FOLLOWER_TIERS[stravaIdx]

  const [faceUrl, setFaceUrl] = useState(null)
  const [faceImage, setFaceImage] = useState(null)
  /** null | 'preparing' | 'background' | 'cropping' */
  const [uploadPhase, setUploadPhase] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [manualCropOpen, setManualCropOpen] = useState(false)
  const [manualCropUrl, setManualCropUrl] = useState(null)
  const loadGenRef = useRef(0)

  const stageRef = useRef(null)
  const [stageSize, setStageSize] = useState(800)

  const nCredit = useMemo(
    () => normalizeCreditworthy(credit, ownsHome),
    [credit, ownsHome],
  )
  const nVis = useMemo(
    () =>
      normalizeVisible(
        ig,
        li,
        xFollow,
        stravaFollowers,
        closeFriends,
        marital,
      ),
    [ig, li, xFollow, stravaFollowers, closeFriends, marital],
  )
  const nComp = useMemo(() => normalizeCompliant(uber, airbnb), [uber, airbnb])
  const nProd = useMemo(
    () => normalizeProductive(years, salary, sector),
    [years, salary, sector],
  )
  const nHealth = useMemo(
    () =>
      normalizeHealthy(
        steps,
        tracker,
        age,
        weightKg,
        stravaKmWeek,
        vo2Known,
        vo2max,
        takesVitamins,
      ),
    [
      steps,
      tracker,
      age,
      weightKg,
      stravaKmWeek,
      vo2Known,
      vo2max,
      takesVitamins,
    ],
  )

  const scores = useMemo(
    () => [nCredit, nVis, nComp, nProd, nHealth],
    [nCredit, nVis, nComp, nProd, nHealth],
  )

  const social = useMemo(
    () => compositeScore(nCredit, nVis, nComp, nProd, nHealth),
    [nCredit, nVis, nComp, nProd, nHealth],
  )

  const onResize = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    const w = el.clientWidth
    const h = el.clientHeight
    const fit = Math.floor(Math.min(w, h))
    const next = Math.max(200, Math.min(fit, 2000))
    setStageSize(next)
  }, [])

  useEffect(() => {
    onResize()
    const ro = new ResizeObserver(onResize)
    if (stageRef.current) ro.observe(stageRef.current)
    window.addEventListener('resize', onResize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [onResize])

  const revokeManualCropUrl = useCallback(() => {
    setManualCropUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  const onManualCropApply = useCallback(
    (bmp) => {
      setFaceImage((prev) => {
        if (prev && typeof prev.close === 'function') prev.close()
        return bmp
      })
      revokeManualCropUrl()
      setManualCropOpen(false)
    },
    [revokeManualCropUrl],
  )

  const onManualCropClose = useCallback(() => {
    revokeManualCropUrl()
    setManualCropOpen(false)
  }, [revokeManualCropUrl])

  const openManualCrop = useCallback(async () => {
    if (!faceImage || uploadPhase) return
    revokeManualCropUrl()
    try {
      const url = await rasterToJpegObjectUrl(faceImage)
      if (!url) return
      setManualCropUrl(url)
      setManualCropOpen(true)
    } catch {
      // ignore
    }
  }, [faceImage, uploadPhase, revokeManualCropUrl])

  const loadFile = useCallback((file) => {
    setUploadError(null)
    revokeManualCropUrl()
    setManualCropOpen(false)
    const isImage = !!file?.type?.startsWith('image/')
    if (!file || !isImage) {
      // #region agent log
      fetch('http://127.0.0.1:7288/ingest/f3a06ad6-c19e-4494-9187-05bd4710398e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'a0240a',
        },
        body: JSON.stringify({
          sessionId: 'a0240a',
          hypothesisId: 'H5',
          location: 'App.jsx:loadFile',
          message: 'early_return_not_image',
          data: { hasFile: !!file, type: file?.type ?? null },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      if (file && !isImage) {
        setUploadError('Use an image file (JPG, PNG, WebP, GIF, etc.).')
      }
      return
    }
    const gen = ++loadGenRef.current
    // #region agent log
    fetch('http://127.0.0.1:7288/ingest/f3a06ad6-c19e-4494-9187-05bd4710398e', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'a0240a',
      },
      body: JSON.stringify({
        sessionId: 'a0240a',
        hypothesisId: 'H5',
        location: 'App.jsx:loadFile:accepted',
        message: 'file_accepted',
        data: { gen, type: file.type, size: file.size },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    setFaceImage((prev) => {
      if (prev && typeof prev.close === 'function') prev.close()
      return null
    })
    const url = URL.createObjectURL(file)
    setFaceUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    setUploadPhase('preparing')

    void (async () => {
      const runFacePipeline = async (workBmp) => {
        if (gen !== loadGenRef.current) {
          workBmp.close()
          return
        }
        setUploadPhase('background')
        const nobg = await removeBackgroundFromBitmap(workBmp)
        if (gen !== loadGenRef.current) {
          nobg?.close()
          workBmp.close()
          return
        }
        let work = workBmp
        if (nobg) {
          workBmp.close()
          work = nobg
        }
        if (gen !== loadGenRef.current) {
          work.close()
          return
        }
        setUploadPhase('cropping')
        try {
          const cropped = await extractFaceCrop(work)
          if (gen !== loadGenRef.current) {
            work.close()
            cropped?.close()
            return
          }
          if (cropped) {
            work.close()
            setFaceImage(cropped)
          } else {
            setFaceImage(work)
          }
        } catch {
          if (gen === loadGenRef.current) setFaceImage(work)
        } finally {
          if (gen === loadGenRef.current) setUploadPhase(null)
        }
      }

      try {
      // #region agent log
      const tAsync0 = Date.now()
      fetch('http://127.0.0.1:7288/ingest/f3a06ad6-c19e-4494-9187-05bd4710398e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'a0240a',
        },
        body: JSON.stringify({
          sessionId: 'a0240a',
          hypothesisId: 'H1',
          location: 'App.jsx:loadFile:async_start',
          message: 'async_decode_start',
          data: { gen, beforeFaceBusy: false, t0: tAsync0 },
          timestamp: tAsync0,
        }),
      }).catch(() => {})
      // #endregion
      let bmp = null
      if (typeof createImageBitmap === 'function') {
        try {
          bmp = await createImageBitmap(file, {
            imageOrientation: 'from-image',
          })
        } catch {
          try {
            bmp = await createImageBitmap(file)
          } catch {
            bmp = null
          }
        }
      }

      // #region agent log
      const tAfterBmp = Date.now()
      fetch('http://127.0.0.1:7288/ingest/f3a06ad6-c19e-4494-9187-05bd4710398e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'a0240a',
        },
        body: JSON.stringify({
          sessionId: 'a0240a',
          hypothesisId: 'H2',
          location: 'App.jsx:loadFile:after_decode',
          message: 'decode_finished',
          data: {
            gen,
            hasBmp: !!bmp,
            w: bmp?.width ?? null,
            h: bmp?.height ?? null,
            msSinceAsync: tAfterBmp - tAsync0,
          },
          timestamp: tAfterBmp,
        }),
      }).catch(() => {})
      // #endregion

      if (bmp) {
        if (gen !== loadGenRef.current) {
          bmp.close()
          return
        }
        // #region agent log
        fetch('http://127.0.0.1:7288/ingest/f3a06ad6-c19e-4494-9187-05bd4710398e', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': 'a0240a',
          },
          body: JSON.stringify({
            sessionId: 'a0240a',
            hypothesisId: 'H1',
            location: 'App.jsx:loadFile:phase_pipeline',
            message: 'pipeline_start',
            data: { gen, msSinceAsync: Date.now() - tAsync0 },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        await runFacePipeline(bmp)
        return
      }

      const im = new Image()
      im.onload = () => {
        // #region agent log
        fetch('http://127.0.0.1:7288/ingest/f3a06ad6-c19e-4494-9187-05bd4710398e', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': 'a0240a',
          },
          body: JSON.stringify({
            sessionId: 'a0240a',
            hypothesisId: 'H4',
            location: 'App.jsx:loadFile:image_onload',
            message: 'img_fallback_onload',
            data: {
              gen,
              nw: im.naturalWidth,
              nh: im.naturalHeight,
              msSinceAsync: Date.now() - tAsync0,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        void (async () => {
          if (gen !== loadGenRef.current) return
          let bmp2 = null
          try {
            bmp2 = await createImageBitmap(im)
          } catch {
            bmp2 = null
          }
          if (bmp2) {
            await runFacePipeline(bmp2)
            return
          }
          if (gen === loadGenRef.current) setUploadPhase('cropping')
          try {
            const cropped = await extractFaceCrop(im)
            if (gen !== loadGenRef.current) {
              cropped?.close()
              return
            }
            setFaceImage(cropped ?? im)
          } catch {
            if (gen === loadGenRef.current) setFaceImage(im)
          } finally {
            if (gen === loadGenRef.current) setUploadPhase(null)
          }
        })()
      }
      im.onerror = () => {
        if (gen !== loadGenRef.current) return
        setFaceImage(null)
        setUploadPhase(null)
      }
      im.src = url
      } catch {
        if (gen === loadGenRef.current) setUploadPhase(null)
      }
    })()
  }, [revokeManualCropUrl])

  const onDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    loadFile(f)
  }

  const onPick = (e) => {
    const f = e.target.files?.[0]
    loadFile(f)
    e.target.value = ''
  }

  return (
    <div className="app">
      <aside className="panel panel--left">
        <div className="panel--left__scroll">
        <header className="hdr">
          <h1 className="title">{"What's your value?"}</h1>
          <p className="subtitle">Your face, measured.</p>
        </header>

        <div className="upload-block">
          <label
            className={`dropzone${uploadPhase ? ' dropzone--busy' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <input
              type="file"
              accept="image/*"
              className="file"
              onChange={onPick}
            />
            {!faceUrl ? (
              <span className="dropzone__hint">
                Drop a photo here, or click to upload
              </span>
            ) : (
              <img src={faceUrl} alt="" className="thumb" />
            )}
            {uploadPhase ? (
              <div
                className="dropzone__busy"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="dropzone__busy-inner">
                  <div className="dropzone__spinner" aria-hidden="true" />
                  {uploadPhase === 'preparing' ? (
                    <>
                      <span className="dropzone__busy-title">Preparing your image</span>
                      <p className="dropzone__busy-sub">
                        Reading and decoding your photo… Larger files or HEIC/JPEG with
                        rotation can take a moment.
                      </p>
                    </>
                  ) : uploadPhase === 'background' ? (
                    <>
                      <span className="dropzone__busy-title">Removing background</span>
                      <p className="dropzone__busy-sub">
                        Running on-device segmentation… The first run downloads a model
                        (several MB); please wait.
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="dropzone__busy-title">Cropping your image</span>
                      <p className="dropzone__busy-sub">
                        Detecting your face and framing the crop… The first run may take a
                        few seconds while the detector loads.
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </label>
          {uploadError ? (
            <p className="upload-error" role="alert">
              {uploadError}
            </p>
          ) : null}
          {faceImage && !uploadPhase ? (
            <p className="upload-actions">
              <button
                type="button"
                className="upload-actions__btn"
                onClick={() => void openManualCrop()}
              >
                Adjust square crop
              </button>
            </p>
          ) : null}
          <ul className="upload-hint upload-hint--list">
            <li>
              <strong>Background and crop</strong> — runs in your browser (first visit
              downloads models). Face + busy scene → we zoom the face; no face / already
              tight / cutout → whole image. Use <strong>Adjust square crop</strong> anytime.
            </li>
            <li>
              <strong>Best warp</strong> — square, ~800×800+ px, face large and centered;
              plain or transparent background beats wide scenic shots.
            </li>
          </ul>
        </div>

        <section className="axis-block">
          <h2 className="axis-label">Creditworthy</h2>
          <div className="row">
            <label htmlFor="credit">Credit score</label>
            <input
              id="credit"
              type="range"
              min={0}
              max={850}
              value={credit}
              style={rangeFillStyle(credit, 0, 850)}
              onChange={(e) => setCredit(Number(e.target.value))}
            />
            <span className="num">{credit}</span>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={ownsHome}
              onChange={(e) => setOwnsHome(e.target.checked)}
            />
            Owns a home
          </label>
          <div className="norm">normalized {fmt01(nCredit)}</div>
        </section>

        <section className="axis-block">
          <h2 className="axis-label">Visible</h2>
          <div className="row">
            <label htmlFor="ig">Instagram</label>
            <input
              id="ig"
              type="range"
              min={0}
              max={FOLLOWER_MAX_INDEX}
              step={1}
              value={igIdx}
              style={rangeFillStyle(igIdx, 0, FOLLOWER_MAX_INDEX)}
              onChange={(e) => setIgIdx(Number(e.target.value))}
            />
            <span className="num">{ig.toLocaleString()}</span>
          </div>
          <div className="row">
            <label htmlFor="li">LinkedIn</label>
            <input
              id="li"
              type="range"
              min={0}
              max={FOLLOWER_MAX_INDEX}
              step={1}
              value={liIdx}
              style={rangeFillStyle(liIdx, 0, FOLLOWER_MAX_INDEX)}
              onChange={(e) => setLiIdx(Number(e.target.value))}
            />
            <span className="num">{li.toLocaleString()}</span>
          </div>
          <div className="row">
            <label htmlFor="xf">X</label>
            <input
              id="xf"
              type="range"
              min={0}
              max={FOLLOWER_MAX_INDEX}
              step={1}
              value={xfIdx}
              style={rangeFillStyle(xfIdx, 0, FOLLOWER_MAX_INDEX)}
              onChange={(e) => setXfIdx(Number(e.target.value))}
            />
            <span className="num">{xFollow.toLocaleString()}</span>
          </div>
          <div className="row">
            <label htmlFor="strava">Strava followers</label>
            <input
              id="strava"
              type="range"
              min={0}
              max={FOLLOWER_MAX_INDEX}
              step={1}
              value={stravaIdx}
              style={rangeFillStyle(stravaIdx, 0, FOLLOWER_MAX_INDEX)}
              onChange={(e) => setStravaIdx(Number(e.target.value))}
            />
            <span className="num">{stravaFollowers.toLocaleString()}</span>
          </div>
          <div className="row">
            <label htmlFor="friends">Close friends (approx.)</label>
            <input
              id="friends"
              type="range"
              min={0}
              max={80}
              step={1}
              value={closeFriends}
              style={rangeFillStyle(closeFriends, 0, 80)}
              onChange={(e) => setCloseFriends(Number(e.target.value))}
            />
            <span className="num">{closeFriends}</span>
          </div>
          <div className="row row--select">
            <label htmlFor="marital">Relationship status</label>
            <select
              id="marital"
              value={marital}
              onChange={(e) => setMarital(e.target.value)}
            >
              <option value="single">Single</option>
              <option value="married">Married</option>
              <option value="divorced">Divorced</option>
            </select>
          </div>
          <div className="norm">normalized {fmt01(nVis)}</div>
        </section>

        <section className="axis-block">
          <h2 className="axis-label">Compliant</h2>
          <div className="row">
            <label htmlFor="uber">Uber rating</label>
            <input
              id="uber"
              type="range"
              min={0}
              max={5}
              step={0.01}
              value={uber}
              style={rangeFillStyle(uber, 0, 5)}
              onChange={(e) => setUber(Number(e.target.value))}
            />
            <span className="num">{uber.toFixed(2)}</span>
          </div>
          <div className="row">
            <label htmlFor="air">Airbnb guest rating</label>
            <input
              id="air"
              type="range"
              min={0}
              max={5}
              step={0.01}
              value={airbnb}
              style={rangeFillStyle(airbnb, 0, 5)}
              onChange={(e) => setAirbnb(Number(e.target.value))}
            />
            <span className="num">{airbnb.toFixed(2)}</span>
          </div>
          <div className="norm">normalized {fmt01(nComp)}</div>
        </section>

        <section className="axis-block">
          <h2 className="axis-label">Productive</h2>
          <div className="row">
            <label htmlFor="yrs">Years employed (continuous)</label>
            <input
              id="yrs"
              type="range"
              min={0}
              max={40}
              value={years}
              style={rangeFillStyle(years, 0, 40)}
              onChange={(e) => setYears(Number(e.target.value))}
            />
            <span className="num">{years}</span>
          </div>
          <div className="row row--select">
            <label htmlFor="sal">Salary bracket</label>
            <select
              id="sal"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
            >
              {SALARY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="row row--select">
            <label htmlFor="sector">Sector you work in</label>
            <select
              id="sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            >
              <option value="">Select sector…</option>
              {WORK_SECTORS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="norm">normalized {fmt01(nProd)}</div>
        </section>

        <section className="axis-block">
          <h2 className="axis-label">Healthy</h2>
          <div className="row">
            <label htmlFor="steps">Daily average steps</label>
            <input
              id="steps"
              type="range"
              min={0}
              max={15000}
              step={100}
              value={steps}
              style={rangeFillStyle(steps, 0, 15000)}
              onChange={(e) => setSteps(Number(e.target.value))}
            />
            <span className="num">{steps}</span>
          </div>
          <div className="row">
            <label htmlFor="stravaKm">Strava distance this week (km)</label>
            <input
              id="stravaKm"
              type="range"
              min={0}
              max={300}
              step={1}
              value={stravaKmWeek}
              style={rangeFillStyle(stravaKmWeek, 0, 300)}
              onChange={(e) => setStravaKmWeek(Number(e.target.value))}
            />
            <span className="num">{stravaKmWeek}</span>
          </div>
          <div className="row">
            <label htmlFor="age">Age (years)</label>
            <input
              id="age"
              type="range"
              min={1}
              max={100}
              step={1}
              value={age}
              style={rangeFillStyle(age, 1, 100)}
              onChange={(e) => setAge(Number(e.target.value))}
            />
            <span className="num">{age}</span>
          </div>
          <div className="row">
            <label htmlFor="weight">Weight (kg)</label>
            <input
              id="weight"
              type="range"
              min={30}
              max={200}
              step={1}
              value={weightKg}
              style={rangeFillStyle(weightKg, 30, 200)}
              onChange={(e) => setWeightKg(Number(e.target.value))}
            />
            <span className="num">{weightKg}</span>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={vo2Known}
              onChange={(e) => setVo2Known(e.target.checked)}
            />
            VO2 max known (ml/kg/min)
          </label>
          {vo2Known ? (
            <div className="row">
              <label htmlFor="vo2">VO2 max</label>
              <input
                id="vo2"
                type="range"
                min={22}
                max={75}
                step={0.5}
                value={vo2max}
                style={rangeFillStyle(vo2max, 22, 75)}
                onChange={(e) => setVo2max(Number(e.target.value))}
              />
              <span className="num">{vo2max.toFixed(1)}</span>
            </div>
          ) : null}
          <label className="check">
            <input
              type="checkbox"
              checked={takesVitamins}
              onChange={(e) => setTakesVitamins(e.target.checked)}
            />
            Takes vitamins / supplements regularly
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={tracker}
              onChange={(e) => setTracker(e.target.checked)}
            />
            Fitness tracker (+0.1 bonus, capped at 1.0)
          </label>
          <div className="norm">normalized {fmt01(nHealth)}</div>
        </section>
        </div>
        <p className="panel--left__scroll-hint">
          <span>scroll</span>
          <span className="panel--left__scroll-hint__arrow" aria-hidden="true">
            ↓
          </span>
        </p>
      </aside>

      <main className="panel panel--right">
        <header className="right-head">
          <div className="score-block">
            <span className="score-block__label">Value score</span>
            <span className="score-block__num">{social}</span>
            <p className="caption caption--score">
              We are now defined by metrics. Everything is quantifiable, our past, our
              present, and even our future. In this constant translation into 0 and 1s,
              we are slowly distorted in real time.
            </p>
          </div>
        </header>
        <div className="stage" ref={stageRef}>
          <div
            className="stage__square"
            style={{ width: stageSize, height: stageSize }}
          >
            <WarpCanvas scores={scores} image={faceImage} size={stageSize} />
            <RadarOverlay size={stageSize} scores={scores} />
          </div>
        </div>
      </main>
      <ManualSquareCropModal
        key={manualCropUrl || 'closed'}
        open={manualCropOpen}
        imageUrl={manualCropUrl}
        onClose={onManualCropClose}
        onApply={onManualCropApply}
      />
    </div>
  )
}
