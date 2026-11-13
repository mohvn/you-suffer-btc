import axios from "axios"
import { connection } from "next/server"
import type { PricePoint } from "@/lib/quote"

export async function GET() {
  await connection()

  const points = (await fromBinance()) ?? (await fromCoinbase()) ?? []
  return Response.json(
    { points },
    { headers: { "Cache-Control": "no-store" } },
  )
}

async function fromBinance(): Promise<PricePoint[] | null> {
  try {
    const { data } = await axios.get<unknown[]>(
      "https://data-api.binance.vision/api/v3/klines",
      {
        params: { symbol: "BTCUSDT", interval: "1m", limit: 120 },
        timeout: 8000,
      },
    )
    const points = data.flatMap((row) => {
      if (!Array.isArray(row)) return []
      const t = Number(row[0])
      const price = Number(row[4])
      return Number.isFinite(t) && Number.isFinite(price) && price > 0 ? [{ t, price }] : []
    })
    return points.length > 1 ? points : null
  } catch {
    return null
  }
}

async function fromCoinbase(): Promise<PricePoint[] | null> {
  try {
    const { data } = await axios.get<unknown[]>(
      "https://api.exchange.coinbase.com/products/BTC-USD/candles",
      { params: { granularity: 60 }, timeout: 8000 },
    )
    const points = data.flatMap((row) => {
      if (!Array.isArray(row)) return []
      const t = Number(row[0]) * 1000
      const price = Number(row[4])
      return Number.isFinite(t) && Number.isFinite(price) && price > 0 ? [{ t, price }] : []
    })
    points.sort((a, b) => a.t - b.t)
    const recent = points.slice(-120)
    return recent.length > 1 ? recent : null
  } catch {
    return null
  }
}
