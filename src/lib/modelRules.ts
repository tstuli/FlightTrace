import type { ChannelDefinition, DiagnosticRule, ModelProfile } from '../types'
import { packThresholds, propulsionBatteriesFor, receiverBatteriesFor } from './battery'
import { lipoCellIdentity } from './channels'

function id() {
  return crypto.randomUUID()
}

function matching(channels: ChannelDefinition[], pattern: RegExp) {
  return channels.filter((channel) => pattern.test(`${channel.rawLabel} ${channel.unit}`)).map((channel) => channel.key)
}

function addBatteryRules(
  rules: DiagnosticRule[],
  label: string,
  batteries: ReturnType<typeof receiverBatteriesFor>,
  detectedChannels: string[],
  channels: ChannelDefinition[]
) {
  const availableChannels = new Map(channels.filter((channel) => channel.kind !== 'empty').map((channel) => [channel.key, channel]))
  batteries.forEach((battery, index) => {
    const selectedChannel = battery.voltageChannelKey ? availableChannels.get(battery.voltageChannelKey) : undefined
    const selectedCell = selectedChannel ? lipoCellIdentity(selectedChannel) : undefined
    const channelKeys = selectedCell
      ? channels.filter((channel) => channel.kind !== 'empty' && lipoCellIdentity(channel)?.bank === selectedCell.bank).map((channel) => channel.key)
      : selectedChannel
        ? [selectedChannel.key]
      : batteries.length === 1
        ? detectedChannels
        : detectedChannels[index] ? [detectedChannels[index]] : []
    const thresholds = selectedCell && battery.source !== 'bec'
      ? { warning: battery.lowPerCell, critical: battery.criticalPerCell }
      : packThresholds(battery)
    if (!channelKeys.length || (thresholds.warning === undefined && thresholds.critical === undefined)) return
    const sourceLabel = battery.source === 'bec' ? label.replace(/battery/i, 'BEC') : label
    const batteryName = batteries.length === 1 ? sourceLabel : `${sourceLabel} ${index + 1}`
    const name = selectedCell ? `${batteryName} cell` : batteryName
    const hysteresis = selectedCell ? 0.05 : 0.15
    if (thresholds.warning !== undefined) rules.push({
      id: id(), name: `${name} low`, kind: 'threshold', channelKeys, aggregation: 'any', operator: '<',
      value: thresholds.warning, severity: 'warning', minimumDurationMs: 2000, hysteresis, enabled: true, generated: true
    })
    if (thresholds.critical !== undefined) rules.push({
      id: id(), name: `${name} critical`, kind: 'threshold', channelKeys, aggregation: 'any', operator: '<',
      value: thresholds.critical, severity: 'critical', minimumDurationMs: 1000, hysteresis, enabled: true, generated: true
    })
  })
}

export function generateModelRules(model: ModelProfile, channels: ChannelDefinition[]): DiagnosticRule[] {
  const rules: DiagnosticRule[] = [{
    id: id(), name: 'Telemetry sampling gap', kind: 'gap', channelKeys: channels.filter((channel) => channel.kind !== 'empty').map((channel) => channel.key),
    aggregation: 'any', value: 1200, severity: 'warning', minimumDurationMs: 0, hysteresis: 0, enabled: true, generated: true
  }]

  const vfr = matching(channels, /\bvfr\b/i)
  if (vfr.length) rules.push({
    id: id(), name: 'Link quality below 50%', kind: 'threshold', channelKeys: vfr,
    aggregation: vfr.length > 1 ? 'all' : 'any', operator: '<', value: 50, severity: 'warning',
    minimumDurationMs: 1000, hysteresis: 5, enabled: true, generated: true
  })

  const rssi = matching(channels, /\brssi\b/i)
  if (rssi.length && model.rfProtocol !== 'unknown' && model.rfProtocol !== 'other') {
    const low = model.rfProtocol === 'accst' ? 45 : 35
    const critical = model.rfProtocol === 'accst' ? 42 : 32
    rules.push(
      { id: id(), name: 'RSSI low', kind: 'threshold', channelKeys: rssi, aggregation: rssi.length > 1 ? 'all' : 'any', operator: '<', value: low, severity: 'warning', minimumDurationMs: 1000, hysteresis: 2, enabled: true, generated: true },
      { id: id(), name: 'RSSI critical', kind: 'threshold', channelKeys: rssi, aggregation: rssi.length > 1 ? 'all' : 'any', operator: '<', value: critical, severity: 'critical', minimumDurationMs: 500, hysteresis: 2, enabled: true, generated: true }
    )
  }

  addBatteryRules(rules, 'Receiver battery', receiverBatteriesFor(model), matching(channels, /rx.?batt|receiver.*volt|rxbt|bec.*volt/i), channels)
  if (model.propulsion === 'electric') {
    addBatteryRules(rules, 'Flight battery', propulsionBatteriesFor(model), matching(channels, /vfas|esc.*volt|flight.*batt|propulsion.*volt|drive.*volt|main.*batt/i), channels)
  }

  for (const channel of channels.filter((candidate) => candidate.kind !== 'empty' && candidate.derivedKind === 'lipo-cell-deviation')) {
    const bank = channel.derivedGroup === 'MAIN' ? '' : ` ${channel.derivedGroup}`
    rules.push(
      { id: id(), name: `LiPo${bank} cell deviation elevated`, kind: 'threshold', channelKeys: [channel.key], aggregation: 'any', operator: '>', value: 0.1, severity: 'warning', minimumDurationMs: 2000, hysteresis: 0.02, enabled: true, generated: true },
      { id: id(), name: `LiPo${bank} cell deviation high`, kind: 'threshold', channelKeys: [channel.key], aggregation: 'any', operator: '>', value: 0.2, severity: 'critical', minimumDurationMs: 1000, hysteresis: 0.02, enabled: true, generated: true }
    )
  }

  const temperature = matching(channels, /temp|egt/i)
  if (temperature.length && model.temperatureMaximum) rules.push({
    id: id(), name: 'Temperature high', kind: 'threshold', channelKeys: temperature, aggregation: 'any', operator: '>',
    value: model.temperatureMaximum, severity: 'critical', minimumDurationMs: 1000, hysteresis: 5, enabled: true, generated: true
  })
  const rpm = matching(channels, /\brpm\b/i)
  if (rpm.length && model.rpmMaximum) rules.push({
    id: id(), name: 'RPM above configured maximum', kind: 'threshold', channelKeys: rpm, aggregation: 'any', operator: '>',
    value: model.rpmMaximum, severity: 'critical', minimumDurationMs: 500, hysteresis: 500, enabled: true, generated: true
  })
  const fuelPercent = matching(channels, /fuel.*%|res.*pect/i)
  if (fuelPercent.length && model.fuelCapacityMl) rules.push({
    id: id(), name: 'Fuel below 20%', kind: 'threshold', channelKeys: fuelPercent, aggregation: 'any', operator: '<',
    value: 20, severity: 'warning', minimumDurationMs: 2000, hysteresis: 3, enabled: true, generated: true
  })
  return rules
}
