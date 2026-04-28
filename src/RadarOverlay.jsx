import { axisAngle } from './radarMath.js'

/** Chart + grid lines (matches form accent) */
const ACCENT = '#2200fe'
const ACCENT_LABEL = '#2a1fb8'

const LABELS = [
  'Creditworthy',
  'Visible',
  'Compliant',
  'Productive',
  'Healthy',
]

/**
 * @param {{ size: number; scores: number[] }} props
 */
export function RadarOverlay({ size, scores }) {
  const cx = size / 2
  const cy = size / 2
  const R = size * 0.36
  const labelR = R + 20

  const s = scores.slice(0, 5)
  while (s.length < 5) s.push(0)

  function tip(k, mag) {
    const th = axisAngle(k)
    return {
      x: cx + R * mag * Math.cos(th),
      y: cy - R * mag * Math.sin(th),
    }
  }

  const polyPts = s
    .map((mag, k) => {
      const p = tip(k, mag)
      return `${p.x},${p.y}`
    })
    .join(' ')

  const axisLines = LABELS.map((_, k) => {
    const p = tip(k, 1)
    return (
      <line
        key={`axis-${k}`}
        x1={cx}
        y1={cy}
        x2={p.x}
        y2={p.y}
        stroke={ACCENT}
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />
    )
  })

  const rings = [0.33, 0.66, 1].map((mag, i) => {
    const pts = Array.from({ length: 5 }, (_, k) => {
      const p = tip(k, mag)
      return `${p.x},${p.y}`
    }).join(' ')
    return (
      <polygon
        key={`ring-${i}`}
        points={pts}
        fill="none"
        stroke={ACCENT}
        strokeWidth={0.5}
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />
    )
  })

  const labels = LABELS.map((label, k) => {
    const p = tip(k, labelR / R)
    return (
      <text
        key={`lbl-${k}`}
        x={p.x}
        y={p.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={ACCENT_LABEL}
        fontSize={12}
        style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
      >
        {label}
      </text>
    )
  })

  return (
    <svg
      className="radar-overlay"
      width="100%"
      height="100%"
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {rings}
      {axisLines}
      <polygon
        points={polyPts}
        fill="none"
        stroke={ACCENT}
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
        opacity={0.85}
      />
      {labels}
    </svg>
  )
}
