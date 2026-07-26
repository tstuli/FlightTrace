import { describe, expect, it } from 'vitest'
import { normalizeModelName, parseFileIdentity } from './filename'

describe('parseFileIdentity', () => {
  it('parses the timestamp suffix from the right', () => {
    expect(parseFileIdentity('EDGE-540-2026-06-13-12-27-52.csv')).toEqual({ modelName: 'EDGE-540', timestampLocal: '2026-06-13T12:27:52' })
    expect(parseFileIdentity('PIPER-.40-CUB-2025-10-01-17-38-05.csv').modelName).toBe('PIPER-.40-CUB')
  })

  it('ignores duplicate-copy suffixes after the timestamp', () => {
    expect(parseFileIdentity('SLICK580-2025-10-04-12-14-07 (1).csv')).toEqual({ modelName: 'SLICK580', timestampLocal: '2025-10-04T12:14:07' })
    expect(parseFileIdentity('SLICK580-2025-10-04-12-14-07(23)')).toEqual({ modelName: 'SLICK580', timestampLocal: '2025-10-04T12:14:07' })
    expect(parseFileIdentity('SLICK (1)-2025-10-04-12-14-07.csv').modelName).toBe('SLICK (1)')
  })

  it('falls back to the filename for generic CSVs', () => {
    expect(parseFileIdentity('weekend test.csv').modelName).toBe('weekend test')
    expect(normalizeModelName('  Edge   540 ')).toBe('edge 540')
  })
})
