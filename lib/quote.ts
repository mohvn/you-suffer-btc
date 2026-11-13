export type Quote = {
  price: number
  changePercent: number | null
  high: number | null
  low: number | null
  source: "binance" | "coinbase" | "kraken"
  at: number
}

export type PricePoint = {
  t: number
  price: number
}
