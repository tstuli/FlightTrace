import type { BatteryProfile, ModelProfile } from '../types'

type DefaultChemistry = Exclude<BatteryProfile['chemistry'], 'custom' | 'none'>

export interface BatteryThresholdDefault {
  warningPerCell: number
  criticalPerCell: number
}

export const BATTERY_THRESHOLD_DEFAULTS: Record<DefaultChemistry, BatteryThresholdDefault> = {
  lipo: { warningPerCell: 3.5, criticalPerCell: 3.3 },
  liion: { warningPerCell: 3.4, criticalPerCell: 3.0 },
  life: { warningPerCell: 3.1, criticalPerCell: 2.8 },
  nimh: { warningPerCell: 1.1, criticalPerCell: 1.0 }
}

export function defaultsForChemistry(chemistry: BatteryProfile['chemistry']): BatteryThresholdDefault | undefined {
  if (chemistry === 'custom' || chemistry === 'none') return undefined
  return BATTERY_THRESHOLD_DEFAULTS[chemistry]
}

export function batteryWithDefaults(profile: BatteryProfile): BatteryProfile {
  if (profile.source === 'bec') return {
    ...profile,
    chemistry: 'none',
    becVoltage: profile.becVoltage ?? 5,
    lowVoltage: profile.lowVoltage ?? 4.5,
    criticalVoltage: profile.criticalVoltage ?? 4.2
  }
  const defaults = defaultsForChemistry(profile.chemistry)
  if (!defaults) return { ...profile, source: profile.source ?? 'battery' }
  return {
    ...profile,
    source: profile.source ?? 'battery',
    lowPerCell: profile.lowPerCell ?? defaults.warningPerCell,
    criticalPerCell: profile.criticalPerCell ?? defaults.criticalPerCell
  }
}

export function changeBatteryChemistry(profile: BatteryProfile, chemistry: BatteryProfile['chemistry']): BatteryProfile {
  if (chemistry === 'none') return { ...profile, source: 'battery', chemistry: 'none' }
  const defaults = defaultsForChemistry(chemistry)
  return {
    ...profile,
    source: 'battery',
    chemistry,
    ...(defaults ? { lowPerCell: defaults.warningPerCell, criticalPerCell: defaults.criticalPerCell } : {})
  }
}

export function packThresholds(profile: BatteryProfile): { warning?: number; critical?: number } {
  if (profile.source === 'bec') return { warning: profile.lowVoltage, critical: profile.criticalVoltage }
  const cells = profile.cells
  if (!cells || cells < 1) return {}
  return {
    warning: profile.lowPerCell === undefined ? undefined : cells * profile.lowPerCell,
    critical: profile.criticalPerCell === undefined ? undefined : cells * profile.criticalPerCell
  }
}

export function changeBatterySource(profile: BatteryProfile, source: 'battery' | 'bec'): BatteryProfile {
  return source === 'bec'
    ? batteryWithDefaults({ ...profile, source: 'bec', chemistry: 'none' })
    : { ...profile, source: 'battery', chemistry: 'none' }
}

export function receiverBatteriesFor(model: Pick<ModelProfile, 'receiverBatteries' | 'receiverBattery'>): BatteryProfile[] {
  return model.receiverBatteries?.length ? model.receiverBatteries : [model.receiverBattery ?? { chemistry: 'none' }]
}

export function propulsionBatteriesFor(model: Pick<ModelProfile, 'propulsionBatteries' | 'propulsionBattery'>): BatteryProfile[] {
  return model.propulsionBatteries?.length ? model.propulsionBatteries : [model.propulsionBattery ?? { chemistry: 'none' }]
}

export function normalizeModelBatteries(model: ModelProfile): ModelProfile {
  const receiverBatteries = receiverBatteriesFor(model).map(batteryWithDefaults)
  const propulsionBatteries = propulsionBatteriesFor(model).map(batteryWithDefaults)
  return {
    ...model,
    receiverBatteries,
    propulsionBatteries: model.propulsion === 'electric' ? propulsionBatteries : undefined,
    receiverBattery: receiverBatteries[0],
    propulsionBattery: model.propulsion === 'electric' ? propulsionBatteries[0] : undefined
  }
}
