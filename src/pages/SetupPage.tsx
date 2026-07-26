import { useEffect, useState } from 'react'
import { ModelEditor } from '../components/ModelEditor'
import { db } from '../db'
import { detectFlights, evaluateRules, FLIGHT_DETECTION_VERSION } from '../lib/analysis'
import { parseTelemetryFile } from '../lib/workerClient'
import { rawLogBlob } from '../lib/rawLog'
import { navigate } from '../router'
import type { ChannelDefinition, ModelProfile } from '../types'

export function SetupPage({ modelId, refresh }: { modelId: string; refresh: () => void }) {
  const [model, setModel] = useState<ModelProfile>()
  const [channels, setChannels] = useState<ChannelDefinition[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { void Promise.all([db.models.get(modelId), db.logs.where('modelId').equals(modelId).toArray()]).then(([loaded, logs]) => { setModel(loaded); const unique = new Map<string, ChannelDefinition>(); for (const log of logs) for (const channel of log.channels) unique.set(channel.key, channel); setChannels([...unique.values()]) }) }, [modelId])
  if (!model) return <main className="page-shell"><p>Loading setup…</p></main>
  return <main className="page-shell"><p>{busy ? 'Reanalyzing cached logs…' : 'Opening model setup…'}</p><ModelEditor initial={model} channels={channels} onCancel={() => navigate(`/model/${model.id}`)} onSave={async (updated) => {
    setBusy(true)
    const logs = await db.logs.where('modelId').equals(model.id).toArray()
    await db.models.put(updated)
    for (const log of logs) {
      const parsed = await parseTelemetryFile(rawLogBlob(log.rawBlob), log.fileName).promise
      const existingFlights = await db.flights.where('logId').equals(log.id).toArray()
      const preserveManualFlights = existingFlights.some((flight) => flight.manual)
      const flights = preserveManualFlights ? existingFlights : detectFlights(parsed, updated.id, log.id, updated.flightRule)
      const events = evaluateRules(parsed, log.id, updated.rules)
      await db.transaction('rw', db.logs, db.flights, db.events, async () => { if (!preserveManualFlights) { await db.flights.where('logId').equals(log.id).delete(); if (flights.length) await db.flights.bulkAdd(flights) } await db.logs.update(log.id, { channels: parsed.channels, summaries: parsed.summaries, warnings: parsed.warnings, schemaFingerprint: parsed.schemaFingerprint, flightDetectionVersion: FLIGHT_DETECTION_VERSION }); await db.events.where('logId').equals(log.id).delete(); if (events.length) await db.events.bulkAdd(events) })
    }
    refresh(); navigate(`/model/${model.id}`)
  }} /></main>
}
