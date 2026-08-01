import type { ChannelDefinition, ChannelSummary, ParsedLog } from '../types'

export interface UnitPreferences {
  altitude: 'source' | 'm' | 'ft'
  distance: 'source' | 'km' | 'mi' | 'nmi'
  speed: 'source' | 'm/s' | 'km/h' | 'mph' | 'kt'
  verticalSpeed: 'source' | 'm/s' | 'ft/min'
  temperature: 'source' | '°C' | '°F'
  pressure: 'source' | 'hPa' | 'inHg'
}

export type UnitQuantity = keyof UnitPreferences

export const UNIT_PREFERENCES_KEY = 'display-unit-preferences'

export const DEFAULT_UNIT_PREFERENCES: UnitPreferences = {
  altitude: 'source',
  distance: 'source',
  speed: 'source',
  verticalSpeed: 'source',
  temperature: 'source',
  pressure: 'source'
}

export const UNIT_OPTIONS: { quantity: UnitQuantity; label: string; description: string; options: Array<{ value: string; label: string }> }[] = [
  { quantity: 'altitude', label: 'Altitude', description: 'Height, elevation, and GPS altitude channels.', options: [{ value: 'source', label: 'Recorded unit' }, { value: 'm', label: 'Metres (m)' }, { value: 'ft', label: 'Feet (ft)' }] },
  { quantity: 'distance', label: 'Distance', description: 'Travelled distance, range, and GPS route length.', options: [{ value: 'source', label: 'Recorded / metric' }, { value: 'km', label: 'Kilometres (km)' }, { value: 'mi', label: 'Miles (mi)' }, { value: 'nmi', label: 'Nautical miles (nmi)' }] },
  { quantity: 'speed', label: 'Speed', description: 'Ground speed, airspeed, and velocity channels.', options: [{ value: 'source', label: 'Recorded unit' }, { value: 'm/s', label: 'Metres/second (m/s)' }, { value: 'km/h', label: 'Kilometres/hour (km/h)' }, { value: 'mph', label: 'Miles/hour (mph)' }, { value: 'kt', label: 'Knots (kt)' }] },
  { quantity: 'verticalSpeed', label: 'Vertical speed', description: 'Vario, climb, sink, and vertical-speed channels.', options: [{ value: 'source', label: 'Recorded unit' }, { value: 'm/s', label: 'Metres/second (m/s)' }, { value: 'ft/min', label: 'Feet/minute (ft/min)' }] },
  { quantity: 'temperature', label: 'Temperature', description: 'Ambient, engine, motor, and exhaust temperatures.', options: [{ value: 'source', label: 'Recorded unit' }, { value: '°C', label: 'Celsius (°C)' }, { value: '°F', label: 'Fahrenheit (°F)' }] },
  { quantity: 'pressure', label: 'Pressure', description: 'Atmospheric, barometric, and sensor pressure.', options: [{ value: 'source', label: 'Recorded unit' }, { value: 'hPa', label: 'Hectopascals (hPa)' }, { value: 'inHg', label: 'Inches of mercury (inHg)' }] }
]

const VALID_PREFERENCES = Object.fromEntries(UNIT_OPTIONS.map(({ quantity, options }) => [quantity, new Set(options.map(({ value }) => value))])) as Record<UnitQuantity, Set<string>>

function normalizedUnit(unit: string): string {
  return unit.trim().toLocaleLowerCase().replaceAll('°', '').replace(/[._\s]+/g, '').replace(/²/g, '2').replace(/³/g, '3')
}

function lengthUnit(unit: string): 'm' | 'ft' | 'km' | 'mi' | 'nmi' | undefined {
  const value = normalizedUnit(unit)
  if (/^(m|meter|meters|metre|metres)$/.test(value)) return 'm'
  if (/^(ft|foot|feet)$/.test(value)) return 'ft'
  if (/^(km|kilometer|kilometers|kilometre|kilometres)$/.test(value)) return 'km'
  if (/^(mi|mile|miles)$/.test(value)) return 'mi'
  if (/^(nmi|nm|nauticalmile|nauticalmiles)$/.test(value)) return 'nmi'
  return undefined
}

function speedUnit(unit: string): 'm/s' | 'km/h' | 'mph' | 'kt' | 'ft/min' | 'ft/s' | undefined {
  const value = normalizedUnit(unit)
  if (/^(m\/s|mps|ms-?1)$/.test(value)) return 'm/s'
  if (/^(km\/h|kmh|kph|kmhr)$/.test(value)) return 'km/h'
  if (/^(mph|mi\/h|milesperhour)$/.test(value)) return 'mph'
  if (/^(kt|kts|kn|knot|knots)$/.test(value)) return 'kt'
  if (/^(ft\/min|fpm|ftmin-?1)$/.test(value)) return 'ft/min'
  if (/^(ft\/s|fps|fts-?1)$/.test(value)) return 'ft/s'
  return undefined
}

function temperatureUnit(unit: string): '°C' | '°F' | undefined {
  const value = normalizedUnit(unit)
  if (/^(c|degc|celsius)$/.test(value)) return '°C'
  if (/^(f|degf|fahrenheit)$/.test(value)) return '°F'
  return undefined
}

function pressureUnit(unit: string): 'hPa' | 'Pa' | 'kPa' | 'bar' | 'inHg' | 'psi' | undefined {
  const value = normalizedUnit(unit)
  if (/^(hpa|mbar|millibar|millibars)$/.test(value)) return 'hPa'
  if (value === 'pa') return 'Pa'
  if (value === 'kpa') return 'kPa'
  if (value === 'bar') return 'bar'
  if (value === 'inhg') return 'inHg'
  if (value === 'psi') return 'psi'
  return undefined
}

export function normalizeUnitPreferences(value: unknown): UnitPreferences {
  const candidate = value && typeof value === 'object' ? value as Partial<Record<UnitQuantity, unknown>> : {}
  return Object.fromEntries((Object.keys(DEFAULT_UNIT_PREFERENCES) as UnitQuantity[]).map((quantity) => {
    const preference = candidate[quantity]
    return [quantity, typeof preference === 'string' && VALID_PREFERENCES[quantity].has(preference) ? preference : DEFAULT_UNIT_PREFERENCES[quantity]]
  })) as unknown as UnitPreferences
}

export function channelQuantity(channel: Pick<ChannelDefinition, 'rawLabel' | 'label' | 'unit'>): UnitQuantity | undefined {
  const label = `${channel.rawLabel} ${channel.label}`.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ')
  const compactLabel = label.replace(/\s+/g, '')
  const speed = speedUnit(channel.unit)
  if (speed && (speed === 'ft/min' || /\b(vertical|vario|vspd|vsi|climb|climb rate|sink|sink rate|ascent|descent)\b/.test(label) || /(verticalspeed|verticalvelocity|climbrate|sinkrate|vspd|vario|vsi)/.test(compactLabel))) return 'verticalSpeed'
  if (speed) return 'speed'
  if (temperatureUnit(channel.unit)) return 'temperature'
  if (pressureUnit(channel.unit)) return 'pressure'
  const length = lengthUnit(channel.unit)
  if (length && (/\b(alt|altitude|height|elevation)\b/.test(label) || /(alt|altitude|height|elevation)$/.test(compactLabel))) return 'altitude'
  if (length && (/\b(distance|range|odometer|trip|travelled|traveled)\b/.test(label) || /(distance|range|odometer|travelled|traveled)$/.test(compactLabel))) return 'distance'
  return undefined
}

function toBase(value: number, quantity: UnitQuantity, unit: string): number | undefined {
  if (quantity === 'altitude' || quantity === 'distance') {
    const source = lengthUnit(unit)
    const factors = { m: 1, ft: 0.3048, km: 1000, mi: 1609.344, nmi: 1852 }
    return source ? value * factors[source] : undefined
  }
  if (quantity === 'speed' || quantity === 'verticalSpeed') {
    const source = speedUnit(unit)
    const factors = { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kt: 0.5144444444444445, 'ft/min': 0.00508, 'ft/s': 0.3048 }
    return source ? value * factors[source] : undefined
  }
  if (quantity === 'temperature') {
    const source = temperatureUnit(unit)
    if (source === '°C') return value
    if (source === '°F') return (value - 32) * 5 / 9
    return undefined
  }
  const source = pressureUnit(unit)
  const factors = { hPa: 1, Pa: 0.01, kPa: 10, bar: 1000, inHg: 33.8638866667, psi: 68.9475729 }
  return source ? value * factors[source] : undefined
}

function fromBase(value: number, quantity: UnitQuantity, unit: string): number | undefined {
  if (quantity === 'altitude' || quantity === 'distance') {
    const target = lengthUnit(unit)
    const factors = { m: 1, ft: 0.3048, km: 1000, mi: 1609.344, nmi: 1852 }
    return target ? value / factors[target] : undefined
  }
  if (quantity === 'speed' || quantity === 'verticalSpeed') {
    const target = speedUnit(unit)
    const factors = { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kt: 0.5144444444444445, 'ft/min': 0.00508, 'ft/s': 0.3048 }
    return target ? value / factors[target] : undefined
  }
  if (quantity === 'temperature') {
    const target = temperatureUnit(unit)
    if (target === '°C') return value
    if (target === '°F') return value * 9 / 5 + 32
    return undefined
  }
  const target = pressureUnit(unit)
  const factors = { hPa: 1, Pa: 0.01, kPa: 10, bar: 1000, inHg: 33.8638866667, psi: 68.9475729 }
  return target ? value / factors[target] : undefined
}

export function convertQuantityValue(value: number, quantity: UnitQuantity, sourceUnit: string, targetUnit: string): number {
  if (targetUnit === 'source' || sourceUnit === targetUnit) return value
  const base = toBase(value, quantity, sourceUnit)
  const converted = base === undefined ? undefined : fromBase(base, quantity, targetUnit)
  return converted === undefined || !Number.isFinite(converted) ? value : converted
}

function convertedChannel(channel: ChannelDefinition, preferences: UnitPreferences): ChannelDefinition {
  const quantity = channelQuantity(channel)
  const targetUnit = quantity ? preferences[quantity] : 'source'
  return targetUnit === 'source' ? channel : { ...channel, unit: targetUnit }
}

function convertedSummary(summary: ChannelSummary, channel: ChannelDefinition, preferences: UnitPreferences): ChannelSummary {
  const quantity = channelQuantity(channel)
  const targetUnit = quantity ? preferences[quantity] : 'source'
  if (!quantity || targetUnit === 'source' || targetUnit === channel.unit) return summary
  const convert = (value: number | null) => value === null ? null : convertQuantityValue(value, quantity, channel.unit, targetUnit)
  return {
    ...summary,
    min: convert(summary.min),
    max: convert(summary.max),
    mean: convert(summary.mean),
    timeWeightedMean: convert(summary.timeWeightedMean),
    p05: convert(summary.p05),
    median: convert(summary.median),
    p95: convert(summary.p95)
  }
}

export function convertParsedForDisplay(parsed: ParsedLog, preferences: UnitPreferences): ParsedLog {
  const channelsByKey = new Map(parsed.channels.map((channel) => [channel.key, channel]))
  const changed = parsed.channels.some((channel) => {
    const quantity = channelQuantity(channel)
    return quantity !== undefined && preferences[quantity] !== 'source' && preferences[quantity] !== channel.unit
  })
  if (!changed) return parsed
  return {
    ...parsed,
    channels: parsed.channels.map((channel) => convertedChannel(channel, preferences)),
    series: Object.fromEntries(Object.entries(parsed.series).map(([key, values]) => {
      const channel = channelsByKey.get(key)
      const quantity = channel && channelQuantity(channel)
      const targetUnit = quantity ? preferences[quantity] : 'source'
      if (!channel || !quantity || targetUnit === 'source' || targetUnit === channel.unit) return [key, values]
      return [key, values.map((value) => value === null ? null : convertQuantityValue(value, quantity, channel.unit, targetUnit))]
    })),
    summaries: parsed.summaries.map((summary) => {
      const channel = channelsByKey.get(summary.channelKey)
      return channel ? convertedSummary(summary, channel, preferences) : summary
    })
  }
}
