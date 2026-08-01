import { describe, expect, it } from 'vitest'
import { channelQuantity, convertParsedForDisplay, convertQuantityValue, DEFAULT_UNIT_PREFERENCES, normalizeUnitPreferences } from './units'
import type { ChannelDefinition, ChannelSummary, ParsedLog } from '../types'

function channel(key: string, label: string, unit: string): ChannelDefinition {
  return { key, rawLabel: label, label, unit, occurrence: 1, index: 0, kind: 'numeric' }
}

function summary(channelKey: string, minimum: number, maximum: number): ChannelSummary {
  return { channelKey, count: 2, coverage: 1, min: minimum, max: maximum, mean: (minimum + maximum) / 2, timeWeightedMean: (minimum + maximum) / 2, p05: minimum, median: (minimum + maximum) / 2, p95: maximum, gaps: 0 }
}

describe('global display units', () => {
  it('classifies common flight quantities without confusing vertical and horizontal speed', () => {
    expect(channelQuantity(channel('alt', 'GPS Altitude', 'm'))).toBe('altitude')
    expect(channelQuantity(channel('gps-alt', 'GPSAlt', 'm'))).toBe('altitude')
    expect(channelQuantity(channel('speed', 'GSpd', 'km/h'))).toBe('speed')
    expect(channelQuantity(channel('vario', 'VSpd', 'm/s'))).toBe('verticalSpeed')
    expect(channelQuantity(channel('vertical', 'VerticalSpeed', 'm/s'))).toBe('verticalSpeed')
    expect(channelQuantity(channel('climb', 'Climb', 'ft/min'))).toBe('verticalSpeed')
    expect(channelQuantity(channel('temp', 'Engine temperature', '°C'))).toBe('temperature')
    expect(channelQuantity(channel('pressure', 'Barometer', 'hPa'))).toBe('pressure')
    expect(channelQuantity(channel('voltage', 'Receiver voltage', 'V'))).toBeUndefined()
  })

  it('converts aviation quantities through canonical base units', () => {
    expect(convertQuantityValue(100, 'altitude', 'm', 'ft')).toBeCloseTo(328.08399, 4)
    expect(convertQuantityValue(100, 'speed', 'km/h', 'kt')).toBeCloseTo(53.99568, 4)
    expect(convertQuantityValue(1, 'verticalSpeed', 'm/s', 'ft/min')).toBeCloseTo(196.85039, 4)
    expect(convertQuantityValue(20, 'temperature', '°C', '°F')).toBe(68)
    expect(convertQuantityValue(1013.25, 'pressure', 'hPa', 'inHg')).toBeCloseTo(29.92125, 4)
  })

  it('converts channel metadata, samples, and summaries without mutating parsed telemetry', () => {
    const channels = [channel('alt', 'Altitude', 'm'), channel('vario', 'VSpd', 'm/s'), channel('temp', 'Temperature', '°C')]
    const parsed: ParsedLog = {
      hash: 'hash', fileName: 'flight.csv', delimiter: ',', rowCount: 2,
      startLocal: '2026-01-01T00:00:00', endLocal: '2026-01-01T00:00:01', startMs: 0, endMs: 1000,
      timestamps: [0, 1000], channels,
      series: { alt: [0, 100], vario: [0, 1], temp: [0, 20] },
      summaries: [summary('alt', 0, 100), summary('vario', 0, 1), summary('temp', 0, 20)],
      warnings: [], schemaFingerprint: 'schema'
    }
    const converted = convertParsedForDisplay(parsed, { ...DEFAULT_UNIT_PREFERENCES, altitude: 'ft', verticalSpeed: 'ft/min', temperature: '°F' })

    expect(converted.channels.map(({ unit }) => unit)).toEqual(['ft', 'ft/min', '°F'])
    expect(converted.series.alt[1]).toBeCloseTo(328.08399, 4)
    expect(converted.series.vario[1]).toBeCloseTo(196.85039, 4)
    expect(converted.series.temp).toEqual([32, 68])
    expect(converted.summaries[2].median).toBe(50)
    expect(parsed.channels.map(({ unit }) => unit)).toEqual(['m', 'm/s', '°C'])
    expect(parsed.series.alt[1]).toBe(100)
  })

  it('fills missing preferences and rejects unsupported stored values', () => {
    expect(normalizeUnitPreferences({ altitude: 'ft', speed: 'warp', temperature: '°F' })).toEqual({
      ...DEFAULT_UNIT_PREFERENCES,
      altitude: 'ft',
      temperature: '°F'
    })
  })
})
