import type { DiagnosticEvent, DiagnosticRule, FlightRule, FlightSegment, ParsedLog } from '../types'

export const FLIGHT_DETECTION_VERSION = 2

function compare(value: number, operator: NonNullable<DiagnosticRule['operator']> | FlightRule['operator'], first: number, second?: number) {
  switch (operator) {
    case '>': return value > first
    case '>=': return value >= first
    case '<': return value < first
    case '<=': return value <= first
    case '==': return value === first
    case 'outside': return value < first || value > (second ?? first)
    case 'inside': return value >= first && value <= (second ?? first)
  }
}

function intervalsFromMask(mask: boolean[], timestamps: number[], minimumDurationMs: number, mergeGapMs = 0) {
  const intervals: Array<{ startMs: number; endMs: number; startIndex: number; endIndex: number }> = []
  let startIndex: number | null = null
  for (let index = 0; index <= mask.length; index += 1) {
    if (mask[index] && startIndex === null) startIndex = index
    if ((!mask[index] || index === mask.length) && startIndex !== null) {
      const endIndex = Math.max(startIndex, index - 1)
      if (timestamps[endIndex] - timestamps[startIndex] >= minimumDurationMs) {
        const previous = intervals.at(-1)
        if (previous && timestamps[startIndex] - previous.endMs <= mergeGapMs) {
          previous.endMs = timestamps[endIndex]
          previous.endIndex = endIndex
        } else {
          intervals.push({ startMs: timestamps[startIndex], endMs: timestamps[endIndex], startIndex, endIndex })
        }
      }
      startIndex = null
    }
  }
  return intervals
}

export function detectFlights(parsed: ParsedLog, modelId: string, logId: string, rule: FlightRule): FlightSegment[] {
  if (!rule.channelKey || !parsed.series[rule.channelKey]) {
    return [{ id: crypto.randomUUID(), logId, modelId, ordinal: 1, startMs: parsed.startMs, endMs: parsed.endMs, excluded: false, manual: false }]
  }
  const values = parsed.series[rule.channelKey]
  const timestamps = parsed.timestamps
  const deltas = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]).filter((delta) => delta > 0).sort((a, b) => a - b)
  const medianDelta = deltas[Math.floor(deltas.length / 2)] ?? 0
  const continuityLimit = Math.max(1000, medianDelta * 4)
  const stopThreshold = rule.stopThreshold ?? rule.threshold
  const intervals: Array<{ startMs: number; endMs: number }> = []
  let candidateStart: number | null = null
  let candidateLastActive: number | null = null
  let accumulatedActiveMs = 0
  let previousStartActive = false
  let previousTimestamp: number | null = null
  let flightStart: number | null = null
  let flightLastActive: number | null = null

  const resetCandidate = () => {
    candidateStart = null
    candidateLastActive = null
    accumulatedActiveMs = 0
    previousStartActive = false
  }

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index]
    const value = values[index]
    const startActive = value !== null && compare(value, rule.operator, rule.threshold)
    const holdActive = value !== null && compare(value, rule.operator, stopThreshold)

    if (flightStart !== null && flightLastActive !== null) {
      if (holdActive) flightLastActive = timestamp
      else if (timestamp - flightLastActive >= rule.mergeGapMs) {
        intervals.push({ startMs: flightStart, endMs: flightLastActive })
        flightStart = null
        flightLastActive = null
        resetCandidate()
      }
      previousTimestamp = timestamp
      continue
    }

    if (startActive) {
      if (candidateStart === null) candidateStart = timestamp
      if (previousStartActive && previousTimestamp !== null) {
        const delta = timestamp - previousTimestamp
        if (delta > 0 && delta <= continuityLimit) accumulatedActiveMs += delta
      }
      candidateLastActive = timestamp
      if (accumulatedActiveMs >= rule.minimumDurationMs) {
        flightStart = candidateStart
        flightLastActive = timestamp
        resetCandidate()
      } else previousStartActive = true
    } else {
      previousStartActive = false
      if (candidateLastActive !== null && timestamp - candidateLastActive >= rule.mergeGapMs) resetCandidate()
    }
    previousTimestamp = timestamp
  }

  if (flightStart !== null && flightLastActive !== null) intervals.push({ startMs: flightStart, endMs: flightLastActive })

  return intervals.map((interval, index) => ({
    id: crypto.randomUUID(), logId, modelId, ordinal: index + 1,
    startMs: interval.startMs, endMs: interval.endMs, excluded: false, manual: false
  }))
}

export function evaluateRules(parsed: ParsedLog, logId: string, rules: DiagnosticRule[]): DiagnosticEvent[] {
  const events: DiagnosticEvent[] = []
  for (const rule of rules.filter((candidate) => candidate.enabled)) {
    const inputs = rule.channelKeys.map((key) => parsed.series[key]).filter(Boolean)
    if (!inputs.length) continue

    if (rule.kind === 'gap') {
      const maximumGap = rule.value ?? 1000
      for (let index = 1; index < parsed.timestamps.length; index += 1) {
        const gap = parsed.timestamps[index] - parsed.timestamps[index - 1]
        if (gap > maximumGap) {
          events.push({
            id: crypto.randomUUID(), logId, ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
            channelKeys: rule.channelKeys, startMs: parsed.timestamps[index - 1], endMs: parsed.timestamps[index],
            peakValue: gap, message: `${rule.name}: ${(gap / 1000).toFixed(1)} second gap`
          })
        }
      }
      continue
    }

    const mask = parsed.timestamps.map((_, index) => {
      const states = inputs.map((values) => {
        const value = values[index]
        if (value === null) return false
        if (rule.kind === 'rate') {
          if (!index || values[index - 1] === null) return false
          const seconds = (parsed.timestamps[index] - parsed.timestamps[index - 1]) / 1000
          return seconds > 0 && Math.abs(value - (values[index - 1] as number)) / seconds > (rule.value ?? 0)
        }
        if (rule.kind === 'transition') return index > 0 && values[index - 1] !== value && value === rule.value
        return compare(value, rule.operator ?? '>', rule.value ?? 0, rule.secondValue)
      })
      return rule.aggregation === 'all' ? states.every(Boolean) : states.some(Boolean)
    })

    for (const interval of intervalsFromMask(mask, parsed.timestamps, rule.minimumDurationMs)) {
      const values = inputs.flatMap((series) => series.slice(interval.startIndex, interval.endIndex + 1)).filter((value): value is number => value !== null)
      const peak = values.length ? (rule.operator === '<' || rule.operator === '<=' ? Math.min(...values) : Math.max(...values)) : undefined
      events.push({
        id: crypto.randomUUID(), logId, ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
        channelKeys: rule.channelKeys, startMs: interval.startMs, endMs: interval.endMs, peakValue: peak,
        message: peak === undefined ? rule.name : `${rule.name}: ${peak.toFixed(2)}`
      })
    }
  }
  return events.sort((left, right) => left.startMs - right.startMs)
}
