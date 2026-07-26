import { describe, expect, it } from 'vitest'
import { detectFlights, evaluateRules } from './analysis'
import type { DiagnosticRule, ParsedLog } from '../types'

const parsed: ParsedLog = {
  hash: 'hash', fileName: 'test.csv', delimiter: ',', rowCount: 8,
  startLocal: '2026-01-01T10:00:00.000', endLocal: '2026-01-01T10:00:07.000', startMs: 0, endMs: 7000,
  timestamps: [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000],
  channels: [{ key: 'throttle||1', rawLabel: 'Throttle', label: 'Throttle', unit: '', occurrence: 1, index: 2, kind: 'numeric' }],
  series: { 'throttle||1': [-1024, -500, 0, 0, -1024, 100, 100, -1024] }, summaries: [], warnings: [], schemaFingerprint: 'schema'
}

describe('analysis engine', () => {
  it('detects multiple active segments', () => {
    const flights = detectFlights(parsed, 'model', 'log', { channelKey: 'throttle||1', operator: '>', threshold: -900, minimumDurationMs: 1000, mergeGapMs: 0 })
    expect(flights).toHaveLength(2)
    expect(flights[0].startMs).toBe(1000)
    expect(flights[1].startMs).toBe(5000)
  })

  it('accumulates activity across brief dropouts before confirming a flight', () => {
    const dropoutLog: ParsedLog = {
      ...parsed,
      rowCount: 9,
      endMs: 8000,
      timestamps: [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000],
      series: { 'throttle||1': [-1024, -700, -700, -1024, -700, -700, -700, -1024, -1024] }
    }
    const flights = detectFlights(dropoutLog, 'model', 'log', { channelKey: 'throttle||1', operator: '>', threshold: -800, stopThreshold: -950, minimumDurationMs: 3000, mergeGapMs: 2000 })
    expect(flights).toHaveLength(1)
    expect(flights[0]).toMatchObject({ startMs: 1000, endMs: 6000 })
  })

  it('returns no detected flights when the configured activity never occurs', () => {
    const inactive = { ...parsed, series: { 'throttle||1': parsed.timestamps.map(() => -1024) } }
    expect(detectFlights(inactive, 'model', 'log', { channelKey: 'throttle||1', operator: '>', threshold: -800, stopThreshold: -950, minimumDurationMs: 1000, mergeGapMs: 2000 })).toEqual([])
  })

  it('applies threshold duration', () => {
    const rule: DiagnosticRule = { id: 'rule', name: 'Throttle high', kind: 'threshold', channelKeys: ['throttle||1'], aggregation: 'any', operator: '>', value: -100, severity: 'warning', minimumDurationMs: 1000, hysteresis: 0, enabled: true }
    const events = evaluateRules(parsed, 'log', [rule])
    expect(events).toHaveLength(2)
  })
})
