import { describe, expect, it } from 'vitest'
import { inferBatteriesFromLog } from './batteryInference'
import type { ChannelDefinition, ChannelSummary } from '../types'

function channel(key: string, rawLabel: string): ChannelDefinition {
  return { key, rawLabel, label: rawLabel, unit: 'V', occurrence: 1, index: 0, kind: 'numeric' }
}

function summary(channelKey: string, p95: number): ChannelSummary {
  return { channelKey, count: 100, coverage: 1, min: p95 - 0.4, max: p95, mean: p95 - 0.2, timeWeightedMean: p95 - 0.2, p05: p95 - 0.4, median: p95 - 0.2, p95, gaps: 0 }
}

describe('battery inference', () => {
  it('recognizes separate receiver packs and an ESC flight pack', () => {
    const channels = [channel('rx1', 'RxBatt1'), channel('rx2', 'RxBatt2'), channel('esc', 'ESC voltage')]
    const result = inferBatteriesFromLog({ channels, summaries: [summary('rx1', 8.1), summary('rx2', 8.05), summary('esc', 16.7)] })
    expect(result.receiverBatteries).toHaveLength(2)
    expect(result.receiverBatteries[0]).toMatchObject({ chemistry: 'lipo', cells: 2, voltageChannelKey: 'rx1', inferred: true })
    expect(result.propulsionBatteries[0]).toMatchObject({ chemistry: 'lipo', cells: 4, voltageChannelKey: 'esc', inferred: true })
  })

  it('uses populated per-cell channels without counting empty positions', () => {
    const channels = [1, 2, 3, 4].map((cell) => channel(`cell${cell}`, `LiPo${cell}`))
    const result = inferBatteriesFromLog({ channels, summaries: channels.map((item) => summary(item.key, 4.17)) })
    expect(result.propulsionBatteries[0]).toMatchObject({ chemistry: 'lipo', cells: 4, voltageChannelKey: 'cell1' })
  })

  it('keeps banked LiPo cell groups distinct', () => {
    const channels = ['LiPo A1', 'LiPo A2', 'LiPo B1', 'LiPo B2'].map((label, index) => channel(`cell${index}`, label))
    channels.push({ ...channel('pack-a', 'LiPo A pack voltage'), derivedKind: 'lipo-pack-voltage', derivedGroup: 'A' })
    const result = inferBatteriesFromLog({ channels, summaries: channels.map((item) => summary(item.key, item.key === 'pack-a' ? 8.3 : 4.18)) })
    expect(result.receiverBatteries).toMatchObject([
      { chemistry: 'lipo', cells: 2, voltageChannelKey: 'pack-a' },
      { chemistry: 'lipo', cells: 2, voltageChannelKey: 'cell2' }
    ])
  })

  it('classifies large lettered LiPo banks as separate flight batteries', () => {
    const channels = ['A', 'B'].flatMap((bank) => [1, 2, 3, 4, 5, 6].map((cell) => channel(`${bank}${cell}`, `LiPo ${bank}${cell}`)))
    const result = inferBatteriesFromLog({ channels, summaries: channels.map((item) => summary(item.key, 4.18)) })
    expect(result.propulsionBatteries).toMatchObject([
      { chemistry: 'lipo', cells: 6, voltageChannelKey: 'A1' },
      { chemistry: 'lipo', cells: 6, voltageChannelKey: 'B1' }
    ])
  })

  it('keeps lettered receiver banks separate from a mismatched ESC flight pack', () => {
    const cells = ['A', 'B'].flatMap((bank) => [1, 2].map((cell) => channel(`${bank}${cell}`, `LiPo ${bank}${cell}`)))
    const channels = [
      ...cells,
      { ...channel('pack-a', 'LiPo A pack voltage'), derivedKind: 'lipo-pack-voltage' as const, derivedGroup: 'A' },
      { ...channel('pack-b', 'LiPo B pack voltage'), derivedKind: 'lipo-pack-voltage' as const, derivedGroup: 'B' },
      channel('servo', 'SRV1 volt'),
      channel('esc', 'ESC voltage')
    ]
    const summaries = channels.map((item) => summary(item.key, item.key.startsWith('pack-') ? 8.3 : item.key === 'esc' ? 24.9 : 4.18))
    const result = inferBatteriesFromLog({ channels, summaries })
    expect(result.receiverBatteries).toMatchObject([
      { chemistry: 'lipo', cells: 2, voltageChannelKey: 'pack-a' },
      { chemistry: 'lipo', cells: 2, voltageChannelKey: 'pack-b' }
    ])
    expect(result.propulsionBatteries).toMatchObject([{ chemistry: 'lipo', cells: 6, voltageChannelKey: 'esc' }])
  })

  it('recognizes a stable receiver BEC voltage', () => {
    const bec = channel('bec', 'BEC voltage')
    const result = inferBatteriesFromLog({ channels: [bec], summaries: [{ ...summary('bec', 6.05), p05: 5.95, min: 5.9 }] })
    expect(result.receiverBatteries[0]).toMatchObject({ source: 'bec', chemistry: 'none', becVoltage: 6, voltageChannelKey: 'bec', inferred: true })
  })
})
