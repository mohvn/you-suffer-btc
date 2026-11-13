"use client"

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { PricePoint } from "@/lib/quote"

const chartConfig = {
  price: {
    label: "Bitcoin",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

const usd = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
})

const axisUsd = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const clock = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
})

export function PriceChart({
  points,
  limit,
}: {
  points: PricePoint[]
  limit: number | null
}) {
  if (points.length < 2) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-muted-foreground sm:h-96">
        Loading history…
      </div>
    )
  }

  const prices = points.map((point) => point.price)
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const showLimit = limit != null && limit >= low && limit <= high

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full sm:h-96">
      <AreaChart data={points} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fill-btc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-price)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-price)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(value) => clock.format(value)}
        />
        <YAxis
          domain={([dataMin, dataMax]) => {
            const pad = Math.max((dataMax - dataMin) * 0.2, 1)
            return [dataMin - pad, dataMax + pad]
          }}
          tickLine={false}
          axisLine={false}
          width={76}
          tickFormatter={(value) => axisUsd.format(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_label, payload) => {
                const time = payload?.[0]?.payload?.t
                return typeof time === "number" ? clock.format(time) : ""
              }}
              formatter={(value) => (
                <span className="font-mono font-medium text-foreground tabular-nums">
                  {usd.format(Number(value))}
                </span>
              )}
            />
          }
        />
        {showLimit ? (
          <ReferenceLine
            y={limit}
            stroke="var(--destructive)"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />
        ) : null}
        <Area
          dataKey="price"
          type="monotone"
          fill="url(#fill-btc)"
          stroke="var(--color-price)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
