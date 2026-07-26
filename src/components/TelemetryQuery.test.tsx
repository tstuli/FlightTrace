import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TelemetryQuery } from './TelemetryQuery'
import type { ParsedLog } from '../types'

vi.mock('./TelemetryChart', () => ({ TelemetryChart: () => null }))

const parsed: ParsedLog = {
  hash: 'hash', fileName: 'viewer.csv', delimiter: ',', rowCount: 4,
  startLocal: '2026-01-01T10:00:00.000', endLocal: '2026-01-01T10:00:03.000', startMs: 0, endMs: 3000,
  timestamps: [0, 1000, 2000, 3000],
  channels: [
    { key: 'rssi||1', rawLabel: 'RSSI', label: 'RSSI', unit: 'dB', occurrence: 1, index: 1, kind: 'numeric' },
    { key: 'rx batt||1', rawLabel: 'Rx Batt', label: 'Rx Batt', unit: 'V', occurrence: 1, index: 2, kind: 'numeric' }
  ],
  series: { 'rssi||1': [60, 44, 42, 70], 'rx batt||1': [5.1, 4.9, 4.7, 5.0] },
  summaries: [], warnings: [], schemaFingerprint: 'schema'
}

describe('TelemetryQuery', () => {
  it('runs a query and presents matching rows', () => {
    render(<TelemetryQuery parsed={parsed} channelSettings={{}} selectedChannelKeys={[]} />)
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: '`RSSI` < 45 and `Rx Batt` < 4.8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run query' }))

    expect(screen.getByText('1', { selector: '.query-result-summary strong' })).toBeInTheDocument()
    expect(screen.getByText('25.0% of log')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Matching rows' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '42' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '4.7' })).toBeInTheDocument()
  })

  it('shows actionable query errors', () => {
    render(<TelemetryQuery parsed={parsed} channelSettings={{}} selectedChannelKeys={[]} />)
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: '`Unknown` > 0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run query' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Unknown channel “Unknown”')
  })
})
