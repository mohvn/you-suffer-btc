import type { PricePoint } from "@/lib/quote"

const CAP = 120

export function pushPoint(points: PricePoint[], t: number, price: number): PricePoint[] {
  if (!Number.isFinite(t) || !Number.isFinite(price) || price <= 0) return points
  const bucket = Math.floor(t / 60_000)
  const last = points[points.length - 1]
  if (last && Math.floor(last.t / 60_000) === bucket) {
    if (last.price === price) return points
    const next = points.slice()
    next[next.length - 1] = { t, price }
    return next
  }
  const next = [...points, { t, price }]
  return next.length > CAP ? next.slice(next.length - CAP) : next
}

export function mergeHistory(live: PricePoint[], history: PricePoint[]): PricePoint[] {
  return live.reduce((points, point) => pushPoint(points, point.t, point.price), history)
}

export function averagePrice(points: PricePoint[]): number | null {
  if (points.length === 0) return null
  let total = 0
  let count = 0
  for (const point of points) {
    if (!Number.isFinite(point.price) || point.price <= 0) continue
    total += point.price
    count += 1
  }
  if (count === 0) return null
  return total / count
}
