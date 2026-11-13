"use client"

import axios from "axios"
import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { PriceChart } from "@/components/price-chart"
import type { PricePoint, Quote } from "@/lib/quote"
import { averagePrice, mergeHistory, pushPoint } from "@/lib/series"
import {
  baseline,
  distanceToScream,
  notePrice,
  type Scream,
  type Watch,
} from "@/lib/suffer"
import { cn } from "cn"

const STORAGE_KEY = "yousufferbtc"
const FIXED_MODE = "below" as const
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})
const clock = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

type LogEntry = {
  id: number
  at: number
  price: number
  text: string
  heard: boolean
}

type Link = "ao-vivo" | "consulta" | "sem-sinal"

export function Monitor() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const armedRef = useRef(false)
  const playingRef = useRef(false)
  const queueRef = useRef(0)
  const wsAliveRef = useRef(false)
  const lastPriceRef = useRef<number | null>(null)
  const logId = useRef(0)
  const limitReadyRef = useRef(false)

  const [limitLabel, setLimitLabel] = useState<string | null>(null)
  const [watch, setWatch] = useState<Watch>(() => freshBelow())
  const watchRef = useRef(watch)
  const pointsRef = useRef<PricePoint[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [points, setPoints] = useState<PricePoint[]>([])
  const [link, setLink] = useState<Link>("consulta")
  const [armed, setArmed] = useState(false)
  const [screaming, setScreaming] = useState(false)
  const [blast, setBlast] = useState(0)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [screams, setScreams] = useState(0)
  const [now, setNow] = useState<number | null>(null)
  const mountedRef = useRef(true)
  const alarmRef = useRef(0)

  const start = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !armedRef.current || playingRef.current || queueRef.current <= 0) {
      return
    }
    queueRef.current -= 1
    playingRef.current = true
    setScreaming(true)
    setBlast((n) => n + 1)
    audio.currentTime = 0
    void audio.play().catch(() => {
      playingRef.current = false
      armedRef.current = false
      queueRef.current = 0
      setArmed(false)
      setScreaming(false)
      setAudioError("The browser blocked audio. Click play again.")
    })
  }, [])

  const enqueue = useCallback(
    (count: number) => {
      if (!armedRef.current || count <= 0) return
      queueRef.current = Math.min(8, queueRef.current + count)
      start()
    },
    [start],
  )

  const lockLimit = useCallback((digits: string, label: string) => {
    const next = baseline(FIXED_MODE, Number(digits), lastPriceRef.current)
    watchRef.current = next
    limitReadyRef.current = Number.isFinite(next.limit) && next.limit >= 1
    setLimitLabel(label)
    setWatch(next)
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode: FIXED_MODE, limit: digits, source: "average" }),
      )
    } catch {
      // UI keeps working without persisting the limit.
    }
  }, [])

  const ingestRef = useRef<(next: Quote) => void>(() => {})
  ingestRef.current = (next: Quote) => {
    lastPriceRef.current = next.price
    setQuote(next)
    setPoints((prev) => {
      const nextPoints = pushPoint(prev, next.at, next.price)
      pointsRef.current = nextPoints
      return nextPoints
    })

    if (!limitReadyRef.current) {
      const average = averagePrice(pointsRef.current)
      if (average != null) {
        lockLimit(String(Math.round(average)), "2h average")
      }
    }

    const current = watchRef.current

    const result = notePrice(current, next.price)
    if (result.watch !== current) {
      watchRef.current = result.watch
      setWatch(result.watch)
    }
    if (!result.scream) return

    const heard = armedRef.current
    const scream = result.scream
    setScreams((count) => count + scream.count)
    setLog((prev) =>
      [
        {
          id: ++logId.current,
          at: Date.now(),
          price: next.price,
          text: screamText(scream),
          heard,
        },
        ...prev,
      ].slice(0, 16),
    )
    if (heard) {
      enqueue(scream.count)
      return
    }
    alarmRef.current += 1
    const token = alarmRef.current
    setScreaming(true)
    setBlast((n) => n + 1)
    window.setTimeout(() => {
      if (!mountedRef.current || alarmRef.current !== token || playingRef.current) return
      setScreaming(false)
    }, 1600)
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => {
      playingRef.current = false
      if (queueRef.current > 0 && armedRef.current) start()
      else setScreaming(false)
    }
    audio.addEventListener("ended", onEnded)
    return () => audio.removeEventListener("ended", onEnded)
  }, [start])

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as {
        limit?: unknown
      }
      if (typeof saved.limit !== "string") return
      const next = baseline(FIXED_MODE, Number(saved.limit), lastPriceRef.current)
      watchRef.current = next
      limitReadyRef.current = Number.isFinite(next.limit) && next.limit >= 1
      setLimitLabel("2h average")
      setWatch(next)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const { data } = await axios.get<{ points?: PricePoint[] }>("/api/btc/history")
        if (!alive || !Array.isArray(data.points)) return
        const nextPoints = mergeHistory(pointsRef.current, data.points ?? [])
        pointsRef.current = nextPoints
        setPoints(nextPoints)
        if (!limitReadyRef.current) {
          const average = averagePrice(nextPoints)
          if (average != null) {
            lockLimit(String(Math.round(average)), "2h average")
          }
        }
      } catch {
        // Live quotes keep drawing the chart.
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [lockLimit])

  useEffect(() => {
    let alive = true
    const pull = async () => {
      try {
        const { data } = await axios.get<Quote>("/api/btc")
        if (!alive || !Number.isFinite(data.price)) return
        setLink((current) => (current === "ao-vivo" ? current : "consulta"))
        if (!wsAliveRef.current) ingestRef.current(data)
      } catch {
        if (!alive || wsAliveRef.current) return
        setLink("sem-sinal")
      }
    }
    void pull()
    const id = window.setInterval(() => void pull(), 4000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    let alive = true
    let socket: WebSocket | null = null
    let retry = 0
    let attempt = 0

    const connect = () => {
      socket = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@miniTicker")
      socket.onopen = () => {
        attempt = 0
      }
      socket.onmessage = (event) => {
        if (!alive) return
        const quote = quoteFromTicker(event.data)
        if (!quote) return
        wsAliveRef.current = true
        setLink((current) => (current === "ao-vivo" ? current : "ao-vivo"))
        ingestRef.current(quote)
      }
      socket.onclose = () => {
        wsAliveRef.current = false
        if (!alive) return
        setLink((current) => (current === "sem-sinal" ? current : "consulta"))
        const delay = Math.min(15000, 1000 * 2 ** attempt)
        attempt += 1
        retry = window.setTimeout(connect, delay)
      }
      socket.onerror = () => socket?.close()
    }

    connect()
    return () => {
      alive = false
      window.clearTimeout(retry)
      socket?.close()
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const tick = () => setNow(Date.now())
    const startTick = window.setTimeout(tick, 0)
    const id = window.setInterval(tick, 1000)
    return () => {
      mountedRef.current = false
      window.clearTimeout(startTick)
      window.clearInterval(id)
    }
  }, [])

  const armAudio = useCallback(async (playTest: boolean) => {
    const audio = audioRef.current
    setAudioError(null)
    if (!audio) return false
    try {
      if (!playTest) {
        audio.muted = true
        audio.volume = 0
      } else {
        audio.muted = false
        audio.volume = 1
      }
      await audio.play()
      if (!playTest) {
        audio.pause()
        audio.currentTime = 0
        audio.muted = false
        audio.volume = 1
      } else {
        playingRef.current = true
        setScreaming(true)
        setBlast((n) => n + 1)
      }
      armedRef.current = true
      setArmed(true)
      return true
    } catch {
      armedRef.current = false
      setArmed(false)
      setScreaming(false)
      playingRef.current = false
      audio.muted = false
      audio.volume = 1
      if (playTest) {
        setAudioError("The browser blocked audio. Click anywhere, then try again.")
      }
      return false
    }
  }, [])

  useEffect(() => {
    void armAudio(false)

    const onGesture = () => {
      if (armedRef.current) return
      void armAudio(false)
    }
    const opts = { capture: true, passive: true } as const
    window.addEventListener("pointerdown", onGesture, opts)
    window.addEventListener("keydown", onGesture, opts)
    window.addEventListener("touchstart", onGesture, opts)
    return () => {
      window.removeEventListener("pointerdown", onGesture, opts)
      window.removeEventListener("keydown", onGesture, opts)
      window.removeEventListener("touchstart", onGesture, opts)
    }
  }, [armAudio])

  function playNow() {
    void armAudio(true).then((ok) => {
      if (!ok) return
      if (!playingRef.current) {
        queueRef.current += 1
        start()
      }
    })
  }

  const gap = quote ? distanceToScream(watch, quote.price) : { state: "unset" as const }
  const limitSet = Number.isFinite(watch.limit) && watch.limit >= 1
  const up = (quote?.changePercent ?? 0) >= 0
  const age = quote && now != null ? Math.max(0, Math.round((now - quote.at) / 1000)) : null
  const showStamp = screaming

  return (
    <div className="relative min-h-dvh bg-background">
      <audio ref={audioRef} src="/you-suffer.mp3" preload="auto" className="sr-only" />

      {showStamp ? (
        <div
          key={blast}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
          role="alert"
        >
          <div className="suffer-wash absolute inset-0 bg-red-700/75" />
          <div className="suffer-stamp relative px-6 text-center">
            <p className="font-mono text-6xl font-bold tracking-tight text-white sm:text-8xl">
              YOU SUFFER
            </p>
            <p className="mt-3 font-mono text-xs tracking-[0.45em] text-white/80">
              NAPALM DEATH
            </p>
          </div>
        </div>
      ) : null}

      <main
        className={cn(
          "mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6",
          screaming && "suffer-shake",
        )}
      >
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-[0.35em] text-muted-foreground">
              BITCOIN
            </p>
            <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
              You Suffer
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive">Limit active</Badge>
            <Badge variant="secondary" className="gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  link === "ao-vivo" && "bg-emerald-400",
                  link === "consulta" && "bg-amber-400",
                  link === "sem-sinal" && "bg-red-400",
                )}
              />
              {link === "ao-vivo" && "Live"}
              {link === "consulta" && "Polling"}
              {link === "sem-sinal" && "No signal"}
              {quote ? ` · ${sourceName(quote.source)}` : ""}
            </Badge>
          </div>
        </header>

        <div className="flex w-full flex-col gap-6">
          <Card>
            <CardHeader>
              <CardDescription>
                BTC-USD
                {link === "ao-vivo" && " · live"}
                {link === "consulta" && " · polling"}
                {link === "sem-sinal" && " · no signal"}
                {quote ? ` · ${sourceName(quote.source)}` : ""}
              </CardDescription>
              <CardTitle className="font-mono text-4xl tabular-nums sm:text-5xl">
                {quote ? usd.format(quote.price) : "—"}
              </CardTitle>
              {quote?.changePercent != null ? (
                <p className={cn("font-mono text-sm tabular-nums", up ? "text-foreground" : "text-destructive")}>
                  {signedChange(quote)} · {signedPercent(quote.changePercent)} in 24h
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">24h change unavailable</p>
              )}
            </CardHeader>
            <CardContent>
              <PriceChart
                points={points}
                limit={limitSet ? watch.limit : null}
              />
            </CardContent>
            <CardFooter>
              <p className="text-xs text-muted-foreground">
                {gap.state === "unset" && "Waiting on the 2h average to set the limit."}
                {gap.state === "waiting" && "Marking the current price. The next move is what counts."}
                {gap.state === "passed" && "Price is already on the other side. The scream hits when it crosses the limit again."}
                {gap.state === "ready" && gap.remaining < 1 && "Right on the limit."}
                {gap.state === "ready" && gap.remaining >= 1 && (
                  <>
                    {usd.format(gap.remaining)} left to the limit
                    {limitLabel ? ` (${limitLabel})` : ""}. The dashed line is the trigger.
                  </>
                )}
                {age != null ? ` · ${age < 2 ? "now" : `${age}s ago`}` : ""}
              </p>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Limit</CardTitle>
              <CardDescription>
                Always on. Plays when price crosses the limit going down.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                    TRIGGER
                  </p>
                  <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
                    {limitSet ? usd.format(watch.limit) : "—"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {limitSet
                      ? `Cross below · ${limitLabel ?? "locked"}`
                      : "Calculating the last two hours average…"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11!"
                  onClick={playNow}
                >
                  Play now
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {audioError ??
                  (armed
                    ? "Audio is on. The limit stays armed."
                    : "Trying to enable audio automatically. If the browser blocks it, click anywhere once.")}
              </p>
            </CardContent>
          </Card>
        </div>

        <section className="flex flex-col gap-3 pb-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-mono text-sm tracking-[0.2em] text-muted-foreground">
              SCREAMS
            </h2>
            <p className="font-mono text-xs text-muted-foreground">
              {screams === 0 ? "none yet" : `${screams} this session`}
            </p>
          </div>
          <Separator />
          {log.length === 0 ? (
            <p className="py-6 font-mono text-sm text-muted-foreground">
              When price crosses the limit, You Suffer plays here.
            </p>
          ) : (
            <ol className="flex flex-col">
              {log.map((entry) => (
                <li
                  key={entry.id}
                  className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 border-b border-border py-3 font-mono text-sm last:border-0 sm:grid-cols-[auto_auto_1fr]"
                >
                  <span className="text-muted-foreground">{clock.format(entry.at)}</span>
                  <span className="tabular-nums sm:min-w-36">{usd.format(entry.price)}</span>
                  <span className="col-start-2 sm:col-start-auto">
                    {entry.text}
                    {entry.heard ? "" : " · muted"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  )
}

function freshBelow(): Watch {
  return baseline(FIXED_MODE, Number.NaN, null)
}

function screamText(scream: Scream): string {
  if (scream.kind === "cross") {
    return scream.direction === "down"
      ? `crossed ${usd.format(scream.mark)} down`
      : `crossed ${usd.format(scream.mark)} up`
  }
  const verb = scream.direction === "down" ? "dropped" : "rose"
  if (scream.count > 1) {
    return `${verb} ${usd.format(scream.moved)} · ${scream.count} times`
  }
  return `${verb} ${usd.format(scream.moved)}`
}

function sourceName(source: Quote["source"]): string {
  if (source === "binance") return "Binance"
  if (source === "coinbase") return "Coinbase"
  return "Kraken"
}

function quoteFromTicker(raw: unknown): Quote | null {
  if (typeof raw !== "string") return null
  let message: { c?: string; o?: string; h?: string; l?: string }
  try {
    message = JSON.parse(raw) as { c?: string; o?: string; h?: string; l?: string }
  } catch {
    return null
  }
  const price = Number(message.c)
  const open = Number(message.o)
  if (!Number.isFinite(price) || price <= 0) return null
  return {
    price,
    changePercent: Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : null,
    high: numberOrNull(message.h),
    low: numberOrNull(message.l),
    source: "binance",
    at: Date.now(),
  }
}

function numberOrNull(value: string | undefined): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const percentFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
})

function signedPercent(value: number): string {
  return `${percentFormat.format(value)}%`
}

function signedChange(quote: Quote): string {
  const ratio = quote.changePercent == null ? null : quote.changePercent / 100
  if (ratio == null || ratio <= -1) return "—"
  const change = quote.price - quote.price / (1 + ratio)
  const formatted = usd.format(Math.abs(change))
  if (change > 0) return `+${formatted}`
  if (change < 0) return `−${formatted}`
  return formatted
}
