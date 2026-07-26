import type { LogRecord, ModelProfile } from '../types'
import { normalizeModelName, parseFileIdentity } from './filename'

export function filenameGroupKey(fileName: string): string {
  return normalizeModelName(parseFileIdentity(fileName).modelName)
}

function timestampValue(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = Date.parse(`${value.replace(/Z$/, '')}Z`)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function historicalModelForFile(fileName: string, logs: LogRecord[], models: ModelProfile[] = []): string | undefined {
  const identity = parseFileIdentity(fileName)
  const group = normalizeModelName(identity.modelName)
  const modelsById = new Map(models.map((model) => [model.id, model]))
  const candidates = logs.filter((log) => {
    if (filenameGroupKey(log.fileName) !== group) return false
    const historicalModel = modelsById.get(log.modelId)
    return !historicalModel || normalizeModelName(historicalModel.name) !== 'frsky' || group === 'frsky'
  })
  if (!candidates.length) return undefined
  const target = timestampValue(identity.timestampLocal)
  if (target === undefined) return candidates.sort((a, b) => b.startLocal.localeCompare(a.startLocal))[0]?.modelId
  return candidates.sort((a, b) => {
    const aTime = timestampValue(parseFileIdentity(a.fileName).timestampLocal) ?? timestampValue(a.startLocal) ?? target
    const bTime = timestampValue(parseFileIdentity(b.fileName).timestampLocal) ?? timestampValue(b.startLocal) ?? target
    return Math.abs(aTime - target) - Math.abs(bTime - target)
  })[0]?.modelId
}

function nameSimilarity(source: string, candidate: string): number {
  const sourceTokens = normalizeModelName(source).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const candidateTokens = normalizeModelName(candidate).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const sourceCompact = sourceTokens.join('')
  const candidateCompact = candidateTokens.join('')
  if (sourceCompact === candidateCompact) return 1
  const shared = sourceTokens.filter((token) => candidateTokens.includes(token)).length
  const tokenScore = sourceTokens.length + candidateTokens.length ? (2 * shared) / (sourceTokens.length + candidateTokens.length) : 0
  const containment = sourceCompact.includes(candidateCompact) || candidateCompact.includes(sourceCompact)
    ? Math.min(sourceCompact.length, candidateCompact.length) / Math.max(sourceCompact.length, candidateCompact.length)
    : 0
  return Math.max(tokenScore, containment * 0.9)
}

export function rankModelsForFilename(fileName: string, models: ModelProfile[]): ModelProfile[] {
  const sourceName = parseFileIdentity(fileName).modelName
  return [...models].sort((a, b) => nameSimilarity(sourceName, b.name) - nameSimilarity(sourceName, a.name) || a.name.localeCompare(b.name))
}
