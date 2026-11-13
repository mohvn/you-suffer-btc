export const MODES = [
  { value: "below", label: "When crossing below" },
  { value: "above", label: "When crossing above" },
  { value: "either", label: "On any cross" },
  { value: "drop", label: "On every drop — Gilfoyle" },
  { value: "rise", label: "On every rise" },
] as const

export type Mode = (typeof MODES)[number]["value"]

export type Watch = {
  mode: Mode
  limit: number
  side: "above" | "below" | null
  anchor: number | null
}

export type Scream = {
  kind: "cross" | "step"
  direction: "up" | "down"
  count: number
  mark: number
  moved: number
}

const MAX_PLAYS = 8

export function isMode(value: unknown): value is Mode {
  return MODES.some((mode) => mode.value === value)
}

export function freshWatch(mode: Mode, limit: number): Watch {
  return { mode, limit, side: null, anchor: null }
}

export function baseline(
  mode: Mode,
  limit: number,
  price: number | null,
): Watch {
  const watch = freshWatch(mode, limit)
  if (price == null) return watch
  return notePrice(watch, price).watch
}

export function notePrice(
  watch: Watch,
  price: number,
): { watch: Watch; scream: Scream | null } {
  if (!Number.isFinite(price) || price <= 0) {
    return { watch, scream: null }
  }
  if (!Number.isFinite(watch.limit) || watch.limit < 1) {
    return { watch, scream: null }
  }
  if (watch.mode === "drop" || watch.mode === "rise") {
    return noteStep(watch, price)
  }
  return noteCross(watch, price)
}

export function distanceToScream(
  watch: Watch,
  price: number,
):
  | { state: "unset" }
  | { state: "waiting" }
  | { state: "passed" }
  | { state: "ready"; remaining: number } {
  if (!Number.isFinite(price) || !Number.isFinite(watch.limit) || watch.limit < 1) {
    return { state: "unset" }
  }

  if (watch.mode === "drop") {
    if (watch.anchor == null) return { state: "waiting" }
    return {
      state: "ready",
      remaining: Math.max(0, price - (watch.anchor - watch.limit)),
    }
  }

  if (watch.mode === "rise") {
    if (watch.anchor == null) return { state: "waiting" }
    return {
      state: "ready",
      remaining: Math.max(0, watch.anchor + watch.limit - price),
    }
  }

  if (watch.side == null) return { state: "waiting" }

  if (watch.mode === "either") {
    return { state: "ready", remaining: Math.abs(price - watch.limit) }
  }

  if (watch.mode === "below") {
    if (watch.side === "below") return { state: "passed" }
    return { state: "ready", remaining: Math.max(0, price - watch.limit) }
  }

  if (watch.side === "above") return { state: "passed" }
  return { state: "ready", remaining: Math.max(0, watch.limit - price) }
}

function noteCross(
  watch: Watch,
  price: number,
): { watch: Watch; scream: Scream | null } {
  const side: Watch["side"] = price >= watch.limit ? "above" : "below"
  if (watch.side == null || watch.side === side) {
    return { watch: watch.side == null ? { ...watch, side } : watch, scream: null }
  }

  const next = { ...watch, side }
  const crossedUp = side === "above"
  const fires =
    watch.mode === "either" ||
    (watch.mode === "above" && crossedUp) ||
    (watch.mode === "below" && !crossedUp)

  if (!fires) return { watch: next, scream: null }

  return {
    watch: next,
    scream: {
      kind: "cross",
      direction: crossedUp ? "up" : "down",
      count: 1,
      mark: watch.limit,
      moved: watch.limit,
    },
  }
}

function noteStep(
  watch: Watch,
  price: number,
): { watch: Watch; scream: Scream | null } {
  const step = watch.limit
  if (watch.anchor == null) {
    return { watch: { ...watch, anchor: price }, scream: null }
  }

  const dropping = watch.mode === "drop"
  if (dropping ? price > watch.anchor : price < watch.anchor) {
    return { watch: { ...watch, anchor: price }, scream: null }
  }

  const moved = Math.abs(watch.anchor - price)
  const steps = Math.floor(moved / step)
  if (steps <= 0) return { watch, scream: null }

  const nextAnchor = dropping
    ? watch.anchor - steps * step
    : watch.anchor + steps * step

  return {
    watch: { ...watch, anchor: nextAnchor },
    scream: {
      kind: "step",
      direction: dropping ? "down" : "up",
      count: Math.min(steps, MAX_PLAYS),
      mark: step,
      moved: steps * step,
    },
  }
}
