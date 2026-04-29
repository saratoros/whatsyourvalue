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
  const [igIdx, setIgIdx] = useState(0)
  const [liIdx, setLiIdx] = useState(0)
  const [xfIdx, setXfIdx] = useState(0)
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

  const ig = FOLLOWER_TIERS[igIdx]
  const li = FOLLOWER_TIERS[liIdx]
  const xFollow = FOLLOWER_TIERS[xfIdx]

  const [faceUrl, setFaceUrl] = useState(null)
  const [faceImage, setFaceImage] = useState(null)
  const [faceBusy, setFaceBusy] = useState(false)
  const loadGenRef = useRef(0)

  const stageRef = useRef(null)
  const [stageSize, setStageSize] = useState(800)

  const nCredit = useMemo(() => normalizeCreditworthy(credit), [credit])
  const nVis = useMemo(
    () => normalizeVisible(ig, li, xFollow, closeFriends, marital),
    [ig, li, xFollow, closeFriends, marital],
  )
  const nComp = useMemo(() => normalizeCompliant(uber, airbnb), [uber, airbnb])
  const nProd = useMemo(
    () => normalizeProductive(years, salary, sector),
    [years, salary, sector],
  )
  const nHealth = useMemo(
    () => normalizeHealthy(steps, tracker, age, weightKg),
    [steps, tracker, age, weightKg],
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

  const loadFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    const gen = ++loadGenRef.current
    setFaceImage((prev) => {
      if (prev && typeof prev.close === 'function') prev.close()
      return null
    })
    const url = URL.createObjectURL(file)
    setFaceUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })

    void (async () => {
      try {
        if (typeof createImageBitmap === 'function') {
          const bmp = await createImageBitmap(file, {
            imageOrientation: 'from-image',
          })
          if (gen !== loadGenRef.current) {
            bmp.close()
            return
          }
          setFaceBusy(true)
          try {
            const cropped = await extractFaceCrop(bmp)
            if (gen !== loadGenRef.current) {
              bmp.close()
              cropped?.close()
              return
            }
            if (cropped) {
              bmp.close()
              setFaceImage(cropped)
            } else {
              setFaceImage(bmp)
            }
          } catch {
            if (gen === loadGenRef.current) setFaceImage(bmp)
          } finally {
            if (gen === loadGenRef.current) setFaceBusy(false)
          }
          return
        }
      } catch {
        /* fall through to Image */
      }
      const im = new Image()
      im.onload = () => {
        void (async () => {
          if (gen !== loadGenRef.current) return
          setFaceBusy(true)
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
            if (gen === loadGenRef.current) setFaceBusy(false)
          }
        })()
      }
      im.onerror = () => {
        if (gen !== loadGenRef.current) return
        setFaceImage(null)
      }
      im.src = url
    })()
  }, [])

  const onDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    loadFile(f)
  }

  const onPick = (e) => {
    const f = e.target.files?.[0]
    loadFile(f)
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
            className={`dropzone${faceBusy ? ' dropzone--busy' : ''}`}
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
                Drop a face photo here, or click to upload
              </span>
            ) : (
              <img src={faceUrl} alt="" className="thumb" />
            )}
            {faceBusy ? (
              <div
                className="dropzone__busy"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="dropzone__busy-inner">
                  <div className="dropzone__spinner" aria-hidden="true" />
                  <span className="dropzone__busy-title">Cropping your image</span>
                  <p className="dropzone__busy-sub">
                    Detecting your face and framing the crop… This can take a few
                    seconds the first time.
                  </p>
                </div>
              </div>
            ) : null}
          </label>
          <p className="upload-hint">
            <strong>Auto-crop:</strong> we try to detect the main face and zoom the crop
            for you (runs in your browser). If no face is found, the full photo is used.{' '}
            <strong>Best results:</strong> use a <strong>square</strong> image at least{' '}
            <strong>800×800 px</strong> (larger is fine). Crop so your{' '}
            <strong>face fills most of the frame</strong>, centered on the nose or between
            the eyes. Remove busy backgrounds when you can—<strong>a clear headshot on a
            plain or transparent background</strong> warps cleanly and lines up with the
            chart; wide scenic shots or off-center faces will look shifted.
          </p>
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
    </div>
  )
}
