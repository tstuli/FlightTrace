import { describe, expect, it } from 'vitest'
import { displayChannelName, isVoltageTelemetryChannel, lipoCellIdentity, parseHeader } from './channels'

describe('channel identity', () => {
  it('extracts units and preserves duplicate occurrence', () => {
    const occurrences = new Map<string, number>()
    const first = parseHeader('RX', 4, occurrences)
    const second = parseHeader('RX', 12, occurrences)
    const altitude = parseHeader('Altitude(ft)', 13, occurrences)
    expect(first.key).toBe('rx||1')
    expect(second.key).toBe('rx||2')
    expect(displayChannelName(second)).toBe('RX [2]')
    expect(altitude.unit).toBe('ft')
  })

  it('recognizes individual LiPo cell points as voltage telemetry', () => {
    const occurrences = new Map<string, number>()
    const a1 = parseHeader('LiPo A1(V)', 1, occurrences)
    const b8 = parseHeader('LiPo B8(V)', 2, occurrences)
    const main = parseHeader('LiPo6(V)', 3, occurrences)
    const tx = parseHeader('TxBat(V)', 4, occurrences)
    const pack = { ...parseHeader('LiPo A pack voltage(V)', 5, occurrences), derivedKind: 'lipo-pack-voltage' as const }
    const deviation = { ...parseHeader('LiPo A cell voltage deviation(V)', 6, occurrences), derivedKind: 'lipo-cell-deviation' as const }
    expect(lipoCellIdentity(a1)).toEqual({ bank: 'A', cell: 1 })
    expect(lipoCellIdentity(b8)).toEqual({ bank: 'B', cell: 8 })
    expect(lipoCellIdentity(main)).toEqual({ bank: 'MAIN', cell: 6 })
    expect([a1, b8, main].every(isVoltageTelemetryChannel)).toBe(true)
    expect(isVoltageTelemetryChannel(pack)).toBe(true)
    expect(isVoltageTelemetryChannel(deviation)).toBe(false)
    expect(isVoltageTelemetryChannel(tx)).toBe(false)
  })
})
