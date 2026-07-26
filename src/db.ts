import Dexie, { type EntityTable } from 'dexie'
import type { DiagnosticEvent, FlightSegment, ImportProfile, LogRecord, ModelProfile } from './types'

export interface AppSetting {
  key: string
  value: unknown
}

export class TelemetryDatabase extends Dexie {
  models!: EntityTable<ModelProfile, 'id'>
  logs!: EntityTable<LogRecord, 'id'>
  flights!: EntityTable<FlightSegment, 'id'>
  events!: EntityTable<DiagnosticEvent, 'id'>
  importProfiles!: EntityTable<ImportProfile, 'id'>
  settings!: EntityTable<AppSetting, 'key'>

  constructor() {
    super('frsky-telemetry-analyzer')
    this.version(1).stores({
      models: '&id, &normalizedName, updatedAt',
      logs: '&id, modelId, startLocal, importedAt, [modelId+startLocal]',
      flights: '&id, logId, modelId, [logId+startMs]',
      events: '&id, logId, flightId, severity, startMs',
      importProfiles: '&id, schemaFingerprint, updatedAt',
      settings: '&key'
    })
    this.version(2).stores({
      models: '&id, &normalizedName, updatedAt',
      logs: '&id, modelId, startLocal, importedAt, [modelId+startLocal]',
      flights: '&id, logId, modelId, [logId+startMs]',
      events: '&id, logId, flightId, severity, startMs',
      importProfiles: '&id, schemaFingerprint, updatedAt',
      settings: '&key'
    }).upgrade((transaction) => transaction.table('models').toCollection().modify((model) => {
      model.receiverBatteries = model.receiverBatteries?.length ? model.receiverBatteries : [model.receiverBattery ?? { chemistry: 'none' }]
      if (model.propulsion === 'electric') model.propulsionBatteries = model.propulsionBatteries?.length ? model.propulsionBatteries : [model.propulsionBattery ?? { chemistry: 'none' }]
      model.receiverBattery = model.receiverBatteries[0]
      model.propulsionBattery = model.propulsionBatteries?.[0]
    }))
    this.version(3).stores({
      models: '&id, &normalizedName, updatedAt',
      logs: '&id, modelId, startLocal, importedAt, [modelId+startLocal]',
      flights: '&id, logId, modelId, [logId+startMs]',
      events: '&id, logId, flightId, severity, startMs',
      importProfiles: '&id, schemaFingerprint, updatedAt',
      settings: '&key'
    }).upgrade((transaction) => transaction.table('models').toCollection().modify((model) => {
      const rule = model.flightRule
      if (!rule) return
      const throttleRule = String(rule.channelKey ?? '').includes('throttle')
      if (throttleRule && rule.threshold === -900) rule.threshold = -800
      if (rule.stopThreshold === undefined) rule.stopThreshold = throttleRule ? -950 : rule.threshold
      if (rule.minimumDurationMs === 5000) rule.minimumDurationMs = 3000
      if (rule.mergeGapMs === 2000) rule.mergeGapMs = 30000
    }))
  }
}

export const db = new TelemetryDatabase()

export async function deleteLog(logId: string) {
  await db.transaction('rw', db.logs, db.flights, db.events, async () => {
    await db.events.where('logId').equals(logId).delete()
    await db.flights.where('logId').equals(logId).delete()
    await db.logs.delete(logId)
  })
}

export async function deleteModel(modelId: string) {
  const logs = await db.logs.where('modelId').equals(modelId).primaryKeys()
  await db.transaction('rw', db.models, db.logs, db.flights, db.events, async () => {
    for (const logId of logs) {
      await db.events.where('logId').equals(logId).delete()
      await db.flights.where('logId').equals(logId).delete()
      await db.logs.delete(logId)
    }
    await db.models.delete(modelId)
  })
}
