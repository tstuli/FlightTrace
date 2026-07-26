import { describe, expect, it } from 'vitest'
import { batteryWithDefaults, changeBatteryChemistry, changeBatterySource, packThresholds } from './battery'

describe('battery thresholds', () => {
  it('applies chemistry defaults and calculates whole-pack voltages', () => {
    const battery = changeBatteryChemistry({ chemistry: 'none', cells: 4 }, 'lipo')
    expect(battery).toMatchObject({ chemistry: 'lipo', lowPerCell: 3.5, criticalPerCell: 3.3 })
    expect(packThresholds(battery)).toEqual({ warning: 14, critical: 13.2 })
  })

  it('fills missing defaults without replacing confirmed values', () => {
    expect(batteryWithDefaults({ chemistry: 'life', lowPerCell: 3.2 })).toMatchObject({ lowPerCell: 3.2, criticalPerCell: 2.8 })
  })

  it('uses whole-voltage thresholds for a BEC', () => {
    const bec = changeBatterySource({ chemistry: 'none' }, 'bec')
    expect(bec).toMatchObject({ source: 'bec', becVoltage: 5, lowVoltage: 4.5, criticalVoltage: 4.2 })
    expect(packThresholds(bec)).toEqual({ warning: 4.5, critical: 4.2 })
  })
})
