import axios from "axios"
import { connection } from "next/server"
import type { Quote } from "@/lib/quote"

export async function GET() {
  await connection()

  const quote = await fromBinance() ?? await fromCoinbase() ?? await fromKraken()
  if (!quote) {
    return Response.json(
      { error: "No quote right now." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  }

  return Response.json(quote, {
    headers: { "Cache-Control": "no-store" },
  })
}

async function fromBinance(): Promise<Quote | null> {
  try {
    const { data } = await axios.get<Record<string, unknown>>(
      "https://data-api.binance.vision/api/v3/ticker/24hr",
      { params: { symbol: "BTCUSDT" }, timeout: 8000 },
    )
    const price = readNumber(data.lastPrice)
    if (price == null) return null
    return {
      price,
      changePercent: readNumber(data.priceChangePercent),
      high: readNumber(data.highPrice),
      low: readNumber(data.lowPrice),
      source: "binance",
      at: Date.now(),
    }
  } catch {
    return null
  }
}

async function fromCoinbase(): Promise<Quote | null> {
  try {
    const { data } = await axios.get<{ price?: string }>(
      "https://api.exchange.coinbase.com/products/BTC-USD/ticker",
      { timeout: 8000 },
    )
    const price = readNumber(data.price)
    if (price == null) return null
    return {
      price,
      changePercent: null,
      high: null,
      low: null,
      source: "coinbase",
      at: Date.now(),
    }
  } catch {
    return null
  }
}

async function fromKraken(): Promise<Quote | null> {
  try {
    const { data } = await axios.get<{
      result?: Record<string, { c?: string[]; o?: string; h?: string[]; l?: string[] }>
    }>("https://api.kraken.com/0/public/Ticker", {
      params: { pair: "XBTUSD" },
      timeout: 8000,
    })
    const ticker = Object.values(data.result ?? {})[0]
    const price = readNumber(ticker?.c?.[0])
    const open = readNumber(ticker?.o)
    if (price == null) return null
    return {
      price,
      changePercent: open ? ((price - open) / open) * 100 : null,
      high: readNumber(ticker?.h?.[1] ?? ticker?.h?.[0]),
      low: readNumber(ticker?.l?.[1] ?? ticker?.l?.[0]),
      source: "kraken",
      at: Date.now(),
    }
  } catch {
    return null
  }
}

function readNumber(value: unknown): number | null {
  const price = typeof value === "string" || typeof value === "number" ? Number(value) : NaN
  return Number.isFinite(price) ? price : null
}
