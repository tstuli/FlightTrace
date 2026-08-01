import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_UNIT_PREFERENCES } from '../lib/units'
import { UnitSettingsPage } from './UnitSettingsPage'

describe('display unit settings', () => {
  it('offers each global quantity and saves changes', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<UnitSettingsPage preferences={DEFAULT_UNIT_PREFERENCES} onChange={onChange} />)

    expect(screen.getByLabelText('Altitude unit')).toHaveValue('source')
    expect(screen.getByLabelText('Speed unit')).toBeInTheDocument()
    expect(screen.getByLabelText('Vertical speed unit')).toBeInTheDocument()
    expect(screen.getByLabelText('Temperature unit')).toBeInTheDocument()
    expect(screen.getByLabelText('Pressure unit')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Altitude unit'), { target: { value: 'ft' } })

    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_UNIT_PREFERENCES, altitude: 'ft' })
  })
})
