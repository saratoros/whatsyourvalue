/**
 * Axis angles in radians (atan2 convention: y up, angle from +x CCW).
 * k=0 top (Creditworthy), then clockwise: Visible, Compliant, Productive, Healthy.
 */
export const AXIS_COUNT = 5
export const AXIS_STEP = (2 * Math.PI) / AXIS_COUNT

const TWO_PI = 2 * Math.PI

/** Angle for axis index k (0 = top / Creditworthy) */
export function axisAngle(k) {
  return Math.PI / 2 - k * AXIS_STEP
}

function normAngle(a) {
  return ((a % TWO_PI) + TWO_PI) % TWO_PI
}

/**
 * Radar polygon radius at boundary angle `theta`, linearly interpolated between axes.
 * @param {number} theta radians (same as atan2(y, x) with y up)
 * @param {number[]} scores length 5 in [0, 1]
 */
export function radarRadiusAt(theta, scores) {
  if (scores.length !== AXIS_COUNT) {
    throw new Error('scores must have length 5')
  }

  const ts = normAngle(theta)

  for (let k = 0; k < AXIS_COUNT; k++) {
    const aStart = axisAngle(k)
    const aEnd = axisAngle((k + 1) % AXIS_COUNT)
    let s = normAngle(aStart)
    let e = normAngle(aEnd)
    let t = ts
    // Clockwise arc from axis k to k+1: unwrap so e > s along the arc
    if (e <= s) e += TWO_PI
    if (t < s) t += TWO_PI
    if (t <= e + 1e-9) {
      const span = e - s || 1e-9
      const u = (t - s) / span
      return scores[k] * (1 - u) + scores[(k + 1) % AXIS_COUNT] * u
    }
  }

  return scores[0]
}

export const DISTORTION_STRENGTH = 1.8
export const BASE_SCALE = 0.35

/**
 * Radial scale for vertex at direction theta.
 * @param {number} theta
 * @param {number[]} scores
 */
export function radialScaleAt(theta, scores) {
  const rr = radarRadiusAt(theta, scores)
  return rr * DISTORTION_STRENGTH + BASE_SCALE
}
