import { useEffect, useState } from 'react'
import { db, deleteLog, deleteModel } from '../db'
import { Link, navigate } from '../router'
import type { DiagnosticEvent, FlightSegment, LogRecord, ModelProfile } from '../types'

export function ModelPage({ modelId, revision, refresh }: { modelId: string; revision: number; refresh: () => void }) {
  const [model, setModel] = useState<ModelProfile>()
  const [logs, setLogs] = useState<LogRecord[]>([])
  const [flights, setFlights] = useState<FlightSegment[]>([])
  const [events, setEvents] = useState<DiagnosticEvent[]>([])
  useEffect(() => { void Promise.all([db.models.get(modelId), db.logs.where('modelId').equals(modelId).toArray(), db.flights.where('modelId').equals(modelId).toArray(), db.events.toArray()]).then(([loadedModel, loadedLogs, loadedFlights, loadedEvents]) => { setModel(loadedModel); setLogs(loadedLogs.sort((a, b) => b.startLocal.localeCompare(a.startLocal))); setFlights(loadedFlights); setEvents(loadedEvents.filter((event) => loadedLogs.some((log) => log.id === event.logId))) }) }, [modelId, revision])
  if (!model) return <main className="page-shell"><p>Loading model…</p></main>

  async function removeModel() {
    if (!window.confirm(`Delete ${model?.name} and all locally cached logs? This cannot be undone.`)) return
    await deleteModel(modelId); refresh(); navigate('/')
  }

  return <main className="page-shell">
    <Link className="back-link" to="/">← All planes</Link>
    <section className="model-header"><div><span className={`propulsion ${model.propulsion}`}>{model.propulsion}</span><h1>{model.name}</h1><p>{model.description || `${model.category} · ${model.rfProtocol.toUpperCase()} · ${model.receiverCount} receiver${model.receiverCount === 1 ? '' : 's'}`}</p></div><div className="button-row"><Link className="button ghost" to={`/setup/${model.id}`}>Model setup</Link><button className="button danger ghost" onClick={() => void removeModel()}>Delete model</button></div></section>
    <section className="metric-strip"><div><span>Logs</span><strong>{logs.length}</strong></div><div><span>Detected flights</span><strong>{flights.filter((flight) => !flight.excluded).length}</strong></div><div><span>Warnings</span><strong>{events.filter((event) => event.severity === 'warning').length}</strong></div><div><span>Critical</span><strong>{events.filter((event) => event.severity === 'critical').length}</strong></div></section>
    <div className="section-heading"><div><span className="eyebrow">Newest first</span><h2>Flight logs</h2></div></div>
    <div className="log-list">{logs.map((log) => {
      const logFlights = flights.filter((flight) => flight.logId === log.id && !flight.excluded)
      const logEvents = events.filter((event) => event.logId === log.id)
      return <article className="log-row" key={log.id}><Link to={`/log/${log.id}`} className="log-main"><time>{log.startLocal.slice(0, 10)}<strong>{log.startLocal.slice(11, 19)}</strong></time><div><h3>{log.fileName}</h3><p>{log.rowCount.toLocaleString()} samples · {log.channels.filter((channel) => channel.kind !== 'empty').length} active channels · {((log.endMs - log.startMs) / 60000).toFixed(1)} min</p></div></Link><div className="log-badges"><span>{logFlights.length} flight{logFlights.length === 1 ? '' : 's'}</span>{logEvents.length > 0 && <span className="event-badge">{logEvents.length} events</span>}<button className="icon-button danger" aria-label={`Delete ${log.fileName}`} onClick={async () => { if (window.confirm(`Delete ${log.fileName} from this device?`)) { await deleteLog(log.id); refresh() } }}>×</button></div></article>
    })}{!logs.length && <div className="empty-state"><h3>No logs for this model</h3></div>}</div>
  </main>
}
