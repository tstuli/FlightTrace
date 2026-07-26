import { describe, expect, it } from 'vitest'
import type { ChannelDefinition } from '../types'
import { deriveLipoTelemetry, groupLipoCellChannels } from './lipoTelemetry'

function channel(key: string, label: string, index: number, kind: ChannelDefinition['kind'] = 'numeric'): ChannelDefinition {
  return { key, rawLabel: label, label, unit: 'V', occurrence: 1, index, kind }
}

describe('LiPo derived telemetry', () => {
  it('groups unlettered and lettered cells independently in numeric cell order', () => {
    const groups = groupLipoCellChannels([
      channel('a2', 'LiPo A2', 0), channel('main2', 'LiPo2', 1), channel('a1', 'LiPo A1', 2), channel('main1', 'LiPo1', 3),
      channel('a3-empty', 'LiPo A3', 4, 'empty')
    ])
    expect([...groups.keys()]).toEqual(['A', 'MAIN'])
    expect(groups.get('A')?.map(({ channel: item }) => item.key)).toEqual(['a1', 'a2'])
    expect(groups.get('MAIN')?.map(({ channel: item }) => item.key)).toEqual(['main1', 'main2'])
  })

  it('creates full-pack sums and maximum cell deviation without partial sums', () => {
    const channels = [channel('c1', 'LiPo1', 0), channel('c2', 'LiPo2', 1), channel('c3', 'LiPo3', 2)]
    const derived = deriveLipoTelemetry(channels, {
      c1: [4.2, 4.0, 3.9], c2: [4.1, 3.8, null], c3: [4.15, 3.9, 3.8]
    }, 3)
    expect(derived.map(({ channel: item }) => item.derivedKind)).toEqual(['lipo-pack-voltage', 'lipo-cell-deviation'])
    expect(derived[0].values[0]).toBeCloseTo(12.45)
    expect(derived[0].values[1]).toBeCloseTo(11.7)
    expect(derived[0].values[2]).toBeNull()
    expect(derived[1].values[0]).toBeCloseTo(0.1)
    expect(derived[1].values[1]).toBeCloseTo(0.2)
    expect(derived[1].values[2]).toBeNull()
  })
})
