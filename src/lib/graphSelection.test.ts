import { describe, expect, it } from 'vitest'
import type { ChannelDefinition, ModelProfile } from '../types'
import { graphSelectionForModel, pinnedGraphChannels } from './graphSelection'

const channels: ChannelDefinition[] = [
  { key: 'throttle||1', rawLabel: 'Throttle', label: 'Throttle', unit: '', occurrence: 1, index: 0, kind: 'numeric' },
  { key: 'vfr|%|1', rawLabel: 'VFR', label: 'VFR', unit: '%', occurrence: 1, index: 1, kind: 'numeric' },
  { key: 'empty||1', rawLabel: 'Empty', label: 'Empty', unit: '', occurrence: 1, index: 2, kind: 'empty' }
]

function model(graphChannelKeys?: string[]): ModelProfile {
  return {
    id: 'model', name: 'Model', normalizedName: 'model', description: '', category: 'airplane', propulsion: 'electric',
    rfProtocol: 'unknown', receiverCount: 1, receiverBatteries: [{ chemistry: 'none' }], propulsionBatteries: [{ chemistry: 'none' }],
    channelSettings: { 'vfr|%|1': { label: 'VFR', pinned: true } }, graphChannelKeys,
    flightRule: { operator: '>', threshold: 0, minimumDurationMs: 3000, mergeGapMs: 30000 }, rules: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('graphSelectionForModel', () => {
  it('restores the saved per-plane selection and ignores unavailable channels', () => {
    expect(graphSelectionForModel(model(['throttle||1', 'missing||1', 'throttle||1']), channels, 24)).toEqual(['throttle||1'])
  })

  it('preserves an intentionally cleared selection', () => {
    expect(graphSelectionForModel(model([]), channels, 24)).toEqual([])
  })

  it('uses pinned channels for profiles without a saved selection', () => {
    const legacy = model()
    delete legacy.graphChannelKeys
    expect(graphSelectionForModel(legacy, channels, 24)).toEqual(['vfr|%|1'])
  })

  it('returns pinned active channels regardless of the saved selection', () => {
    expect(pinnedGraphChannels(model(['throttle||1']), channels, 24)).toEqual(['vfr|%|1'])
    expect(pinnedGraphChannels(model([]), channels, 0)).toEqual([])
  })
})
