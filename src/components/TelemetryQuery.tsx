import { useMemo, useRef, useState } from 'react'
import { displayChannelName } from '../lib/channels'
import { evaluateTelemetryQuery, quoteQueryChannel, type TelemetryQueryResult } from '../lib/telemetryQuery'
import { TelemetryChart } from './TelemetryChart'
import type { ChannelSetting, ParsedLog } from '../types'

const ROW_PREVIEW_LIMIT = 100
const TABLE_CHANNEL_LIMIT = 8
const AUTOCOMPLETE_LIMIT = 10

interface QuerySuggestion {
  id: string
  label: string
  detail: string
  insert: string
  kind: 'channel' | 'syntax'
}

interface QueryCompletions {
  start: number
  end: number
  suggestions: QuerySuggestion[]
}

const SYNTAX_SUGGESTIONS: QuerySuggestion[] = [
  { id: 'syntax-and', label: 'and', detail: 'Both conditions must match', insert: 'and ', kind: 'syntax' },
  { id: 'syntax-or', label: 'or', detail: 'Either condition may match', insert: 'or ', kind: 'syntax' },
  { id: 'syntax-not', label: 'not', detail: 'Invert a condition', insert: 'not ', kind: 'syntax' },
  { id: 'syntax-time', label: 'time', detail: 'Elapsed seconds from log start', insert: 'time ', kind: 'syntax' },
  { id: 'syntax-between', label: 'between()', detail: 'Value within an inclusive range', insert: 'between(', kind: 'syntax' },
  { id: 'syntax-present', label: 'present()', detail: 'Channel has a value', insert: 'present(', kind: 'syntax' },
  { id: 'syntax-missing', label: 'missing()', detail: 'Channel has no value', insert: 'missing(', kind: 'syntax' },
  { id: 'syntax-abs', label: 'abs()', detail: 'Absolute value', insert: 'abs(', kind: 'syntax' }
]

function completionContext(source: string, cursor: number): { start: number; end: number; term: string; quoted: boolean } {
  let openBacktick = -1
  for (let index = 0; index < cursor; index += 1) {
    if (source[index] === '\\') { index += 1; continue }
    if (source[index] === '`') openBacktick = openBacktick === -1 ? index : -1
  }
  if (openBacktick >= 0) return { start: openBacktick, end: cursor, term: source.slice(openBacktick + 1, cursor), quoted: true }
  const term = source.slice(0, cursor).match(/[\p{L}\p{N}_.$]*$/u)?.[0] ?? ''
  return { start: cursor - term.length, end: cursor, term, quoted: false }
}

function queryCompletions(
  source: string,
  cursor: number,
  channels: ParsedLog['channels'],
  channelSettings: Record<string, ChannelSetting>,
  forced: boolean
): QueryCompletions {
  const context = completionContext(source, cursor)
  const term = context.term.trim().toLocaleLowerCase()
  if (!term && !context.quoted && !forced) return { ...context, suggestions: [] }
  const channelSuggestions = channels
    .filter((channel) => channel.kind !== 'empty')
    .filter((channel) => !term || [channel.rawLabel, channel.label, displayChannelName(channel), channelSettings[channel.key]?.label].some((name) => name?.toLocaleLowerCase().includes(term)))
    .slice(0, context.quoted || forced ? 8 : AUTOCOMPLETE_LIMIT)
    .map((channel): QuerySuggestion => ({
      id: `channel-${channel.key}`,
      label: channelSettings[channel.key]?.label || displayChannelName(channel),
      detail: `Channel · ${displayChannelName(channel)}`,
      insert: quoteQueryChannel(displayChannelName(channel)),
      kind: 'channel'
    }))
  const syntaxSuggestions = context.quoted ? [] : SYNTAX_SUGGESTIONS.filter((suggestion) => !term || suggestion.label.startsWith(term))
  const limit = forced && !term ? AUTOCOMPLETE_LIMIT + SYNTAX_SUGGESTIONS.length : AUTOCOMPLETE_LIMIT
  return { ...context, suggestions: [...channelSuggestions, ...syntaxSuggestions].slice(0, limit) }
}

function elapsedLabel(timestamp: number, startMs: number): string {
  const seconds = Math.max(0, timestamp - startMs) / 1000
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}

function durationLabel(durationMs: number): string {
  const seconds = durationMs / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  return `${Math.floor(seconds / 60)} min ${(seconds % 60).toFixed(0)} s`
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function saveCsv(rows: string[][], name: string) {
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function TelemetryQuery({
  parsed,
  channelSettings,
  selectedChannelKeys
}: {
  parsed: ParsedLog
  channelSettings: Record<string, ChannelSetting>
  selectedChannelKeys: string[]
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [result, setResult] = useState<TelemetryQueryResult>()
  const [error, setError] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const [autocompleteForced, setAutocompleteForced] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const activeChannels = useMemo(() => parsed.channels.filter((channel) => channel.kind !== 'empty'), [parsed.channels])
  const customLabels = useMemo(() => Object.fromEntries(Object.entries(channelSettings).map(([key, setting]) => [key, setting.label])), [channelSettings])
  const completions = useMemo(() => autocompleteOpen ? queryCompletions(query, cursorPosition, activeChannels, channelSettings, autocompleteForced) : { start: cursorPosition, end: cursorPosition, suggestions: [] }, [activeChannels, autocompleteForced, autocompleteOpen, channelSettings, cursorPosition, query])

  const examples = useMemo(() => {
    const first = activeChannels[0]
    const second = activeChannels[1]
    if (!first) return []
    const firstName = quoteQueryChannel(displayChannelName(first))
    const examplesList = [`present(${firstName})`, `${firstName} > 0`]
    if (second) examplesList.push(`${firstName} > 0 and ${quoteQueryChannel(displayChannelName(second))} < 100`)
    return examplesList
  }, [activeChannels])

  const tableChannelKeys = useMemo(() => {
    const available = new Set(activeChannels.map((channel) => channel.key))
    const preferred = [...(result?.referencedChannelKeys ?? []), ...selectedChannelKeys].filter((key) => available.has(key))
    return [...new Set(preferred.length ? preferred : activeChannels.map((channel) => channel.key))].slice(0, TABLE_CHANNEL_LIMIT)
  }, [activeChannels, result, selectedChannelKeys])

  const queryChart = useMemo<ParsedLog | undefined>(() => {
    if (!result?.matchingSamples || !selectedChannelKeys.length) return undefined
    return {
      ...parsed,
      series: Object.fromEntries(selectedChannelKeys.map((key) => [key, (parsed.series[key] ?? []).map((value, index) => result.matches[index] ? value : null)]))
    }
  }, [parsed, result, selectedChannelKeys])

  function run(nextQuery = query) {
    try {
      const nextResult = evaluateTelemetryQuery(nextQuery, parsed, customLabels)
      setQuery(nextQuery)
      setAppliedQuery(nextQuery)
      setResult(nextResult)
      setError('')
    } catch (caught) {
      setResult(undefined)
      setAppliedQuery('')
      setError(caught instanceof Error ? caught.message : 'The query could not be evaluated')
    }
  }

  function clear() {
    setQuery('')
    setAppliedQuery('')
    setResult(undefined)
    setError('')
    setAutocompleteOpen(false)
    setAutocompleteForced(false)
    inputRef.current?.focus()
  }

  function selectSuggestion(suggestion: QuerySuggestion) {
    const characterAfter = query[completions.end]
    const addSpace = suggestion.kind === 'channel' && characterAfter !== ')' && characterAfter !== ',' && !/\s|[<>!=+*/%]/u.test(characterAfter ?? '')
    const insertion = `${suggestion.insert}${addSpace ? ' ' : ''}`
    const next = `${query.slice(0, completions.start)}${insertion}${query.slice(completions.end)}`
    const nextCursor = completions.start + insertion.length
    setQuery(next)
    setCursorPosition(nextCursor)
    setAutocompleteOpen(false)
    setAutocompleteForced(false)
    setActiveSuggestion(0)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function insertChannel(name: string) {
    const reference = quoteQueryChannel(name)
    const input = inputRef.current
    if (!input) { setQuery((current) => `${current}${current ? ' ' : ''}${reference}`); return }
    const start = input.selectionStart
    const end = input.selectionEnd
    const leading = start > 0 && !/\s|[(]/u.test(query[start - 1]) ? ' ' : ''
    const trailing = end < query.length && !/\s|[),]/u.test(query[end]) ? ' ' : ''
    const inserted = `${leading}${reference}${trailing}`
    setQuery(`${query.slice(0, start)}${inserted}${query.slice(end)}`)
    setAutocompleteOpen(false)
    setAutocompleteForced(false)
    requestAnimationFrame(() => {
      input.focus()
      const cursor = start + inserted.length
      setCursorPosition(cursor)
      input.setSelectionRange(cursor, cursor)
    })
  }

  function exportMatches() {
    if (!result) return
    const rows = [['Timestamp', 'Elapsed seconds', ...activeChannels.map((channel) => channelSettings[channel.key]?.label || displayChannelName(channel))]]
    for (const index of result.matchingIndices) {
      rows.push([
        new Date(parsed.timestamps[index]).toISOString(),
        ((parsed.timestamps[index] - parsed.startMs) / 1000).toString(),
        ...activeChannels.map((channel) => parsed.series[channel.key]?.[index]?.toString() ?? '')
      ])
    }
    saveCsv(rows, `${parsed.fileName.replace(/\.csv$/i, '')}-query.csv`)
  }

  return <section className="analysis-panel telemetry-query-panel">
    <div className="panel-heading query-heading"><div><span className="eyebrow">Data explorer</span><h2>Query telemetry samples</h2><p>Describe the conditions you want to investigate. Results stay in this browser.</p></div>{result && <button className="button ghost small no-print" onClick={exportMatches} disabled={!result.matchingSamples}>Export matches</button>}</div>
    <form className="query-form no-print" onSubmit={(event) => { event.preventDefault(); run() }}>
      <label htmlFor="telemetry-query">Condition</label>
      <div className="query-input-row">
        <div className="query-editor-wrap">
          <textarea ref={inputRef} id="telemetry-query" rows={2} value={query} onChange={(event) => { setQuery(event.target.value); setCursorPosition(event.target.selectionStart); setAutocompleteOpen(true); setAutocompleteForced(false); setActiveSuggestion(0) }} onSelect={(event) => setCursorPosition(event.currentTarget.selectionStart)} onBlur={() => { setAutocompleteOpen(false); setAutocompleteForced(false) }} onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === ' ') { event.preventDefault(); setCursorPosition(event.currentTarget.selectionStart); setAutocompleteOpen(true); setAutocompleteForced(true); setActiveSuggestion(0); return }
            if (completions.suggestions.length && autocompleteOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setActiveSuggestion((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + completions.suggestions.length) % completions.suggestions.length); return }
            if (completions.suggestions.length && autocompleteOpen && (event.key === 'Enter' || event.key === 'Tab')) { event.preventDefault(); selectSuggestion(completions.suggestions[Math.min(activeSuggestion, completions.suggestions.length - 1)]); return }
            if (event.key === 'Escape' && autocompleteOpen) { event.preventDefault(); setAutocompleteOpen(false); setAutocompleteForced(false); return }
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); run() }
          }} placeholder="`RSSI (dB)` < 45 and `Rx Batt (V)` < 4.8" spellCheck={false} role="combobox" aria-autocomplete="list" aria-expanded={completions.suggestions.length > 0} aria-controls="query-suggestions" aria-activedescendant={completions.suggestions.length ? `query-suggestion-${completions.suggestions[Math.min(activeSuggestion, completions.suggestions.length - 1)].id}` : undefined} aria-describedby={error ? 'query-error' : 'query-help'} />
          {completions.suggestions.length > 0 && <div className="query-suggestions" id="query-suggestions" role="listbox">{completions.suggestions.map((suggestion, index) => <button id={`query-suggestion-${suggestion.id}`} type="button" role="option" aria-selected={index === activeSuggestion} className={index === activeSuggestion ? 'active' : ''} key={suggestion.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectSuggestion(suggestion)}><span>{suggestion.label}</span><small>{suggestion.detail}</small><kbd>{suggestion.kind === 'channel' ? 'channel' : 'syntax'}</kbd></button>)}</div>}
        </div>
        <button className="button primary" type="submit">Run query</button>
        <button className="button ghost" type="button" onClick={clear}>Clear</button>
      </div>
      <div className="query-helper" id="query-help"><span>Start typing a channel or keyword for suggestions. Use <code>and</code>, <code>or</code>, <code>not</code>, arithmetic, <code>time</code>, and helper functions.</span><span>Ctrl + Space: suggestions · ⌘/Ctrl + Enter: run</span></div>
      {error && <p className="query-error" id="query-error" role="alert">{error}</p>}
      <details className="query-channel-picker"><summary>Insert a channel</summary><div>{activeChannels.map((channel) => <button type="button" className="query-token" key={channel.key} onClick={() => insertChannel(displayChannelName(channel))}>{channelSettings[channel.key]?.label || displayChannelName(channel)}</button>)}</div></details>
      <div className="query-examples"><span>Examples</span>{examples.map((example) => <button type="button" key={example} onClick={() => run(example)}>{example}</button>)}</div>
    </form>

    {result && <div className="query-results" aria-live="polite">
      <div className="query-result-summary"><div><span>Matching samples</span><strong>{result.matchingSamples.toLocaleString()}</strong><small>{parsed.rowCount ? ((result.matchingSamples / parsed.rowCount) * 100).toFixed(1) : '0.0'}% of log</small></div><div><span>Estimated time</span><strong>{durationLabel(result.matchingDurationMs)}</strong><small>sample-held duration</small></div><div><span>First match</span><strong>{result.firstMatchMs === undefined ? '—' : `+${elapsedLabel(result.firstMatchMs, parsed.startMs)}`}</strong><small>from log start</small></div><div><span>Last match</span><strong>{result.lastMatchMs === undefined ? '—' : `+${elapsedLabel(result.lastMatchMs, parsed.startMs)}`}</strong><small>from log start</small></div></div>
      <p className="query-result-caption">Results for <code>{appliedQuery}</code></p>
      {!result.matchingSamples && <div className="query-empty">No samples matched this condition. Try widening a threshold or removing one part of the query.</div>}
      {queryChart && <div className="query-chart"><h3>Matching trace</h3><p>Selected chart channels are shown only where the query is true.</p><TelemetryChart parsed={queryChart} channelKeys={selectedChannelKeys} showPoints /></div>}
      {result.matchingSamples > 0 && <div className="query-table"><div className="query-table-heading"><h3>Matching rows</h3><span>Showing {Math.min(ROW_PREVIEW_LIMIT, result.matchingSamples).toLocaleString()} of {result.matchingSamples.toLocaleString()}</span></div><div className="table-wrap"><table><thead><tr><th>Elapsed</th>{tableChannelKeys.map((key) => { const channel = activeChannels.find((candidate) => candidate.key === key); return <th key={key}>{channelSettings[key]?.label || (channel ? displayChannelName(channel) : key)}</th> })}</tr></thead><tbody>{result.matchingIndices.slice(0, ROW_PREVIEW_LIMIT).map((index) => <tr key={index}><td>+{elapsedLabel(parsed.timestamps[index], parsed.startMs)}</td>{tableChannelKeys.map((key) => <td key={key}>{parsed.series[key]?.[index] ?? '—'}</td>)}</tr>)}</tbody></table></div></div>}
    </div>}
  </section>
}
