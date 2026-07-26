import type { ParsedLog, PropulsionType, RfProtocol } from '../types'
import { inferBatteriesFromLog } from './batteryInference'

export interface WizardSuggestions {
  propulsion?: PropulsionType
  rfProtocol?: RfProtocol
  receiverCount?: number
  flightChannelKey?: string
  flightThreshold?: number
  flightStopThreshold?: number
  notes: string[]
}

export function inferWizardSuggestions(parsed: Pick<ParsedLog, 'channels' | 'summaries'>): WizardSuggestions {
  const summaries = new Map(parsed.summaries.map((summary) => [summary.channelKey, summary]))
  const active = parsed.channels.filter((channel) => channel.kind !== 'empty' && (summaries.get(channel.key)?.count ?? 0) > 0)
  const label = (channel: typeof active[number]) => `${channel.rawLabel} ${channel.label}`
  const find = (pattern: RegExp, useful: (channel: typeof active[number]) => boolean = () => true) => active.find((channel) => pattern.test(label(channel)) && useful(channel))
  const range = (channel: typeof active[number]) => {
    const summary = summaries.get(channel.key)
    return summary?.min === null || summary?.min === undefined || summary.max === null ? 0 : summary.max - summary.min
  }
  const notes: string[] = []

  const hasTurbine = Boolean(find(/\bturbine\b|\becu\b.*(?:state|status)|\begt\b/i))
  const inferredBatteries = inferBatteriesFromLog(parsed)
  const hasElectric = Boolean(find(/\besc\b.*(?:voltage|current|consumption|rpm)/i)) || inferredBatteries.propulsionBatteries.length > 0
  const hasCombustion = Boolean(find(/\baes\b|fuel.*flow|cylinder|\bcht\b|ignition/i))
  let propulsion: PropulsionType | undefined
  if (hasTurbine) propulsion = 'turbine'
  else if (hasElectric) propulsion = 'electric'
  else if (hasCombustion) propulsion = 'combustion'
  if (propulsion) notes.push(`Propulsion looks ${propulsion}.`)

  const has900 = Boolean(find(/900\s*m/i))
  const has24 = Boolean(find(/2[.]?4\s*g/i))
  const rfProtocol: RfProtocol | undefined = has900 && has24 ? 'td-tw' : undefined
  if (rfProtocol) notes.push('Dual-band 2.4 GHz / 900 MHz telemetry was detected.')

  const explicitReceiverNumbers = new Set(active.flatMap((channel) => {
    const match = channel.rawLabel.trim().match(/^(?:receiver|rx)\s*(\d+)\b/i)
    return match ? [Number(match[1])] : []
  }))
  const receiverCount = explicitReceiverNumbers.size > 1 ? Math.min(3, explicitReceiverNumbers.size) : undefined
  if (receiverCount) notes.push(`${receiverCount} explicitly numbered receivers were detected.`)

  const flightChannel = find(/^throttle\b/i, (channel) => range(channel) >= 100)
    ?? find(/^esc\s*current\b/i, (channel) => (summaries.get(channel.key)?.p95 ?? 0) >= 0.5 && range(channel) >= 0.25)
    ?? find(/(?:esc\s*)?rpm\b/i, (channel) => (summaries.get(channel.key)?.p95 ?? 0) >= 100 && range(channel) >= 100)
  let flightThreshold: number | undefined
  let flightStopThreshold: number | undefined
  if (flightChannel) {
    const summary = summaries.get(flightChannel.key)
    const rawLabel = flightChannel.rawLabel
    if (/^throttle\b/i.test(rawLabel)) {
      const minimum = summary?.min ?? -1024
      const maximum = summary?.max ?? 1024
      const range = Math.max(0, maximum - minimum)
      flightThreshold = Math.round(minimum + range * 0.11)
      flightStopThreshold = Math.round(minimum + range * 0.04)
    } else if (/current/i.test(rawLabel)) {
      flightThreshold = Math.max(0.5, Math.round(((summary?.p95 ?? 5) * 0.1) * 10) / 10)
      flightStopThreshold = Math.max(0.2, Math.round(flightThreshold * 0.5 * 10) / 10)
    } else {
      flightThreshold = Math.max(100, Math.round((summary?.p95 ?? 2000) * 0.05 / 100) * 100)
      flightStopThreshold = Math.max(50, flightThreshold * 0.5)
    }
    notes.push(`${rawLabel} was selected for flight detection.`)
  }

  return { propulsion, rfProtocol, receiverCount, flightChannelKey: flightChannel?.key, flightThreshold, flightStopThreshold, notes }
}
