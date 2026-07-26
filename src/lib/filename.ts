export interface FileIdentity {
  modelName: string
  timestampLocal?: string
}

const FILE_PATTERN = /^(.*)-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})(?:-(\d{2}))?(?:\s*\(\d+\))?$/i

function inferredModelName(value: string): string {
  return value.trim() || 'Unnamed plane'
}

export function parseFileIdentity(fileName: string): FileIdentity {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName
  const stem = baseName.replace(/\.csv$/i, '')
  const match = stem.match(FILE_PATTERN)
  if (!match) {
    return { modelName: inferredModelName(stem) }
  }

  const [, model, year, month, day, hour, minute, second] = match
  return {
    modelName: inferredModelName(model),
    timestampLocal: `${year}-${month}-${day}T${hour}:${minute}:${second ?? '00'}`
  }
}

export function normalizeModelName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}
