import { useRef, useState } from 'react'
import { db } from '../db'
import { detectFlights, evaluateRules, FLIGHT_DETECTION_VERSION } from '../lib/analysis'
import { normalizeModelName, parseFileIdentity } from '../lib/filename'
import { filenameGroupKey, historicalModelForFile, rankModelsForFilename } from '../lib/filenameAssociations'
import { inferBatteriesFromLog } from '../lib/batteryInference'
import { inferWizardSuggestions } from '../lib/wizardInference'
import { requestPersistentStorage } from '../lib/storage'
import { parseTelemetryFile } from '../lib/workerClient'
import type { LogRecord, ModelProfile, ParsedLog } from '../types'
import { ModelEditor } from './ModelEditor'

interface PendingImport { file: File; parsed: ParsedLog; inferredName: string; normalizedName: string; timestampLocal?: string; matchingFileCount: number; existingModels: ModelProfile[] }

const aliasKey = (normalizedName: string) => `plane-alias:${normalizedName}`

export function ImportPanel({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const queueRef = useRef<File[]>([])
  const processingRef = useRef(false)
  const currentCancelRef = useRef<(() => void) | null>(null)
  const skippedPlanesRef = useRef(new Set<string>())
  const batchAssociationsRef = useRef(new Map<string, string>())
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<{ name: string; value: number; stage: string } | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')

  async function persist(file: File, parsed: ParsedLog, model: ModelProfile) {
    if (await db.logs.get(parsed.hash)) {
      setSummary(`${file.name} was already in the library and was skipped.`)
      return
    }
    // Typed bytes avoid WebKit's IndexedDB Blob/File persistence failures while
    // preserving the source CSV exactly. Existing Blob records remain readable.
    const rawBlob = new Uint8Array(await file.arrayBuffer())
    const log: LogRecord = {
      id: parsed.hash, modelId: model.id, fileName: file.name, rawBlob, importedAt: new Date().toISOString(),
      startLocal: parsed.startLocal, endLocal: parsed.endLocal, startMs: parsed.startMs, endMs: parsed.endMs,
      rowCount: parsed.rowCount, delimiter: parsed.delimiter, schemaFingerprint: parsed.schemaFingerprint,
      channels: parsed.channels, summaries: parsed.summaries, warnings: parsed.warnings, flightDetectionVersion: FLIGHT_DETECTION_VERSION
    }
    const flights = detectFlights(parsed, model.id, log.id, model.flightRule)
    const events = evaluateRules(parsed, log.id, model.rules)
    await db.transaction('rw', db.models, db.logs, db.flights, db.events, async () => {
      await db.models.put(model)
      await db.logs.add(log)
      if (flights.length) await db.flights.bulkAdd(flights)
      if (events.length) await db.events.bulkAdd(events)
    })
    void requestPersistentStorage()
    setSummary(`Imported ${file.name}: ${parsed.rowCount.toLocaleString()} rows, ${flights.length} flight${flights.length === 1 ? '' : 's'}, ${events.length} event${events.length === 1 ? '' : 's'}.`)
    onImported()
  }

  async function processQueue() {
    if (processingRef.current || queueRef.current.length === 0) return
    processingRef.current = true
    setError('')
    while (queueRef.current.length) {
      const file = queueRef.current.shift()!
      if (!/\.csv$/i.test(file.name)) { setError(`${file.name} is not a CSV file.`); continue }
      try {
        const identity = parseFileIdentity(file.name)
        const normalizedName = normalizeModelName(identity.modelName)
        if (skippedPlanesRef.current.has(normalizedName)) {
          setSummary(`Skipped ${file.name}; ${identity.modelName} is excluded from this upload.`)
          continue
        }
        const { promise, cancel } = parseTelemetryFile(file, file.name, ({ progress: value, stage }) => setProgress({ name: file.name, value, stage }))
        currentCancelRef.current = cancel
        const parsed = await promise
        if (await db.logs.get(parsed.hash)) {
          setSummary(`${file.name} duplicates an imported log and was ignored.`)
          continue
        }
        const exactModel = await db.models.where('normalizedName').equals(normalizedName).first()
        const batchModelId = exactModel ? undefined : batchAssociationsRef.current.get(normalizedName)
        const batchModel = batchModelId ? await db.models.get(batchModelId) : undefined
        const alias = exactModel || batchModel ? undefined : await db.settings.get(aliasKey(normalizedName))
        const associatedModel = typeof alias?.value === 'string' ? await db.models.get(alias.value) : undefined
        const allModels = await db.models.toArray()
        const historicalModelId = exactModel || batchModel || associatedModel ? undefined : historicalModelForFile(file.name, await db.logs.toArray(), allModels)
        const historicalModel = historicalModelId ? await db.models.get(historicalModelId) : undefined
        const model = exactModel ?? batchModel ?? associatedModel ?? historicalModel
        if (!model) {
          const existingModels = rankModelsForFilename(file.name, allModels)
          const matchingFileCount = 1 + queueRef.current.filter((queued) => filenameGroupKey(queued.name) === normalizedName).length
          setProgress(null)
          setPending({ file, parsed, inferredName: identity.modelName, normalizedName, timestampLocal: identity.timestampLocal, matchingFileCount, existingModels })
          processingRef.current = false
          return
        }
        await persist(file, parsed, model)
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') setSummary('Import cancelled. Files still waiting in this batch were not processed.')
        else setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        currentCancelRef.current = null
        setProgress(null)
      }
    }
    processingRef.current = false
  }

  function importFiles(files: File[]) {
    if (!processingRef.current && !pending && queueRef.current.length === 0) {
      skippedPlanesRef.current.clear()
      batchAssociationsRef.current.clear()
      setError('')
      setSummary('')
    }
    queueRef.current.push(...files)
    void processQueue()
  }

  function cancelImport() {
    queueRef.current = []
    currentCancelRef.current?.()
  }

  function closePendingImport() {
    queueRef.current = []
    setPending(null)
    setSummary('Import cancelled. Files still waiting in this batch were not processed.')
  }

  function skipPendingFile() {
    if (!pending) return
    setSummary(`Skipped ${pending.file.name}.`)
    setPending(null)
    void processQueue()
  }

  function skipPendingPlane() {
    if (!pending) return
    skippedPlanesRef.current.add(pending.normalizedName)
    const remaining = queueRef.current.filter((file) => normalizeModelName(parseFileIdentity(file.name).modelName) === pending.normalizedName).length
    setSummary(`Skipped ${pending.inferredName} for this upload (${remaining + 1} file${remaining ? 's' : ''}).`)
    setPending(null)
    void processQueue()
  }

  async function associatePendingModel(model: ModelProfile, remember: boolean) {
    if (!pending) return
    try {
      await persist(pending.file, pending.parsed, model)
      batchAssociationsRef.current.set(pending.normalizedName, model.id)
      if (remember) await db.settings.put({ key: aliasKey(pending.normalizedName), value: model.id })
      setSummary(`Imported ${pending.file.name} as ${model.name}${remember ? '; future matching files will use this plane.' : '.'}`)
      setPending(null)
      void processQueue()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return <>
    <section className={`import-drop ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void importFiles(Array.from(event.dataTransfer.files)) }}>
      <div className="import-mark">CSV</div><div><h2>Bring in a flight log</h2><p>Drop one or more FrSky or generic telemetry CSV files here.</p></div>
      <button className="button primary" onClick={() => inputRef.current?.click()}>Choose logs</button>
      <input ref={inputRef} className="visually-hidden" type="file" accept=".csv,text/csv" multiple onChange={(event) => { importFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = '' }} />
    </section>
    {progress && <div className="progress-card" role="status"><div><strong>{progress.stage}</strong><span>{progress.name}</span></div><progress max="1" value={progress.value} /><button className="button ghost" onClick={cancelImport}>Cancel</button></div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    {summary && <div className="notice success" role="status">{summary}</div>}
    {pending && <ModelEditor inferredName={pending.inferredName} filenameTimestamp={pending.timestampLocal} matchingFileCount={pending.matchingFileCount} channels={pending.parsed.channels} suggestedBatteries={inferBatteriesFromLog(pending.parsed)} suggestedSetup={inferWizardSuggestions(pending.parsed)} existingModels={pending.existingModels} onAssociateExisting={associatePendingModel} onCancel={closePendingImport} onSkipFile={skipPendingFile} onSkipPlane={skipPendingPlane} onSave={async (model) => {
      try {
        await persist(pending.file, pending.parsed, model)
        batchAssociationsRef.current.set(pending.normalizedName, model.id)
        if (model.normalizedName !== pending.normalizedName) await db.settings.put({ key: aliasKey(pending.normalizedName), value: model.id })
        setPending(null)
        void processQueue()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }} />}
  </>
}
