import { useState } from 'react'
import { DEFAULT_UNIT_PREFERENCES, UNIT_OPTIONS, type UnitPreferences, type UnitQuantity } from '../lib/units'

export function UnitSettingsPage({ preferences, onChange }: { preferences: UnitPreferences; onChange: (preferences: UnitPreferences) => Promise<void> }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function update(quantity: UnitQuantity, value: string) {
    setStatus('saving')
    try {
      await onChange({ ...preferences, [quantity]: value } as UnitPreferences)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  async function reset() {
    setStatus('saving')
    try {
      await onChange(DEFAULT_UNIT_PREFERENCES)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  return <main className="page-shell narrow-page"><section className="analysis-header"><div><span className="eyebrow">Global configuration</span><h1>Display units</h1><p>Choose how compatible telemetry quantities appear throughout FlightTrace.</p></div><div className="unit-settings-actions"><span className={`unit-save-status ${status}`} aria-live="polite">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved in this browser' : status === 'error' ? 'Could not save changes' : 'Preferences are stored locally'}</span><button className="button ghost" onClick={() => void reset()}>Use recorded units</button></div></section>
    <section className="unit-settings-intro"><strong>Display conversion only</strong><p>Imported files, raw JSON reports, and diagnostic thresholds remain in their recorded units. Charts, statistics, maps, query results, and normalized CSV exports use these choices.</p></section>
    <div className="unit-preferences-grid">{UNIT_OPTIONS.map(({ quantity, label, description, options }) => <label className="unit-preference-card" key={quantity}><span>{label}</span><small>{description}</small><select aria-label={`${label} unit`} value={preferences[quantity]} onChange={(event) => void update(quantity, event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>)}</div>
  </main>
}
