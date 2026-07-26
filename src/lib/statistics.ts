import type { ChannelSummary } from '../types'

function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export function summarizeChannel(
  channelKey: string,
  values: Array<number | null>,
  timestamps: number[],
  expectedCadenceMs: number
): ChannelSummary {
  const numeric = values.filter((value): value is number => value !== null && Number.isFinite(value))
  const sorted = [...numeric].sort((a, b) => a - b)
  let weightedTotal = 0
  let weightedDuration = 0
  let gaps = 0

  for (let index = 0; index < values.length - 1; index += 1) {
    const delta = timestamps[index + 1] - timestamps[index]
    if (delta > Math.max(1000, expectedCadenceMs * 4)) gaps += 1
    const value = values[index]
    if (value !== null && Number.isFinite(value) && delta >= 0) {
      weightedTotal += value * delta
      weightedDuration += delta
    }
  }

  return {
    channelKey,
    count: numeric.length,
    coverage: values.length ? numeric.length / values.length : 0,
    min: sorted.length ? sorted[0] : null,
    max: sorted.length ? sorted[sorted.length - 1] : null,
    mean: numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null,
    timeWeightedMean: weightedDuration ? weightedTotal / weightedDuration : null,
    p05: percentile(sorted, 0.05),
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    gaps
  }
}

export function medianCadence(timestamps: number[]): number {
  const deltas = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]).filter((delta) => delta > 0)
  if (!deltas.length) return 0
  deltas.sort((a, b) => a - b)
  return deltas[Math.floor(deltas.length / 2)]
}

