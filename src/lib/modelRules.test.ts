import { describe, expect, it } from 'vitest'
import { generateModelRules } from './modelRules'
import type { ChannelDefinition, ModelProfile } from '../types'

const channels: ChannelDefinition[] = [
  { key: 'rx1', rawLabel: 'RxBatt1', label: 'RxBatt1', unit: 'V', occurrence: 1, index: 0, kind: 'numeric' },
  { key: 'rx2', rawLabel: 'RxBatt2', label: 'RxBatt2', unit: 'V', occurrence: 1, index: 1, kind: 'numeric' },
  { key: 'a1', rawLabel: 'LiPo A1', label: 'LiPo A1', unit: 'V', occurrence: 1, index: 2, kind: 'numeric' },
  { key: 'a2', rawLabel: 'LiPo A2', label: 'LiPo A2', unit: 'V', occurrence: 1, index: 3, kind: 'numeric' },
  { key: 'b1', rawLabel: 'LiPo B1', label: 'LiPo B1', unit: 'V', occurrence: 1, index: 4, kind: 'numeric' },
  { key: 'a-dev', rawLabel: 'LiPo A cell voltage deviation', label: 'LiPo A cell voltage deviation', unit: 'V', occurrence: 1, index: -1, kind: 'numeric', derivedKind: 'lipo-cell-deviation', derivedGroup: 'A' }
]

describe('generated battery rules', () => {
  it('creates separate rules for independently monitored receiver batteries', () => {
    const model: ModelProfile = {
      id: 'model', name: 'Model', normalizedName: 'model', description: '', category: 'airplane', propulsion: 'combustion',
      rfProtocol: 'unknown', receiverCount: 2,
      receiverBatteries: [
        { chemistry: 'lipo', cells: 2, lowPerCell: 3.5, criticalPerCell: 3.3, voltageChannelKey: 'rx1' },
        { chemistry: 'life', cells: 2, lowPerCell: 3.1, criticalPerCell: 2.8, voltageChannelKey: 'rx2' }
      ],
      channelSettings: {}, flightRule: { operator: '>', threshold: 0, minimumDurationMs: 5000, mergeGapMs: 2000 }, rules: [],
      createdAt: '', updatedAt: ''
    }
    const rules = generateModelRules(model, channels).filter((rule) => rule.name.startsWith('Receiver battery'))
    expect(rules.map((rule) => [rule.name, rule.channelKeys, rule.value])).toEqual([
      ['Receiver battery 1 low', ['rx1'], 7],
      ['Receiver battery 1 critical', ['rx1'], 6.6],
      ['Receiver battery 2 low', ['rx2'], 6.2],
      ['Receiver battery 2 critical', ['rx2'], 5.6]
    ])
  })

  it('creates whole-voltage rules for receiver BEC power', () => {
    const model: ModelProfile = {
      id: 'bec-model', name: 'BEC Model', normalizedName: 'bec model', description: '', category: 'airplane', propulsion: 'combustion',
      rfProtocol: 'unknown', receiverCount: 1,
      receiverBatteries: [{ source: 'bec', chemistry: 'none', becVoltage: 6, lowVoltage: 5.4, criticalVoltage: 5.1, voltageChannelKey: 'rx1' }],
      channelSettings: {}, flightRule: { operator: '>', threshold: 0, minimumDurationMs: 5000, mergeGapMs: 2000 }, rules: [],
      createdAt: '', updatedAt: ''
    }
    const rules = generateModelRules(model, channels).filter((rule) => rule.name.startsWith('Receiver BEC'))
    expect(rules.map((rule) => [rule.name, rule.value])).toEqual([['Receiver BEC low', 5.4], ['Receiver BEC critical', 5.1]])
  })

  it('monitors every active cell in a selected LiPo bank with per-cell thresholds', () => {
    const model: ModelProfile = {
      id: 'cell-model', name: 'Cell Model', normalizedName: 'cell model', description: '', category: 'airplane', propulsion: 'combustion',
      rfProtocol: 'unknown', receiverCount: 1,
      receiverBatteries: [{ chemistry: 'lipo', cells: 2, lowPerCell: 3.5, criticalPerCell: 3.3, voltageChannelKey: 'a1' }],
      channelSettings: {}, flightRule: { operator: '>', threshold: 0, minimumDurationMs: 5000, mergeGapMs: 2000 }, rules: [],
      createdAt: '', updatedAt: ''
    }
    const rules = generateModelRules(model, channels).filter((rule) => rule.name.startsWith('Receiver battery cell'))
    expect(rules.map((rule) => [rule.name, rule.channelKeys, rule.value, rule.hysteresis])).toEqual([
      ['Receiver battery cell low', ['a1', 'a2'], 3.5, 0.05],
      ['Receiver battery cell critical', ['a1', 'a2'], 3.3, 0.05]
    ])
  })

  it('adds maximum cell-deviation diagnostics for each derived pack group', () => {
    const model: ModelProfile = {
      id: 'deviation-model', name: 'Deviation Model', normalizedName: 'deviation model', description: '', category: 'airplane', propulsion: 'combustion',
      rfProtocol: 'unknown', receiverCount: 1, receiverBatteries: [{ chemistry: 'none' }], channelSettings: {},
      flightRule: { operator: '>', threshold: 0, minimumDurationMs: 5000, mergeGapMs: 2000 }, rules: [], createdAt: '', updatedAt: ''
    }
    const rules = generateModelRules(model, channels).filter((rule) => rule.name.startsWith('LiPo A cell deviation'))
    expect(rules.map((rule) => [rule.name, rule.value, rule.severity])).toEqual([
      ['LiPo A cell deviation elevated', 0.1, 'warning'],
      ['LiPo A cell deviation high', 0.2, 'critical']
    ])
  })
})
