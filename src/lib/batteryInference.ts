import { batteryWithDefaults } from './battery'
import { lipoCellIdentity } from './channels'
import type { BatteryProfile, ChannelDefinition, ChannelSummary, ParsedLog } from '../types'

export interface BatteryInference {
  receiverBatteries: BatteryProfile[]
  propulsionBatteries: BatteryProfile[]
}

function summaryFor(channel: ChannelDefinition, summaries: Map<string, ChannelSummary>) {
  return summaries.get(channel.key)
}

function activeVoltageChannel(channel: ChannelDefinition, summaries: Map<string, ChannelSummary>) {
  const summary = summaryFor(channel, summaries)
  return channel.kind !== 'empty' && !!summary?.count && summary.p95 !== null && summary.p95 > 0
}

function estimatedLipoCells(voltage: number): number | undefined {
  let best: { cells: number; score: number } | undefined
  for (let cells = 1; cells <= 24; cells += 1) {
    const perCell = voltage / cells
    if (perCell < 3.4 || perCell > 4.3) continue
    const score = Math.abs(perCell - 4.05)
    if (!best || score < best.score) best = { cells, score }
  }
  return best?.cells
}

function inferredLipo(cells: number, note: string, voltageChannelKey?: string): BatteryProfile {
  return batteryWithDefaults({ chemistry: 'lipo', cells, voltageChannelKey, inferred: true, inferenceNote: note })
}

function inferredBec(voltage: number, note: string, voltageChannelKey: string): BatteryProfile {
  return {
    source: 'bec', chemistry: 'none', becVoltage: voltage,
    lowVoltage: Math.round(voltage * 0.9 * 10) / 10,
    criticalVoltage: Math.round(voltage * 0.84 * 10) / 10,
    voltageChannelKey, inferred: true, inferenceNote: note
  }
}

export function inferBatteriesFromLog(parsed: Pick<ParsedLog, 'channels' | 'summaries'>): BatteryInference {
  const summaries = new Map(parsed.summaries.map((summary) => [summary.channelKey, summary]))
  const active = parsed.channels.filter((channel) => activeVoltageChannel(channel, summaries))
  const cellGroups = new Map<string, ChannelDefinition[]>()
  const packChannels = new Map(active.filter((channel) => channel.derivedKind === 'lipo-pack-voltage' && channel.derivedGroup).map((channel) => [channel.derivedGroup!, channel]))

  for (const channel of active) {
    const identity = lipoCellIdentity(channel)
    if (!identity) continue
    const summary = summaryFor(channel, summaries)!
    if (summary.p95! < 2.5 || summary.p95! > 4.5) continue
    cellGroups.set(identity.bank, [...(cellGroups.get(identity.bank) ?? []), channel])
  }

  const receiverAggregate = active.filter((channel) => /^(?:rx\s*batt|rxbatt|receiver.*volt|bec.*volt(?:age)?)\s*\d*$/i.test(channel.rawLabel.trim()))
  const flightAggregate = active.filter((channel) => /^(?:esc\s*voltage|vfas|flight.*batt|propulsion.*volt|drive.*volt|main.*batt)/i.test(channel.rawLabel.trim()))
  const receiverBatteries: BatteryProfile[] = []
  const propulsionBatteries: BatteryProfile[] = []
  const usedReceiverAggregate = new Set<string>()
  const usedFlightAggregate = new Set<string>()
  const hasServoPowerTelemetry = active.some((channel) => /\bsrv\s*\d+.*(?:volt|curr)/i.test(channel.rawLabel))

  const closestAggregate = (voltage: number, candidates: ChannelDefinition[], used: Set<string>) => {
    const ranked = candidates
      .filter((channel) => !used.has(channel.key))
      .map((channel) => ({ channel, difference: Math.abs((summaryFor(channel, summaries)?.p95 ?? 0) - voltage) / voltage }))
      .sort((left, right) => left.difference - right.difference)
    return ranked[0]?.difference <= 0.15 ? ranked[0] : undefined
  }

  for (const [group, cells] of cellGroups) {
    const packChannel = packChannels.get(group)
    const packVoltage = (packChannel ? summaryFor(packChannel, summaries)?.p95 : undefined) ?? cells.reduce((total, cell) => total + (summaryFor(cell, summaries)?.p95 ?? 0), 0)
    const receiverMatch = closestAggregate(packVoltage, receiverAggregate, usedReceiverAggregate)
    const flightMatch = closestAggregate(packVoltage, flightAggregate, usedFlightAggregate)
    const directReceiverMatch = receiverMatch && (!flightMatch || receiverMatch.difference < flightMatch.difference) ? receiverMatch : undefined
    const directFlightMatch = flightMatch && (!receiverMatch || flightMatch.difference <= receiverMatch.difference) ? flightMatch : undefined
    const likelyPropulsion = directFlightMatch
      ? true
      : directReceiverMatch
        ? false
        : group === 'MAIN'
          ? cells.length >= 3
          : cells.length >= 4 && !hasServoPowerTelemetry && flightAggregate.length === 0
    const aggregate = likelyPropulsion ? directFlightMatch?.channel : directReceiverMatch?.channel
    if (directFlightMatch && likelyPropulsion) usedFlightAggregate.add(directFlightMatch.channel.key)
    if (directReceiverMatch && !likelyPropulsion) usedReceiverAggregate.add(directReceiverMatch.channel.key)
    const groupLabel = group === 'MAIN' ? '' : ` ${group}`
    const matchedNote = aggregate ? ` Its pack voltage agrees with ${aggregate.rawLabel}.` : ''
    const profile = inferredLipo(cells.length, `Estimated from ${cells.length} active LiPo${groupLabel} cell channels.${matchedNote}`, packChannel?.key ?? aggregate?.key ?? cells[0]?.key)
    if (likelyPropulsion) propulsionBatteries.push(profile)
    else receiverBatteries.push(profile)
  }

  for (const channel of receiverAggregate) {
    if (usedReceiverAggregate.has(channel.key)) continue
    const summary = summaryFor(channel, summaries)
    const voltage = summary?.p95
    if (/bec/i.test(channel.rawLabel)) continue
    if (voltage === null || voltage === undefined || voltage < 6.8) continue
    const cells = estimatedLipoCells(voltage)
    if (cells) {
      receiverBatteries.push(inferredLipo(cells, `Estimated from ${channel.rawLabel} reaching about ${voltage.toFixed(2)} V.`, channel.key))
      usedReceiverAggregate.add(channel.key)
    }
  }

  const commonOutputs = [5, 6, 7.4, 8.4]
  for (const channel of receiverAggregate) {
    if (usedReceiverAggregate.has(channel.key)) continue
    const summary = summaryFor(channel, summaries)
    if (summary?.p95 === null || summary?.p95 === undefined || summary.p05 === null) continue
    const output = commonOutputs.reduce((best, candidate) => Math.abs(candidate - summary.p95!) < Math.abs(best - summary.p95!) ? candidate : best)
    const stable = summary.p95 - summary.p05 <= 0.3
    if ((/bec/i.test(channel.rawLabel) || stable) && Math.abs(output - summary.p95) <= 0.45) {
      receiverBatteries.push(inferredBec(output, `Estimated from the stable ${channel.rawLabel} signal near ${summary.p95.toFixed(2)} V.`, channel.key))
      usedReceiverAggregate.add(channel.key)
    }
  }

  for (const channel of flightAggregate) {
    if (usedFlightAggregate.has(channel.key)) continue
    const voltage = summaryFor(channel, summaries)?.p95
    if (voltage === null || voltage === undefined) continue
    const cells = estimatedLipoCells(voltage)
    if (cells) propulsionBatteries.push(inferredLipo(cells, `Estimated from ${channel.rawLabel} reaching about ${voltage.toFixed(2)} V.`, channel.key))
  }

  return { receiverBatteries, propulsionBatteries }
}
