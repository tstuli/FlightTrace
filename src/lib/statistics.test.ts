import { describe, expect, it } from 'vitest'
import { medianCadence, summarizeChannel } from './statistics'

describe('telemetry statistics', () => {
  it('uses elapsed time for averages and reports gaps', () => {
    const times = [0, 100, 200, 2200]
    const summary = summarizeChannel('rpm', [0, 10, 20, 20], times, 100)
    expect(summary.mean).toBe(12.5)
    expect(summary.timeWeightedMean).toBeCloseTo(18.64, 1)
    expect(summary.gaps).toBe(1)
    expect(medianCadence(times)).toBe(100)
  })
})
