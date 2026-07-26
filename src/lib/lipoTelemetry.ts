import type { ChannelDefinition } from '../types'
import { lipoCellIdentity } from './channels'

export interface DerivedTelemetrySeries {
  channel: ChannelDefinition
  values: Array<number | null>
}

interface CellChannel {
  channel: ChannelDefinition
  cell: number
}

export function groupLipoCellChannels(channels: ChannelDefinition[]): Map<string, CellChannel[]> {
  const groups = new Map<string, CellChannel[]>()
  for (const channel of channels) {
    if (channel.kind !== 'numeric') continue
    const identity = lipoCellIdentity(channel)
    if (!identity) continue
    groups.set(identity.bank, [...(groups.get(identity.bank) ?? []), { channel, cell: identity.cell }])
  }
  for (const cells of groups.values()) cells.sort((left, right) => left.cell - right.cell || left.channel.index - right.channel.index)
  return groups
}

function derivedChannel(bank: string, kind: NonNullable<ChannelDefinition['derivedKind']>): ChannelDefinition {
  const bankLabel = bank === 'MAIN' ? '' : ` ${bank}`
  const metric = kind === 'lipo-pack-voltage' ? 'pack voltage' : 'cell voltage deviation'
  return {
    key: `derived|lipo|${bank.toLocaleLowerCase()}|${kind}`,
    rawLabel: `LiPo${bankLabel} ${metric}`,
    label: `LiPo${bankLabel} ${metric}`,
    unit: 'V', occurrence: 1, index: -1, kind: 'numeric', derivedKind: kind, derivedGroup: bank
  }
}

export function deriveLipoTelemetry(
  channels: ChannelDefinition[],
  series: Record<string, Array<number | null>>,
  rowCount: number
): DerivedTelemetrySeries[] {
  const derived: DerivedTelemetrySeries[] = []
  for (const [bank, cells] of groupLipoCellChannels(channels)) {
    if (cells.length < 2) continue
    const packValues: Array<number | null> = []
    const deviationValues: Array<number | null> = []
    for (let index = 0; index < rowCount; index += 1) {
      const values = cells.map(({ channel }) => series[channel.key]?.[index] ?? null)
      if (values.some((value) => value === null || !Number.isFinite(value))) {
        packValues.push(null)
        deviationValues.push(null)
        continue
      }
      const numeric = values as number[]
      packValues.push(numeric.reduce((sum, value) => sum + value, 0))
      deviationValues.push(Math.max(...numeric) - Math.min(...numeric))
    }
    derived.push(
      { channel: derivedChannel(bank, 'lipo-pack-voltage'), values: packValues },
      { channel: derivedChannel(bank, 'lipo-cell-deviation'), values: deviationValues }
    )
  }
  return derived
}
