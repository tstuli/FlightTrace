import type { ChannelDefinition } from '../types'

const UNIT_PATTERN = /^(.*?)(?:\(([^()]*)\))?\s*$/

export function normalizeToken(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function parseHeader(rawHeader: string, index: number, occurrences: Map<string, number>): ChannelDefinition {
  const trimmed = rawHeader.replace(/^\uFEFF/, '').trim()
  const match = trimmed.match(UNIT_PATTERN)
  const rawLabel = (match?.[1] || trimmed || `Column ${index + 1}`).trim()
  const unit = (match?.[2] || '').trim()
  const base = `${normalizeToken(rawLabel)}|${normalizeToken(unit)}`
  const occurrence = (occurrences.get(base) ?? 0) + 1
  occurrences.set(base, occurrence)
  return {
    key: `${base}|${occurrence}`,
    rawLabel,
    label: rawLabel,
    unit,
    occurrence,
    index,
    kind: 'numeric'
  }
}

export function displayChannelName(channel: ChannelDefinition): string {
  const suffix = channel.occurrence > 1 ? ` [${channel.occurrence}]` : ''
  return `${channel.label}${suffix}${channel.unit ? ` (${channel.unit})` : ''}`
}

export function isTimestampLabel(label: string): boolean {
  const normalized = normalizeToken(label)
  return normalized === 'date' || normalized === 'time' || normalized === 'timestamp' || normalized === 'datetime'
}

export interface LipoCellIdentity {
  bank: string
  cell: number
}

export function lipoCellIdentity(channel: Pick<ChannelDefinition, 'rawLabel' | 'label'> | string): LipoCellIdentity | undefined {
  const label = typeof channel === 'string' ? channel : channel.rawLabel || channel.label
  const match = label.trim().match(/^lipo\s*([a-z])?\s*(\d+)$/i)
  if (!match) return undefined
  const cell = Number(match[2])
  if (!Number.isInteger(cell) || cell < 1) return undefined
  return { bank: match[1]?.toUpperCase() ?? 'MAIN', cell }
}

export function isIndividualLipoCellChannel(channel: Pick<ChannelDefinition, 'rawLabel' | 'label'>): boolean {
  return lipoCellIdentity(channel) !== undefined
}

export function isVoltageTelemetryChannel(channel: ChannelDefinition): boolean {
  if (channel.kind === 'empty' || /^tx\s*(?:bat|volt)/i.test(channel.rawLabel.trim())) return false
  if (channel.derivedKind === 'lipo-cell-deviation') return false
  if (channel.derivedKind === 'lipo-pack-voltage') return true
  if (isIndividualLipoCellChannel(channel)) return true
  return /volt|batt|rxbt|vfas|bec/i.test(`${channel.rawLabel} ${channel.label}`) || /^v(?:olt)?s?$/i.test(channel.unit.trim())
}
