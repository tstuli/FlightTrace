export type PropulsionType = 'electric' | 'combustion' | 'turbine' | 'glider' | 'custom'
export type AircraftCategory = 'airplane' | 'glider' | 'helicopter' | 'multirotor' | 'other'
export type RfProtocol = 'access' | 'td-tw' | 'accst' | 'other' | 'unknown'
export type Severity = 'info' | 'warning' | 'critical'

export interface ChannelDefinition {
  key: string
  rawLabel: string
  label: string
  unit: string
  occurrence: number
  index: number
  kind: 'numeric' | 'text' | 'empty'
  derivedKind?: 'lipo-pack-voltage' | 'lipo-cell-deviation'
  derivedGroup?: string
}

export interface ChannelSummary {
  channelKey: string
  count: number
  coverage: number
  min: number | null
  max: number | null
  mean: number | null
  timeWeightedMean: number | null
  p05: number | null
  median: number | null
  p95: number | null
  gaps: number
}

export interface ParsedLog {
  hash: string
  fileName: string
  delimiter: string
  rowCount: number
  startLocal: string
  endLocal: string
  startMs: number
  endMs: number
  timestamps: number[]
  channels: ChannelDefinition[]
  series: Record<string, Array<number | null>>
  summaries: ChannelSummary[]
  warnings: string[]
  schemaFingerprint: string
}

export interface ChannelSetting {
  label: string
  role?: string
  displayUnit?: string
  pinned?: boolean
}

export interface FlightRule {
  channelKey?: string
  operator: '>' | '>=' | '<' | '<=' | '=='
  threshold: number
  stopThreshold?: number
  minimumDurationMs: number
  mergeGapMs: number
}

export type DiagnosticRuleKind = 'threshold' | 'range' | 'gap' | 'rate' | 'transition'

export interface DiagnosticRule {
  id: string
  name: string
  kind: DiagnosticRuleKind
  channelKeys: string[]
  aggregation: 'any' | 'all'
  operator?: '>' | '>=' | '<' | '<=' | 'outside' | 'inside' | '=='
  value?: number
  secondValue?: number
  severity: Severity
  minimumDurationMs: number
  hysteresis: number
  enabled: boolean
  generated?: boolean
}

export interface BatteryProfile {
  source?: 'battery' | 'bec'
  chemistry: 'lipo' | 'life' | 'nimh' | 'liion' | 'custom' | 'none'
  cells?: number
  capacityMah?: number
  lowPerCell?: number
  criticalPerCell?: number
  becVoltage?: number
  lowVoltage?: number
  criticalVoltage?: number
  voltageChannelKey?: string
  inferred?: boolean
  inferenceNote?: string
}

export interface ModelProfile {
  id: string
  name: string
  normalizedName: string
  description: string
  category: AircraftCategory
  propulsion: PropulsionType
  rfProtocol: RfProtocol
  receiverCount: number
  receiverBatteries: BatteryProfile[]
  propulsionBatteries?: BatteryProfile[]
  /** Legacy single-pack fields retained for version-one profiles and backups. */
  receiverBattery?: BatteryProfile
  propulsionBattery?: BatteryProfile
  fuelCapacityMl?: number
  rpmMaximum?: number
  temperatureMaximum?: number
  channelSettings: Record<string, ChannelSetting>
  graphChannelKeys?: string[]
  flightRule: FlightRule
  rules: DiagnosticRule[]
  createdAt: string
  updatedAt: string
}

export interface LogRecord {
  id: string
  modelId: string
  fileName: string
  rawBlob: Blob | Uint8Array<ArrayBuffer>
  importedAt: string
  startLocal: string
  endLocal: string
  startMs: number
  endMs: number
  rowCount: number
  delimiter: string
  schemaFingerprint: string
  channels: ChannelDefinition[]
  summaries: ChannelSummary[]
  warnings: string[]
  flightDetectionVersion?: number
}

export interface FlightSegment {
  id: string
  logId: string
  modelId: string
  ordinal: number
  startMs: number
  endMs: number
  excluded: boolean
  manual: boolean
}

export interface DiagnosticEvent {
  id: string
  logId: string
  flightId?: string
  ruleId: string
  ruleName: string
  severity: Severity
  channelKeys: string[]
  startMs: number
  endMs: number
  peakValue?: number
  message: string
}

export interface ImportProfile {
  id: string
  schemaFingerprint: string
  delimiter: string
  dateColumn?: string
  timeColumn?: string
  timestampColumn?: string
  updatedAt: string
}

export interface BackupManifest {
  format: 'frsky-telemetry-backup'
  version: 1
  createdAt: string
  appVersion: string
  modelCount: number
  logCount: number
  checksums: Record<string, string>
}

export interface WorkerRequest {
  type: 'parse'
  requestId: string
  file: File | Blob
  fileName: string
}

export type WorkerResponse =
  | { type: 'progress'; requestId: string; progress: number; stage: string }
  | { type: 'result'; requestId: string; result: ParsedLog }
  | { type: 'error'; requestId: string; error: string }
