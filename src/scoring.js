/** @typedef {'lt20' | '20_50' | '50_100' | '100_200' | '200p'} SalaryBracket */

const SALARY_MAP = {
  lt20: 0.1,
  '20_50': 0.3,
  '50_100': 0.55,
  '100_200': 0.8,
  '200p': 1.0,
}

/**
 * @param {number} creditScore 0–850
 * @param {boolean} ownsHome self-reported homeowner
 */
export function normalizeCreditworthy(creditScore, ownsHome) {
  const creditNorm = clamp01(creditScore / 850)
  const homeNorm = ownsHome ? 1 : 0.52
  return clamp01((creditNorm + homeNorm) / 2)
}

/** @typedef {'single' | 'married' | 'divorced'} MaritalStatus */

/**
 * Online reach (incl. Strava) + close friends + relationship status → Visible axis score.
 */
export function normalizeVisible(
  instagram,
  linkedin,
  x,
  stravaFollowers,
  closeFriends,
  marital,
) {
  const networkReach =
    (Math.log(instagram + 1) / Math.log(1_000_000 + 1)) * 0.4 +
    (Math.log(linkedin + 1) / Math.log(30_000 + 1)) * 0.25 +
    (Math.log(x + 1) / Math.log(1_000_000 + 1)) * 0.15 +
    (Math.log(stravaFollowers + 1) / Math.log(50_000 + 1)) * 0.2

  const friendsNorm = clamp01(closeFriends / 80)

  let maritalNorm = 0.72
  if (marital === 'married') maritalNorm = 0.78
  else if (marital === 'single') maritalNorm = 0.72
  else if (marital === 'divorced') maritalNorm = 0.68

  return clamp01((networkReach + friendsNorm + maritalNorm) / 3)
}

/**
 * @param {number} uber 0–5
 * @param {number} airbnb 0–5
 */
export function normalizeCompliant(uber, airbnb) {
  const avg = (uber + airbnb) / 2
  return clamp01(avg / 5)
}

/** Ordered list for sector contribution (ordinal position only). */
export const WORK_SECTORS = [
  { id: 'agriculture', label: 'Agriculture & primary industries' },
  { id: 'construction', label: 'Construction & trades' },
  { id: 'education', label: 'Education' },
  { id: 'energy', label: 'Energy & utilities' },
  { id: 'finance', label: 'Finance & insurance' },
  { id: 'government', label: 'Government & public sector' },
  { id: 'health', label: 'Healthcare & social services' },
  { id: 'hospitality', label: 'Hospitality, tourism & food service' },
  { id: 'manufacturing', label: 'Manufacturing' },
  { id: 'professional', label: 'Professional & business services' },
  { id: 'retail', label: 'Retail & wholesale' },
  { id: 'tech', label: 'Technology & information' },
  { id: 'transport', label: 'Transportation & logistics' },
  { id: 'media', label: 'Arts, media & entertainment' },
  { id: 'other', label: 'Other / prefer not to say' },
]

/**
 * @param {number} yearsEmployed 0–40
 * @param {SalaryBracket} bracket
 * @param {string} sectorId WORK_SECTORS[].id
 */
export function normalizeProductive(yearsEmployed, bracket, sectorId) {
  const y = clamp01(yearsEmployed / 40)
  const s = SALARY_MAP[bracket] ?? 0.1
  if (!sectorId) {
    return (y + s) / 2
  }
  const idx = WORK_SECTORS.findIndex((w) => w.id === sectorId)
  const n = WORK_SECTORS.length
  const sectorNorm =
    idx >= 0 && n > 0 ? (idx + 1) / n : 0.65
  return (y + s + sectorNorm) / 3
}

/** Weekly Strava distance (km) at or above this counts as full contribution to Healthy. */
const STRAVA_KM_WEEK_FULL = 120

/** VO2 max (ml/kg/min): below ≈poor, at/above ≈excellent for scoring spread. */
const VO2_MIN = 22
const VO2_FULL = 58

/**
 * @param {number} steps 0–15000
 * @param {boolean} hasTracker
 * @param {number} ageYears 1–100
 * @param {number} weightKg 30–200
 * @param {number} stravaKmThisWeek 0+ km this calendar week
 * @param {boolean} vo2Known user supplied a lab / device VO2 max
 * @param {number} vo2max ml/kg/min when vo2Known
 * @param {boolean} takesVitamins daily supplements (self-reported)
 */
export function normalizeHealthy(
  steps,
  hasTracker,
  ageYears,
  weightKg,
  stravaKmThisWeek,
  vo2Known,
  vo2max,
  takesVitamins,
) {
  const trackerBonus = hasTracker ? 0.1 : 0
  const vitaminBonus = takesVitamins ? 0.04 : 0
  const stepsNorm = Math.min(steps / 12_000, 1.0)
  const ageNorm = clamp01((ageYears - 1) / (100 - 1))
  const weightNorm = clamp01((weightKg - 30) / (200 - 30))
  const stravaNorm = clamp01(stravaKmThisWeek / STRAVA_KM_WEEK_FULL)
  const vo2Norm = vo2Known
    ? clamp01((vo2max - VO2_MIN) / (VO2_FULL - VO2_MIN))
    : 0.55
  const base =
    ((stepsNorm + ageNorm + weightNorm + stravaNorm + vo2Norm) / 5) * 0.86
  return clamp01(base + trackerBonus + vitaminBonus)
}

export function compositeScore(n1, n2, n3, n4, n5) {
  const parts = [n1, n2, n3, n4, n5].map((x) =>
    Number.isFinite(Number(x)) ? Number(x) : 0,
  )
  const avg = parts.reduce((a, b) => a + b, 0) / 5
  const raw = Math.round(avg * 1000)
  return Number.isFinite(raw) ? raw : 0
}

function clamp01(v) {
  if (Number.isNaN(v)) return 0
  return Math.min(1, Math.max(0, v))
}
