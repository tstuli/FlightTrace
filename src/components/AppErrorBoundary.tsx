import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryState {
  error?: Error
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(typeof value === 'string' ? value : 'An unexpected browser error occurred.')
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {}

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError)
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError)
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FlightTrace render error', error, info.componentStack)
  }

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    console.error('FlightTrace asynchronous error', event.reason)
    this.setState({ error: asError(event.reason) })
  }

  handleWindowError = (event: ErrorEvent) => {
    console.error('FlightTrace browser error', event.error ?? event.message)
    this.setState({ error: asError(event.error ?? event.message) })
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="page-shell narrow-page">
      <section className="analysis-header"><div><span className="eyebrow">Browser error</span><h1>FlightTrace hit a problem</h1><p>Your locally stored logs have not been deleted.</p></div></section>
      <section className="analysis-panel"><h2>Reload the application</h2><p>A browser feature or cached application file failed unexpectedly. Reloading will install the latest FlightTrace version.</p><button className="button primary" onClick={() => window.location.reload()}>Reload FlightTrace</button><details className="warnings"><summary>Technical details</summary><pre>{this.state.error.message}</pre></details></section>
    </main>
  }
}
