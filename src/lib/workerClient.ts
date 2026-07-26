import type { ParsedLog, WorkerRequest, WorkerResponse } from '../types'

export interface ParseProgress {
  progress: number
  stage: string
}

export function parseTelemetryFile(
  file: File | Blob,
  fileName: string,
  onProgress?: (progress: ParseProgress) => void
): { promise: Promise<ParsedLog>; cancel: () => void } {
  const worker = new Worker(new URL('../workers/csv.worker.ts', import.meta.url), { type: 'module' })
  const requestId = crypto.randomUUID()
  let settled = false
  let rejectPromise: (reason?: unknown) => void = () => undefined
  const promise = new Promise<ParsedLog>((resolve, reject) => {
    rejectPromise = reject
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      if (response.requestId !== requestId) return
      if (response.type === 'progress') onProgress?.({ progress: response.progress, stage: response.stage })
      if (response.type === 'result') {
        settled = true
        worker.terminate()
        resolve(response.result)
      }
      if (response.type === 'error') {
        settled = true
        worker.terminate()
        reject(new Error(response.error))
      }
    })
    worker.addEventListener('error', (event) => {
      settled = true
      worker.terminate()
      reject(new Error(event.message || 'The telemetry worker stopped unexpectedly.'))
    })
    const request: WorkerRequest = { type: 'parse', requestId, file, fileName }
    worker.postMessage(request)
  })
  return {
    promise,
    cancel: () => {
      if (settled) return
      settled = true
      worker.terminate()
      rejectPromise(new DOMException('Import cancelled.', 'AbortError'))
    }
  }
}
