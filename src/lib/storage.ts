import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { db } from '../db'
import { normalizeModelBatteries } from './battery'
import { rawLogBytes } from './rawLog'
import type { BackupManifest, LogRecord, ModelProfile } from '../types'

interface SerializableLog extends Omit<LogRecord, 'rawBlob'> {
  blobPath: string
}

export async function exportBackup(selectedLogIds?: string[]): Promise<Blob> {
  const models = await db.models.toArray()
  const allLogs = await db.logs.toArray()
  const logs = selectedLogIds?.length ? allLogs.filter((log) => selectedLogIds.includes(log.id)) : allLogs
  const modelIds = new Set(logs.map((log) => log.modelId))
  const includedModels = models.filter((model) => modelIds.has(model.id))
  const flights = (await db.flights.toArray()).filter((flight) => logs.some((log) => log.id === flight.logId))
  const events = (await db.events.toArray()).filter((event) => logs.some((log) => log.id === event.logId))
  const checksums = Object.fromEntries(logs.map((log) => [log.fileName, log.id]))
  const manifest: BackupManifest = {
    format: 'frsky-telemetry-backup', version: 1, createdAt: new Date().toISOString(), appVersion: '0.1.0',
    modelCount: includedModels.length, logCount: logs.length, checksums
  }
  const archive: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'models.json': strToU8(JSON.stringify(includedModels)),
    'flights.json': strToU8(JSON.stringify(flights)),
    'events.json': strToU8(JSON.stringify(events))
  }
  const serializable: SerializableLog[] = []
  for (const log of logs) {
    const blobPath = `logs/${log.id}.csv`
    archive[blobPath] = await rawLogBytes(log.rawBlob)
    const { rawBlob: _rawBlob, ...metadata } = log
    void _rawBlob
    serializable.push({ ...metadata, blobPath })
  }
  archive['logs.json'] = strToU8(JSON.stringify(serializable))
  return new Blob([zipSync(archive, { level: 6 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}

export async function importBackup(file: File): Promise<{ models: number; logs: number; skipped: number }> {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const required = ['manifest.json', 'models.json', 'logs.json', 'flights.json', 'events.json']
  if (required.some((path) => !archive[path])) throw new Error('This archive is missing required backup files.')
  const manifest = JSON.parse(strFromU8(archive['manifest.json'])) as BackupManifest
  if (manifest.format !== 'frsky-telemetry-backup' || manifest.version !== 1) throw new Error('Unsupported backup format or version.')
  const models = JSON.parse(strFromU8(archive['models.json'])) as ModelProfile[]
  const logs = JSON.parse(strFromU8(archive['logs.json'])) as SerializableLog[]
  const flights = JSON.parse(strFromU8(archive['flights.json']))
  const events = JSON.parse(strFromU8(archive['events.json']))
  let skipped = 0
  await db.transaction('rw', db.models, db.logs, db.flights, db.events, async () => {
    for (const model of models) {
      if (!(await db.models.get(model.id))) await db.models.add(normalizeModelBatteries(model))
    }
    for (const log of logs) {
      if (await db.logs.get(log.id)) { skipped += 1; continue }
      const bytes = archive[log.blobPath]
      if (!bytes) throw new Error(`Missing raw log ${log.blobPath}.`)
      const { blobPath: _blobPath, ...metadata } = log
      void _blobPath
      await db.logs.add({ ...metadata, rawBlob: new Uint8Array(bytes) })
    }
    for (const flight of flights) if (!(await db.flights.get(flight.id))) await db.flights.add(flight)
    for (const event of events) if (!(await db.events.get(event.id))) await db.events.add(event)
  })
  return { models: models.length, logs: logs.length - skipped, skipped }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 }
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
}
