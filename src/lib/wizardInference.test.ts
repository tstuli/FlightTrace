import { describe, expect, it } from 'vitest'
import type { ChannelDefinition, ChannelSummary } from '../types'
import { inferWizardSuggestions } from './wizardInference'

function channel(key: string, rawLabel: string): ChannelDefinition {
  return { key, rawLabel, label: rawLabel, unit: '', occurrence: 1, index: 0, kind: 'numeric' }
}

function summary(channelKey: string, min: number, max: number, p95 = max): ChannelSummary {
  return { channelKey, count: 100, coverage: 1, min, max, mean: (min + max) / 2, timeWeightedMean: (min + max) / 2, p05: min, median: (min + max) / 2, p95, gaps: 0 }
}

describe('wizard inference', () => {
  it('detects electric dual-band telemetry and selects throttle with data-aware thresholds', () => {
    const channels = [channel('throttle', 'Throttle'), channel('esc', 'ESC current'), channel('rssi24', 'RSSI 2.4G'), channel('rssi900', 'RSSI 900M')]
    const result = inferWizardSuggestions({ channels, summaries: [summary('throttle', -1024, 1024), summary('esc', 0, 50), summary('rssi24', 40, 90), summary('rssi900', 40, 90)] })
    expect(result).toMatchObject({ propulsion: 'electric', rfProtocol: 'td-tw', flightChannelKey: 'throttle', flightThreshold: -799, flightStopThreshold: -942 })
  })

  it('uses RPM for flight detection on combustion telemetry without throttle', () => {
    const channels = [channel('rpm', 'AES RPM 1'), channel('flow', 'AES flow')]
    const result = inferWizardSuggestions({ channels, summaries: [summary('rpm', 0, 8000, 7000), summary('flow', 0, 20)] })
    expect(result).toMatchObject({ propulsion: 'combustion', flightChannelKey: 'rpm', flightThreshold: 400, flightStopThreshold: 200 })
  })

  it('ignores an inactive throttle column and falls back to changing RPM telemetry', () => {
    const channels = [channel('throttle', 'Throttle'), channel('rpm', 'ESC RPM')]
    const result = inferWizardSuggestions({ channels, summaries: [summary('throttle', -1024, -1024), summary('rpm', 0, 9000, 8000)] })
    expect(result).toMatchObject({ propulsion: 'electric', flightChannelKey: 'rpm', flightThreshold: 400, flightStopThreshold: 200 })
  })

  it('does not mistake A/B receiver cell banks with servo telemetry for an electric drive pack', () => {
    const channels = ['A', 'B'].flatMap((bank) => [1, 2, 3, 4].map((cell) => channel(`${bank}${cell}`, `LiPo ${bank}${cell}`)))
    channels.push(channel('servo', 'SRV1 volt'))
    const result = inferWizardSuggestions({ channels, summaries: channels.map((item) => summary(item.key, 3.8, 4.2, 4.18)) })
    expect(result.propulsion).toBeUndefined()
  })
})
