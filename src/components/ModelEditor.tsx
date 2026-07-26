import { useMemo, useState } from 'react'
import { batteryWithDefaults, changeBatteryChemistry, changeBatterySource, defaultsForChemistry, packThresholds, propulsionBatteriesFor, receiverBatteriesFor } from '../lib/battery'
import { displayChannelName, isVoltageTelemetryChannel } from '../lib/channels'
import { normalizeModelName } from '../lib/filename'
import { generateModelRules } from '../lib/modelRules'
import type { WizardSuggestions } from '../lib/wizardInference'
import type { AircraftCategory, BatteryProfile, ChannelDefinition, ModelProfile, PropulsionType, RfProtocol } from '../types'

interface ModelEditorProps {
  initial?: ModelProfile
  inferredName?: string
  filenameTimestamp?: string
  matchingFileCount?: number
  channels: ChannelDefinition[]
  suggestedBatteries?: { receiverBatteries: BatteryProfile[]; propulsionBatteries: BatteryProfile[] }
  suggestedSetup?: WizardSuggestions
  onSave: (model: ModelProfile) => Promise<void> | void
  onCancel: () => void
  onSkipFile?: () => void
  onSkipPlane?: () => void
  existingModels?: ModelProfile[]
  onAssociateExisting?: (model: ModelProfile, remember: boolean) => Promise<void> | void
}

const emptyBattery: BatteryProfile = { source: 'battery', chemistry: 'none' }

function resizeBatteries(current: BatteryProfile[], quantity: number): BatteryProfile[] {
  const size = Math.max(1, Math.min(8, quantity || 1))
  return Array.from({ length: size }, (_, index) => current[index] ?? { ...emptyBattery })
}

function numberValue(value: string): number | undefined {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined
}

export function ModelEditor({ initial, inferredName = '', filenameTimestamp, matchingFileCount = 1, channels, suggestedBatteries, suggestedSetup, onSave, onCancel, onSkipFile, onSkipPlane, existingModels = [], onAssociateExisting }: ModelEditorProps) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(initial?.name ?? inferredName)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState<AircraftCategory>(initial?.category ?? 'airplane')
  const [propulsion, setPropulsion] = useState<PropulsionType>(initial?.propulsion ?? suggestedSetup?.propulsion ?? 'electric')
  const [rfProtocol, setRfProtocol] = useState<RfProtocol>(initial?.rfProtocol ?? suggestedSetup?.rfProtocol ?? 'unknown')
  const [receiverCount, setReceiverCount] = useState(initial?.receiverCount ?? suggestedSetup?.receiverCount ?? 1)
  const [receiverBatteries, setReceiverBatteries] = useState<BatteryProfile[]>(() => initial ? receiverBatteriesFor(initial).map(batteryWithDefaults) : suggestedBatteries?.receiverBatteries.length ? suggestedBatteries.receiverBatteries : [{ ...emptyBattery }])
  const [propulsionBatteries, setPropulsionBatteries] = useState<BatteryProfile[]>(() => initial ? propulsionBatteriesFor(initial).map(batteryWithDefaults) : suggestedBatteries?.propulsionBatteries.length ? suggestedBatteries.propulsionBatteries : [{ ...emptyBattery }])
  const [fuelCapacityMl, setFuelCapacityMl] = useState<number | undefined>(initial?.fuelCapacityMl)
  const [rpmMaximum, setRpmMaximum] = useState<number | undefined>(initial?.rpmMaximum)
  const [temperatureMaximum, setTemperatureMaximum] = useState<number | undefined>(initial?.temperatureMaximum)
  const [existingModelId, setExistingModelId] = useState(existingModels[0]?.id ?? '')
  const [rememberAssociation, setRememberAssociation] = useState(true)
  const defaultFlightChannel = suggestedSetup?.flightChannelKey ?? channels.find((channel) => /throttle/i.test(channel.rawLabel))?.key
  const [flightChannel, setFlightChannel] = useState(initial?.flightRule.channelKey ?? defaultFlightChannel ?? '')
  const [flightThreshold, setFlightThreshold] = useState(initial?.flightRule.threshold ?? suggestedSetup?.flightThreshold ?? (defaultFlightChannel ? -800 : 0))
  const [flightStopThreshold, setFlightStopThreshold] = useState(initial?.flightRule.stopThreshold ?? (initial?.flightRule.threshold ?? suggestedSetup?.flightStopThreshold ?? (defaultFlightChannel ? -950 : 0)))
  const [flightStartDurationMs, setFlightStartDurationMs] = useState(initial?.flightRule.minimumDurationMs ?? 3000)
  const [flightEndInactivityMs, setFlightEndInactivityMs] = useState(initial?.flightRule.mergeGapMs ?? 30000)
  const [channelSettings, setChannelSettings] = useState(() => Object.fromEntries(channels.map((channel) => [channel.key, initial?.channelSettings[channel.key] ?? { label: channel.label, displayUnit: channel.unit, pinned: /altitude|vfr|rssi|rpm|temp|volt/i.test(channel.rawLabel) }])))

  const draft = useMemo<ModelProfile>(() => {
    const now = new Date().toISOString()
    const base: ModelProfile = {
      id: initial?.id ?? crypto.randomUUID(), name: name.trim(), normalizedName: normalizeModelName(name), description,
      category, propulsion, rfProtocol, receiverCount,
      receiverBatteries,
      propulsionBatteries: propulsion === 'electric' ? propulsionBatteries : undefined,
      receiverBattery: receiverBatteries[0],
      propulsionBattery: propulsion === 'electric' ? propulsionBatteries[0] : undefined,
      fuelCapacityMl: propulsion === 'combustion' || propulsion === 'turbine' ? fuelCapacityMl : undefined,
      rpmMaximum: propulsion === 'combustion' || propulsion === 'turbine' ? rpmMaximum : undefined,
      temperatureMaximum: propulsion === 'combustion' || propulsion === 'turbine' ? temperatureMaximum : undefined,
      channelSettings,
      graphChannelKeys: initial?.graphChannelKeys,
      flightRule: { channelKey: flightChannel || undefined, operator: '>', threshold: flightThreshold, stopThreshold: flightStopThreshold, minimumDurationMs: flightStartDurationMs, mergeGapMs: flightEndInactivityMs },
      rules: [], createdAt: initial?.createdAt ?? now, updatedAt: now
    }
    base.rules = [...generateModelRules(base, channels), ...(initial?.rules.filter((rule) => !rule.generated) ?? [])]
    return base
  }, [category, channelSettings, channels, description, flightChannel, flightEndInactivityMs, flightStartDurationMs, flightStopThreshold, flightThreshold, fuelCapacityMl, initial, name, propulsion, propulsionBatteries, receiverBatteries, receiverCount, rfProtocol, rpmMaximum, temperatureMaximum])

  const steps = ['Plane', 'Power & RF', 'Channels & flight', 'Review']

  return <div className="modal-backdrop" role="presentation">
    <section className="modal wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="modal-header">
        <div><span className="eyebrow">{initial ? 'Model setup' : 'New plane detected'}</span><h2 id="wizard-title">{initial ? `Configure ${initial.name}` : 'Set up this plane'}</h2></div>
        <button className="icon-button" onClick={onCancel} aria-label="Close">×</button>
      </div>
      <ol className="stepper">{steps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'done' : ''}><span>{index + 1}</span>{label}</li>)}</ol>

      {step === 0 && <div className="form-grid">
        {!initial && existingModels.length > 0 && onAssociateExisting && <section className="existing-plane-association">
          <div><span className="eyebrow">Already in your library?</span><h3>Associate this log with an existing plane</h3><p>Filename group <strong>{inferredName}</strong>{filenameTimestamp ? ` · ${filenameTimestamp.replace('T', ' ')}` : ''}. {matchingFileCount > 1 ? `${matchingFileCount} files in this upload share this aircraft name.` : 'The closest plane-name match is preselected.'}</p></div>
          <label className="field">Existing plane<select value={existingModelId} onChange={(event) => setExistingModelId(event.target.value)}>{existingModels.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={rememberAssociation} onChange={(event) => setRememberAssociation(event.target.checked)} /> Remember this filename plane name for future imports</label>
          <button className="button primary" disabled={!existingModelId} onClick={() => { const model = existingModels.find((candidate) => candidate.id === existingModelId); if (model) void onAssociateExisting(model, rememberAssociation) }}>Associate log with selected plane</button>
        </section>}
        <label className="field wide">Plane name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field wide">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional notes, airframe, owner…" /></label>
        <label className="field">Aircraft category<select value={category} onChange={(event) => setCategory(event.target.value as AircraftCategory)}><option value="airplane">Airplane</option><option value="glider">Glider</option><option value="helicopter">Helicopter</option><option value="multirotor">Multirotor</option><option value="other">Other</option></select></label>
        <label className="field">Propulsion<select value={propulsion} onChange={(event) => setPropulsion(event.target.value as PropulsionType)}><option value="electric">Electric</option><option value="combustion">Combustion</option><option value="turbine">Turbine</option><option value="glider">Unpowered</option><option value="custom">Custom</option></select></label>
      </div>}

      {step === 1 && <div className="form-grid">
        {!initial && suggestedSetup?.notes.length ? <p className="battery-inference wide"><strong>Auto-selected from this log.</strong> {suggestedSetup.notes.join(' ')} Review these choices before saving.</p> : null}
        <label className="field">RF protocol<select value={rfProtocol} onChange={(event) => setRfProtocol(event.target.value as RfProtocol)}><option value="unknown">Unknown / decide later</option><option value="access">ACCESS</option><option value="td-tw">TD / TW</option><option value="accst">ACCST</option><option value="other">Other</option></select></label>
        <label className="field">Receivers<input type="number" min="1" max="3" value={receiverCount} onChange={(event) => setReceiverCount(Number(event.target.value))} /></label>
        <label className="field">Receiver power sources<input type="number" min="1" max="8" value={receiverBatteries.length} onChange={(event) => setReceiverBatteries((current) => resizeBatteries(current, Number(event.target.value)))} /></label>
        <p className="battery-count-help">Configure each independently monitored receiver battery bank or BEC output.</p>
        {receiverBatteries.map((battery, index) => <BatteryFields allowBec key={`receiver-${index}`} title={receiverBatteries.length === 1 ? 'Receiver power' : `Receiver power ${index + 1}`} value={battery} channels={channels} onChange={(next) => setReceiverBatteries((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))} />)}
        {propulsion === 'electric' && <>
          <label className="field">Flight batteries<input type="number" min="1" max="8" value={propulsionBatteries.length} onChange={(event) => setPropulsionBatteries((current) => resizeBatteries(current, Number(event.target.value)))} /></label>
          <p className="battery-count-help">Configure separate monitored banks. For a series bank measured as one voltage, use one entry with the total series cell count.</p>
          {propulsionBatteries.map((battery, index) => <BatteryFields key={`flight-${index}`} title={propulsionBatteries.length === 1 ? 'Flight battery' : `Flight battery ${index + 1}`} value={battery} channels={channels} onChange={(next) => setPropulsionBatteries((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))} />)}
        </>}
        {(propulsion === 'combustion' || propulsion === 'turbine') && <>
          <label className="field">Fuel capacity (mL)<input type="number" min="0" value={fuelCapacityMl ?? ''} onChange={(event) => setFuelCapacityMl(numberValue(event.target.value))} /></label>
          <label className="field">Maximum RPM<input type="number" min="0" value={rpmMaximum ?? ''} onChange={(event) => setRpmMaximum(numberValue(event.target.value))} /></label>
          <label className="field">Maximum temperature (°C)<input type="number" min="0" value={temperatureMaximum ?? ''} onChange={(event) => setTemperatureMaximum(numberValue(event.target.value))} /></label>
        </>}
      </div>}

      {step === 2 && <div className="channel-step">
        <div className="form-grid compact">
          <label className="field wide">Flight-active channel<select value={flightChannel} onChange={(event) => setFlightChannel(event.target.value)}><option value="">Use the entire recording</option>{channels.filter((channel) => channel.kind !== 'empty').map((channel) => <option key={channel.key} value={channel.key}>{displayChannelName(channel)}</option>)}</select></label>
          {flightChannel && <><label className="field">Start when greater than<input type="number" value={flightThreshold} onChange={(event) => setFlightThreshold(Number(event.target.value))} /></label><label className="field">Remain active while greater than<input type="number" value={flightStopThreshold} onChange={(event) => setFlightStopThreshold(Number(event.target.value))} /></label><label className="field">Start confirmation (seconds)<input type="number" min="0" step="1" value={flightStartDurationMs / 1000} onChange={(event) => setFlightStartDurationMs(Math.max(0, Number(event.target.value) * 1000))} /></label><label className="field">End after inactivity (seconds)<input type="number" min="0" step="1" value={flightEndInactivityMs / 1000} onChange={(event) => setFlightEndInactivityMs(Math.max(0, Number(event.target.value) * 1000))} /></label></>}
        </div>
        <p className="muted">A flight starts after enough accumulated active time and ends only after sustained inactivity. The lower stop threshold adds hysteresis around noisy controls. Rename ambiguous channels and pin the signals you want in summaries.</p>
        <div className="channel-mapper">{channels.filter((channel) => channel.kind !== 'empty').map((channel) => <div className="channel-map-row" key={channel.key}>
          <span>{displayChannelName(channel)}</span>
          <input aria-label={`Display name for ${displayChannelName(channel)}`} value={channelSettings[channel.key]?.label ?? channel.label} onChange={(event) => setChannelSettings((current) => ({ ...current, [channel.key]: { ...current[channel.key], label: event.target.value } }))} />
          <label className="check"><input type="checkbox" checked={channelSettings[channel.key]?.pinned ?? false} onChange={(event) => setChannelSettings((current) => ({ ...current, [channel.key]: { ...current[channel.key], pinned: event.target.checked } }))} /> Pin</label>
        </div>)}</div>
      </div>}

      {step === 3 && <div>
        <div className="review-grid"><div><span>Plane</span><strong>{draft.name || 'Unnamed plane'}</strong></div><div><span>Propulsion</span><strong>{draft.propulsion}</strong></div><div><span>RF</span><strong>{draft.rfProtocol}</strong></div><div><span>Detected channels</span><strong>{channels.filter((channel) => channel.kind !== 'empty').length}</strong></div></div>
        <h3>Generated diagnostics</h3>
        <div className="rule-list">{draft.rules.map((rule) => <div className="rule-row" key={rule.id}><span className={`severity ${rule.severity}`}></span><div><strong>{rule.name}</strong><small>{rule.kind} · {rule.channelKeys.length} channel{rule.channelKeys.length === 1 ? '' : 's'} · {rule.minimumDurationMs / 1000}s minimum</small></div></div>)}</div>
        <p className="safety-note">These are editable analysis defaults, not guarantees of safe operation. Confirm them against your equipment documentation.</p>
      </div>}

      <div className="modal-actions"><div className="modal-secondary-actions">{step > 0 && <button className="button ghost" onClick={() => setStep(step - 1)}>Back</button>}{onSkipFile ? <button className="button ghost" onClick={onSkipFile}>Skip this file</button> : step === 0 && <button className="button ghost" onClick={onCancel}>Cancel</button>}{onSkipPlane && <button className="button danger ghost" onClick={onSkipPlane}>Skip this plane for this upload</button>}</div>{step < 3 ? <button className="button primary" disabled={!name.trim()} onClick={() => setStep(step + 1)}>Continue</button> : <button className="button primary" onClick={() => onSave(draft)}>{initial ? 'Save and reanalyze' : 'Save plane and import'}</button>}</div>
    </section>
  </div>
}

function BatteryFields({ title, value, channels, onChange, allowBec = false }: { title: string; value: BatteryProfile; channels: ChannelDefinition[]; onChange: (value: BatteryProfile) => void; allowBec?: boolean }) {
  const update = (patch: Partial<BatteryProfile>) => onChange({ ...value, ...patch, inferred: false, inferenceNote: undefined })
  const defaults = defaultsForChemistry(value.chemistry)
  const thresholds = packThresholds(value)
  const voltageChannels = channels.filter(isVoltageTelemetryChannel)
  return <fieldset className="battery-fields wide"><legend>{title}</legend><div className="form-grid compact">
    {allowBec && <label className="field">Power source<select value={value.source ?? 'battery'} onChange={(event) => onChange(changeBatterySource(value, event.target.value as 'battery' | 'bec'))}><option value="battery">Dedicated battery</option><option value="bec">BEC</option></select></label>}
    {value.source === 'bec' ? <>
      <label className="field">BEC output voltage (V)<input type="number" step="0.1" min="0" value={value.becVoltage ?? ''} onChange={(event) => update({ becVoltage: numberValue(event.target.value) })} /></label>
      <label className="field">Voltage telemetry channel<select value={value.voltageChannelKey ?? ''} onChange={(event) => update({ voltageChannelKey: event.target.value || undefined })}><option value="">Auto-detect when possible</option>{voltageChannels.map((channel) => <option key={channel.key} value={channel.key}>{displayChannelName(channel)}</option>)}</select></label>
      <label className="field">Warning voltage (V)<input type="number" step="0.05" min="0" value={value.lowVoltage ?? ''} onChange={(event) => update({ lowVoltage: numberValue(event.target.value) })} /></label>
      <label className="field">Critical voltage (V)<input type="number" step="0.05" min="0" value={value.criticalVoltage ?? ''} onChange={(event) => update({ criticalVoltage: numberValue(event.target.value) })} /></label>
      {value.inferred && <p className="battery-inference"><strong>Estimated from this log.</strong> {value.inferenceNote} Please confirm.</p>}
      <p className="battery-guidance">Set thresholds for the receiver bus voltage. Confirm the configured output and safe input range for the receiver and servos.</p>
    </> : <>
    <label className="field">Chemistry<select value={value.chemistry} onChange={(event) => onChange({ ...changeBatteryChemistry(value, event.target.value as BatteryProfile['chemistry']), inferred: false, inferenceNote: undefined })}><option value="none">Not configured</option><option value="lipo">LiPo</option><option value="life">LiFe</option><option value="liion">Li-ion</option><option value="nimh">NiMH</option><option value="custom">Custom</option></select></label>
    {value.chemistry !== 'none' && <><label className="field">Cells<input type="number" min="1" max="24" value={value.cells ?? ''} onChange={(event) => update({ cells: numberValue(event.target.value) })} /></label><label className="field">Capacity (mAh)<input type="number" min="0" value={value.capacityMah ?? ''} onChange={(event) => update({ capacityMah: numberValue(event.target.value) })} /></label><label className="field">Voltage telemetry channel<select value={value.voltageChannelKey ?? ''} onChange={(event) => update({ voltageChannelKey: event.target.value || undefined })}><option value="">Auto-detect when possible</option>{voltageChannels.map((channel) => <option key={channel.key} value={channel.key}>{displayChannelName(channel)}</option>)}</select></label><label className="field">Warning / cell (V)<input type="number" step="0.05" min="0" value={value.lowPerCell ?? ''} onChange={(event) => update({ lowPerCell: numberValue(event.target.value) })} /></label><label className="field">Critical / cell (V)<input type="number" step="0.05" min="0" value={value.criticalPerCell ?? ''} onChange={(event) => update({ criticalPerCell: numberValue(event.target.value) })} /></label>
      <output className="battery-threshold-preview" aria-live="polite">
        <span><small>Warning pack voltage</small><strong>{thresholds.warning === undefined ? 'Choose cells' : `${thresholds.warning.toFixed(2)} V`}</strong></span>
        <span><small>Critical pack voltage</small><strong>{thresholds.critical === undefined ? 'Choose cells' : `${thresholds.critical.toFixed(2)} V`}</strong></span>
      </output>
      {value.inferred && <p className="battery-inference"><strong>Estimated from this log.</strong> {value.inferenceNote} Please confirm.</p>}
      <p className="battery-guidance">{defaults ? `Typical starting points: ${defaults.warningPerCell.toFixed(2)} V warning and ${defaults.criticalPerCell.toFixed(2)} V critical per cell.` : 'Enter thresholds appropriate for this battery.'} Selecting a LiPo A/B cell point monitors all active cells in that bank. Confirm values against the battery and equipment manufacturer.</p></>}
    </>}
  </div></fieldset>
}
