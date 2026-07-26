export interface FileIdentity {
  modelName: string
  timestampLocal?: string
}

const FILE_PATTERN = /^(.*)-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})(?:\s*\(\d+\))?$/i

export function parseFileIdentity(fileName: string): FileIdentity {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName
  const stem = baseName.replace(/\.csv$/i, '')
  const match = stem.match(FILE_PATTERN)
  if (!match) {
    return { modelName: stem.trim() || 'Unnamed plane' }
  }

  const [, model, year, month, day, hour, minute, second] = match
  return {
    modelName: model.trim() || 'Unnamed plane',
    timestampLocal: `${year}-${month}-${day}T${hour}:${minute}:${second}`
  }
}

export function normalizeModelName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}
