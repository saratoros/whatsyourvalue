/**
 * Discrete follower counts for Instagram, LinkedIn, X.
 *
 * Before 10k: 0, 500, then 1k, 2k, … 9k (1k steps).
 * Then: 10k, 20k, 30k, 50k, 100k, 150k, 200k, 250k, 300k, then +50k up to 1M.
 */
function buildFollowerTiers() {
  const s = new Set()

  s.add(0)
  s.add(500)
  for (let k = 1; k <= 9; k += 1) {
    s.add(k * 1000)
  }

  const kTiers = [
    10_000, 20_000, 30_000, 50_000, 100_000,
    150_000, 200_000, 250_000, 300_000,
  ]
  kTiers.forEach((v) => {
    s.add(v)
  })

  for (let v = 350_000; v <= 1_000_000; v += 50_000) {
    s.add(v)
  }

  return Array.from(s).sort((a, b) => a - b)
}

export const FOLLOWER_TIERS = buildFollowerTiers()

export const FOLLOWER_MAX_INDEX = FOLLOWER_TIERS.length - 1

/** Snap stored count to nearest tier index (e.g. migration). */
export function followerIndexFromValue(value) {
  let best = 0
  let bestDist = Infinity
  FOLLOWER_TIERS.forEach((t, i) => {
    const d = Math.abs(t - value)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  return best
}
