import { useEffect, useRef, useState } from 'react'
import { db } from '../db'
import { ImportPanel } from '../components/ImportPanel'
import { exportBackup, importBackup } from '../lib/storage'
import { Link } from '../router'
import type { DiagnosticEvent, LogRecord, ModelProfile } from '../types'

interface ModelCardData { model: ModelProfile; logs: LogRecord[]; events: DiagnosticEvent[] }

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function LibraryPage({ revision, refresh }: { revision: number; refresh: () => void }) {
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [cards, setCards] = useState<ModelCardData[]>([])
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState<{ text: string; error?: boolean }>()
  useEffect(() => {
    void (async () => {
      const [models, logs, events] = await Promise.all([db.models.toArray(), db.logs.toArray(), db.events.toArray()])
      setCards(models.map((model) => ({
        model,
        logs: logs.filter((log) => log.modelId === model.id).sort((a, b) => b.startLocal.localeCompare(a.startLocal)),
        events: events.filter((event) => logs.some((log) => log.modelId === model.id && log.id === event.logId))
      })).sort((a, b) => (b.logs[0]?.startLocal ?? '').localeCompare(a.logs[0]?.startLocal ?? '')))
    })()
  }, [revision])

  return <main className="page-shell">
    <section className="hero"><div><span className="eyebrow">Telemetry analysis</span><h1>Your flights,<br /><em>made legible.</em></h1><p>Decode telemetry, spot weak links, compare performance, and keep every aircraft’s history organized.</p></div><div className="hero-summary"><span>CSV</span><strong>to clear answers</strong><small>Flights · charts · diagnostics</small></div></section>
    <ImportPanel onImported={refresh} />
    <section className="backup-callout">
      <div className="backup-mark">ZIP</div>
      <div><span className="eyebrow">Portable library</span><h2>Download or restore a backup</h2><p>Keep an archive of your planes, setup, raw logs, flight edits, and diagnostics.</p></div>
      <div className="backup-actions">
        <button className="button primary" disabled={backupBusy} onClick={async () => {
          setBackupBusy(true); setBackupMessage(undefined)
          try { download(await exportBackup(), `frsky-telemetry-backup-${new Date().toISOString().slice(0, 10)}.zip`) }
          catch (error) { setBackupMessage({ text: error instanceof Error ? error.message : String(error), error: true }) }
          finally { setBackupBusy(false) }
        }}>{backupBusy ? 'Working…' : 'Download backup'}</button>
        <button className="button ghost" disabled={backupBusy} onClick={() => backupInputRef.current?.click()}>Restore backup</button>
        <input ref={backupInputRef} aria-label="Restore backup file" className="visually-hidden" type="file" accept=".zip,application/zip" onChange={async (event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          setBackupBusy(true); setBackupMessage(undefined)
          try {
            const result = await importBackup(file)
            setBackupMessage({ text: `Restored ${result.models} models and ${result.logs} logs; skipped ${result.skipped} duplicates.` })
            refresh()
          } catch (error) { setBackupMessage({ text: error instanceof Error ? error.message : String(error), error: true }) }
          finally { setBackupBusy(false) }
        }} />
      </div>
      <aside className="backup-advisory"><strong>Back up regularly.</strong><span>Your telemetry library is stored only in this web browser and is not saved on the server. Browser data can be cleared or lost, so download a backup—especially before clearing site data, changing browsers, or moving devices.</span></aside>
      {backupMessage && <div className={`backup-message ${backupMessage.error ? 'error' : 'success'}`} role="status">{backupMessage.text}</div>}
    </section>
    <div className="section-heading"><div><span className="eyebrow">Aircraft library</span><h2>Planes</h2></div><span>{cards.length} model{cards.length === 1 ? '' : 's'}</span></div>
    {cards.length ? <div className="model-grid">{cards.map(({ model, logs, events }) => {
      const critical = events.filter((event) => event.severity === 'critical').length
      const latest = logs[0]
      return <Link to={`/model/${model.id}`} className="model-card" key={model.id}>
        <div className="model-card-top"><span className={`propulsion ${model.propulsion}`}>{model.propulsion}</span>{critical > 0 && <span className="alert-count">{critical} critical</span>}</div>
        <h3>{model.name}</h3><p>{model.description || `${model.category} · ${model.rfProtocol.toUpperCase()}`}</p>
        <div className="model-metrics"><div><strong>{logs.length}</strong><span>logs</span></div><div><strong>{events.length}</strong><span>events</span></div><div><strong>{latest ? latest.startLocal.slice(0, 10) : '—'}</strong><span>latest</span></div></div>
        <span className="card-link">Open flight library →</span>
      </Link>
    })}</div> : <div className="empty-state"><div className="empty-plane">✦</div><h3>No planes yet</h3><p>Import your first CSV log. The new-plane wizard will build a reusable profile.</p></div>}
  </main>
}
