import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelEditor } from './ModelEditor'
import type { ChannelDefinition } from '../types'

const channels: ChannelDefinition[] = [
  { key: 'throttle||1', rawLabel: 'Throttle', label: 'Throttle', unit: '', occurrence: 1, index: 2, kind: 'numeric' },
  { key: 'vfr|%|1', rawLabel: 'VFR', label: 'VFR', unit: '%', occurrence: 1, index: 3, kind: 'numeric' },
  { key: 'lipo a1|v|1', rawLabel: 'LiPo A1', label: 'LiPo A1', unit: 'V', occurrence: 1, index: 4, kind: 'numeric' },
  { key: 'lipo b6|v|1', rawLabel: 'LiPo B6', label: 'LiPo B6', unit: 'V', occurrence: 1, index: 5, kind: 'numeric' },
  { key: 'txbat|v|1', rawLabel: 'TxBat', label: 'TxBat', unit: 'V', occurrence: 1, index: 6, kind: 'numeric' },
  { key: 'a-pack', rawLabel: 'LiPo A pack voltage', label: 'LiPo A pack voltage', unit: 'V', occurrence: 1, index: -1, kind: 'numeric', derivedKind: 'lipo-pack-voltage', derivedGroup: 'A' },
  { key: 'a-deviation', rawLabel: 'LiPo A cell voltage deviation', label: 'LiPo A cell voltage deviation', unit: 'V', occurrence: 1, index: -1, kind: 'numeric', derivedKind: 'lipo-cell-deviation', derivedGroup: 'A' }
]

describe('new plane wizard', () => {
  it('shows propulsion-specific questions adaptively', () => {
    render(<ModelEditor inferredName="EDGE-540" channels={channels} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByDisplayValue('EDGE-540')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Propulsion'), { target: { value: 'turbine' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByLabelText('Fuel capacity (mL)')).toBeInTheDocument()
    expect(screen.getByLabelText('Maximum temperature (°C)')).toBeInTheDocument()
    expect(screen.queryByText('Propulsion battery')).not.toBeInTheDocument()
  })

  it('applies chemistry defaults and updates pack voltages as cells change', () => {
    render(<ModelEditor inferredName="EDGE-540" channels={channels} onSave={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const receiverBattery = screen.getByRole('group', { name: 'Receiver power' })
    fireEvent.change(within(receiverBattery).getByLabelText('Chemistry'), { target: { value: 'lipo' } })
    expect(within(receiverBattery).getByLabelText('Warning / cell (V)')).toHaveValue(3.5)
    expect(within(receiverBattery).getByLabelText('Critical / cell (V)')).toHaveValue(3.3)
    fireEvent.change(within(receiverBattery).getByLabelText('Cells'), { target: { value: '4' } })
    expect(within(receiverBattery).getByText('14.00 V')).toBeInTheDocument()
    expect(within(receiverBattery).getByText('13.20 V')).toBeInTheDocument()
    const voltageChannel = within(receiverBattery).getByLabelText('Voltage telemetry channel')
    expect(within(voltageChannel).getByRole('option', { name: 'LiPo A1 (V)' })).toBeInTheDocument()
    expect(within(voltageChannel).getByRole('option', { name: 'LiPo B6 (V)' })).toBeInTheDocument()
    expect(within(voltageChannel).getByRole('option', { name: 'LiPo A pack voltage (V)' })).toBeInTheDocument()
    expect(within(voltageChannel).queryByRole('option', { name: 'LiPo A cell voltage deviation (V)' })).not.toBeInTheDocument()
    expect(within(voltageChannel).queryByRole('option', { name: 'TxBat (V)' })).not.toBeInTheDocument()
  })

  it('applies confidence-based telemetry suggestions while keeping them editable', () => {
    render(<ModelEditor inferredName="AUTO" channels={channels} suggestedSetup={{ propulsion: 'combustion', rfProtocol: 'td-tw', receiverCount: 2, flightChannelKey: 'throttle||1', flightThreshold: -700, flightStopThreshold: -900, notes: ['Propulsion looks combustion.', 'Throttle was selected for flight detection.'] }} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('Propulsion')).toHaveValue('combustion')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByLabelText('RF protocol')).toHaveValue('td-tw')
    expect(screen.getByLabelText('Receivers')).toHaveValue(2)
    expect(screen.getByText(/Auto-selected from this log/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByLabelText('Flight-active channel')).toHaveValue('throttle||1')
    expect(screen.getByLabelText('Start when greater than')).toHaveValue(-700)
    expect(screen.getByLabelText('Remain active while greater than')).toHaveValue(-900)
  })

  it('defaults battery quantities to one and adds independently configured banks', () => {
    render(<ModelEditor inferredName="TWIN" channels={channels} onSave={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByLabelText('Receiver power sources')).toHaveValue(1)
    expect(screen.getByLabelText('Flight batteries')).toHaveValue(1)
    fireEvent.change(screen.getByLabelText('Receiver power sources'), { target: { value: '2' } })
    expect(screen.getByRole('group', { name: 'Receiver power 1' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Receiver power 2' })).toBeInTheDocument()
  })

  it('offers BEC-specific receiver power settings', () => {
    render(<ModelEditor inferredName="BEC-PLANE" channels={channels} onSave={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const receiverPower = screen.getByRole('group', { name: 'Receiver power' })
    fireEvent.change(within(receiverPower).getByLabelText('Power source'), { target: { value: 'bec' } })
    expect(within(receiverPower).getByLabelText('BEC output voltage (V)')).toHaveValue(5)
    expect(within(receiverPower).getByLabelText('Warning voltage (V)')).toHaveValue(4.5)
    expect(within(receiverPower).getByLabelText('Critical voltage (V)')).toHaveValue(4.2)
    expect(within(receiverPower).queryByLabelText('Chemistry')).not.toBeInTheDocument()
  })
})
