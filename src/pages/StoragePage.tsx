import { useEffect, useRef, useState } from 'react'
import { db } from '../db'
import { exportBackup, importBackup, requestPersistentStorage, storageEstimate } from '../lib/storage'

function humanBytes(bytes: number) {
  if (!bytes) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function StoragePage({ refresh }: { refresh: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [estimate, setEstimate] = useState({ usage: 0, quota: 0 })
  const [persistent, setPersistent] = useState<boolean | null>(null)
  const [counts, setCounts] = useState({ models: 0, logs: 0 })
  const [message, setMessage] = useState('')
  async function reload() { setEstimate(await storageEstimate()); setPersistent(await navigator.storage?.persisted?.() ?? null); setCounts({ models: await db.models.count(), logs: await db.logs.count() }) }
  useEffect(() => {
    let active = true
    void Promise.all([
      storageEstimate(),
      navigator.storage?.persisted?.() ?? Promise.resolve(null),
      db.models.count(),
      db.logs.count()
    ]).then(([nextEstimate, nextPersistent, modelCount, logCount]) => {
      if (!active) return
      setEstimate(nextEstimate)
      setPersistent(nextPersistent)
      setCounts({ models: modelCount, logs: logCount })
    })
    return () => { active = false }
  }, [])
  return <main className="page-shell narrow-page"><section className="analysis-header"><div><span className="eyebrow">Library tools</span><h1>Storage & backups</h1><p>Review space usage, move your library, or clear old data.</p></div></section>
    <section className="storage-card"><div className="storage-ring" style={{ '--used': `${estimate.quota ? Math.max(2, estimate.usage / estimate.quota * 100) : 2}%` } as React.CSSProperties}><strong>{humanBytes(estimate.usage)}</strong><span>in use</span></div><div><h2>Library size</h2><p>{counts.models} plane{counts.models === 1 ? '' : 's'} · {counts.logs} cached log{counts.logs === 1 ? '' : 's'} · {humanBytes(estimate.quota)} available</p><p className={persistent ? 'status-good' : 'status-warn'}>{persistent ? 'Persistent storage is active.' : 'Storage may be reclaimed by the browser under pressure.'}</p><button className="button ghost" onClick={async () => { setPersistent(await requestPersistentStorage()); await reload() }}>Request persistent storage</button></div></section>
    <div className="settings-grid"><section className="settings-card"><span className="eyebrow">Portable archive</span><h2>Back up your library</h2><p>Includes raw CSV files, model setup, rules, events, and edited flight segments.</p><button className="button primary" onClick={async () => { const blob = await exportBackup(); download(blob, `frsky-telemetry-backup-${new Date().toISOString().slice(0, 10)}.zip`) }}>Export backup</button></section><section className="settings-card"><span className="eyebrow">Restore archive</span><h2>Import a backup</h2><p>Existing logs are kept and duplicate checksums are skipped.</p><button className="button ghost" onClick={() => inputRef.current?.click()}>Choose backup</button><input ref={inputRef} className="visually-hidden" type="file" accept=".zip,application/zip" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const result = await importBackup(file); setMessage(`Restored ${result.models} models and ${result.logs} logs; skipped ${result.skipped} duplicates.`); refresh(); await reload() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } }} /></section></div>
    <section className="privacy-card"><span className="lock-mark">⌾</span><div><h2>Data handling</h2><p>Telemetry files and analysis stay in this browser unless you export a backup. The app has no accounts, analytics, or site-usage tracking.</p></div></section>
    <section className="danger-zone"><div><h2>Clear this browser’s library</h2><p>This permanently deletes locally cached planes, logs, events, and settings. Export a backup first.</p></div><button className="button danger" onClick={async () => { if (!window.confirm('Permanently clear the entire local telemetry library?')) return; await db.delete(); await db.open(); setMessage('The local library was cleared.'); refresh(); await reload() }}>Clear all local data</button></section>
    {message && <div className="notice success">{message}</div>}
  </main>
}
