import { describe, expect, it } from 'vitest'
import { evaluateTelemetryQuery, quoteQueryChannel, TelemetryQueryError } from './telemetryQuery'
import type { ParsedLog } from '../types'

const parsed: ParsedLog = {
  hash: 'hash', fileName: 'query.csv', delimiter: ',', rowCount: 5,
  startLocal: '2026-01-01T10:00:00.000', endLocal: '2026-01-01T10:00:04.000', startMs: 1000, endMs: 5000,
  timestamps: [1000, 2000, 3000, 4000, 5000],
  channels: [
    { key: 'rssi||1', rawLabel: 'RSSI', label: 'RSSI', unit: 'dB', occurrence: 1, index: 1, kind: 'numeric' },
    { key: 'rx batt||1', rawLabel: 'Rx Batt', label: 'Rx Batt', unit: 'V', occurrence: 1, index: 2, kind: 'numeric' },
    { key: 'rpm||1', rawLabel: 'RPM', label: 'RPM', unit: 'rpm', occurrence: 1, index: 3, kind: 'numeric' }
  ],
  series: {
    'rssi||1': [60, 44, 42, null, 70],
    'rx batt||1': [5.1, 4.9, 4.7, 4.6, 5.0],
    'rpm||1': [0, 1000, 4000, 5000, 0]
  },
  summaries: [], warnings: [], schemaFingerprint: 'schema'
}

describe('telemetry query language', () => {
  it('filters with quoted channels and boolean operators', () => {
    const result = evaluateTelemetryQuery('`RSSI` < 45 and `Rx Batt` < 4.8', parsed)
    expect(result.matchingIndices).toEqual([2])
    expect(result.referencedChannelKeys).toEqual(['rssi||1', 'rx batt||1'])
  })

  it('supports arithmetic, elapsed time, and parentheses', () => {
    const result = evaluateTelemetryQuery('(`RPM` / 1000 >= 4 or time >= 4) and not missing(`RPM`)', parsed)
    expect(result.matchingIndices).toEqual([2, 3, 4])
  })

  it('supports functions and custom channel labels', () => {
    const result = evaluateTelemetryQuery('between(abs(`Receiver pack` - 5), 0.09, 0.41)', parsed, { 'rx batt||1': 'Receiver pack' })
    expect(result.matchingIndices).toEqual([0, 1, 2, 3])
    expect(result.matchingDurationMs).toBe(4000)
  })

  it('treats missing values as non-matches except for missing()', () => {
    expect(evaluateTelemetryQuery('`RSSI` != 70', parsed).matchingIndices).toEqual([0, 1, 2])
    expect(evaluateTelemetryQuery('missing(`RSSI`)', parsed).matchingIndices).toEqual([3])
  })

  it('reports useful syntax and unknown-channel errors', () => {
    expect(() => evaluateTelemetryQuery('`RSSI` <', parsed)).toThrow(TelemetryQueryError)
    expect(() => evaluateTelemetryQuery('Altitude > 10', parsed)).toThrow('Unknown channel “Altitude”')
  })

  it('escapes channel names for insertion', () => {
    expect(quoteQueryChannel('Engine `A`')).toBe('`Engine \\`A\\``')
  })
})
