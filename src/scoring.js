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
 */
export function normalizeCreditworthy(creditScore) {
  const t = creditScore / 850
  return clamp01(t)
}

/** @typedef {'single' | 'married' | 'divorced'} MaritalStatus */

/**
 * Online reach + close friends + relationship status → single Visible axis score.
 */
export function normalizeVisible(
  instagram,
  linkedin,
  x,
  closeFriends,
  marital,
) {
  const networkReach =
    (Math.log(instagram + 1) / Math.log(1_000_000 + 1)) * 0.5 +
    (Math.log(linkedin + 1) / Math.log(30_000 + 1)) * 0.3 +
    (Math.log(x + 1) / Math.log(1_000_000 + 1)) * 0.2

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

/**
 * @param {number} steps 0–15000
 * @param {boolean} hasTracker
 * @param {number} ageYears 1–100
 * @param {number} weightKg 30–200
 */
export function normalizeHealthy(steps, hasTracker, ageYears, weightKg) {
  const trackerBonus = hasTracker ? 0.1 : 0
  const stepsNorm = Math.min(steps / 12_000, 1.0)
  const ageNorm = clamp01((ageYears - 1) / (100 - 1))
  const weightNorm = clamp01((weightKg - 30) / (200 - 30))
  const base = ((stepsNorm + ageNorm + weightNorm) / 3) * 0.9
  return clamp01(base + trackerBonus)
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
