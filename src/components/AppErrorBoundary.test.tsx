import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

function BrokenView(): ReactNode {
  throw new Error('Edge rendering failed')
}

describe('application error boundary', () => {
  it('shows a recoverable error screen instead of a blank application', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<AppErrorBoundary><BrokenView /></AppErrorBoundary>)
    expect(screen.getByRole('heading', { name: 'FlightTrace hit a problem' })).toBeInTheDocument()
    expect(screen.getByText('Edge rendering failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload FlightTrace' })).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
