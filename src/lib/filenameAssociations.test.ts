import { describe, expect, it } from 'vitest'
import type { LogRecord, ModelProfile } from '../types'
import { filenameGroupKey, historicalModelForFile, rankModelsForFilename } from './filenameAssociations'

const log = (id: string, modelId: string, fileName: string): LogRecord => ({
  id, modelId, fileName, rawBlob: new Uint8Array(), importedAt: '', startLocal: parseTimestamp(fileName), endLocal: parseTimestamp(fileName),
  startMs: 0, endMs: 0, rowCount: 0, delimiter: ',', schemaFingerprint: '', channels: [], summaries: [], warnings: []
})

const parseTimestamp = (fileName: string) => fileName.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.csv$/)?.slice(1).join('-') ?? ''

const model = (id: string, name: string): ModelProfile => ({
  id, name, normalizedName: name.toLowerCase(), description: '', category: 'airplane', propulsion: 'electric', rfProtocol: 'unknown', receiverCount: 1,
  receiverBatteries: [{ chemistry: 'none' }], propulsionBatteries: [{ chemistry: 'none' }], channelSettings: {},
  flightRule: { operator: '>', threshold: 0, minimumDurationMs: 3000, mergeGapMs: 30000 }, rules: [], createdAt: '', updatedAt: ''
})

describe('filename associations', () => {
  it('groups files by the aircraft name before the right-hand timestamp', () => {
    expect(filenameGroupKey('PIPER-.40-CUB-2026-06-01-12-00-00.csv')).toBe('piper-.40-cub')
    expect(filenameGroupKey('PIPER-.40-CUB-2026-06-01-12-00-00 (1).csv')).toBe('piper-.40-cub')
    expect(filenameGroupKey('FrSky - PIPER-.40-CUB-2026-06-01-12-00.csv')).toBe('frsky - piper-.40-cub')
  })

  it('uses the closest timestamp when a filename group has belonged to multiple planes', () => {
    const logs = [
      log('old', 'model-old', 'EDGE-540-2025-01-01-10-00-00.csv'),
      log('new', 'model-new', 'EDGE-540-2026-06-01-10-00-00.csv'),
      log('other', 'other', 'CARBON-CUB-2026-06-01-10-00-00.csv')
    ]
    expect(historicalModelForFile('EDGE-540-2026-05-30-10-00-00.csv', logs)).toBe('model-new')
    expect(historicalModelForFile('EDGE-540-2025-01-03-10-00-00.csv', logs)).toBe('model-old')
    expect(historicalModelForFile('EDGE-540-2026-05-30-10-00-00 (1).csv', logs)).toBe('model-new')
  })

  it('does not perpetuate an old generic FrSky model assignment after improved parsing', () => {
    const affectedLog = log('old-import', 'generic-frsky', 'FrSky - ANGEL-30-2025-07-18-14-17.csv')
    expect(historicalModelForFile('FrSky - ANGEL-30-2025-07-18-15-02.csv', [affectedLog], [model('generic-frsky', 'FrSky')])).toBeUndefined()
    expect(historicalModelForFile('FrSky - ANGEL-30-2025-07-18-15-02.csv', [affectedLog], [model('generic-frsky', 'FrSky - Angel 30')])).toBe('generic-frsky')
  })

  it('ranks likely renamed planes ahead of unrelated models', () => {
    expect(rankModelsForFilename('EDGE-540-RADIO-2026-06-01-10-00-00.csv', [model('cub', 'Carbon Cub'), model('edge', 'Edge 540')])[0].id).toBe('edge')
  })
})
