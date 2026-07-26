import { displayChannelName, normalizeToken } from './channels'
import type { ChannelDefinition, ParsedLog } from '../types'

type Scalar = number | boolean | null
type Evaluator = (index: number) => Scalar

interface Token {
  kind: 'number' | 'name' | 'channel' | 'operator' | 'left' | 'right' | 'comma' | 'end'
  text: string
  position: number
}

export interface TelemetryQueryResult {
  matches: boolean[]
  matchingIndices: number[]
  matchingSamples: number
  matchingDurationMs: number
  firstMatchMs?: number
  lastMatchMs?: number
  referencedChannelKeys: string[]
}

export class TelemetryQueryError extends Error {
  constructor(message: string, readonly position?: number) {
    super(position === undefined ? message : `${message} at character ${position + 1}`)
    this.name = 'TelemetryQueryError'
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let position = 0
  while (position < source.length) {
    const character = source[position]
    if (/\s/u.test(character)) { position += 1; continue }
    if (character === '`') {
      const start = position++
      let text = ''
      let closed = false
      while (position < source.length) {
        if (source[position] === '\\' && position + 1 < source.length) {
          text += source[position + 1]
          position += 2
        } else if (source[position] === '`') {
          position += 1
          closed = true
          break
        } else {
          text += source[position++]
        }
      }
      if (!closed) throw new TelemetryQueryError('Close the channel name with a backtick', start)
      tokens.push({ kind: 'channel', text, position: start })
      continue
    }
    if (/\d/u.test(character) || (character === '.' && /\d/u.test(source[position + 1] ?? ''))) {
      const start = position
      const match = source.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i)
      if (!match) throw new TelemetryQueryError('Invalid number', start)
      position += match[0].length
      tokens.push({ kind: 'number', text: match[0], position: start })
      continue
    }
    if (/[\p{L}_]/u.test(character)) {
      const start = position
      position += 1
      while (position < source.length && /[\p{L}\p{N}_.$]/u.test(source[position])) position += 1
      tokens.push({ kind: 'name', text: source.slice(start, position), position: start })
      continue
    }
    const twoCharacters = source.slice(position, position + 2)
    if (['>=', '<=', '==', '!=', '&&', '||'].includes(twoCharacters)) {
      tokens.push({ kind: 'operator', text: twoCharacters, position })
      position += 2
      continue
    }
    const kind = character === '(' ? 'left' : character === ')' ? 'right' : character === ',' ? 'comma' : 'operator'
    if (kind === 'operator' && !['>', '<', '+', '-', '*', '/', '%', '!'].includes(character)) {
      throw new TelemetryQueryError(`Unexpected character “${character}”`, position)
    }
    tokens.push({ kind, text: character, position })
    position += 1
  }
  tokens.push({ kind: 'end', text: '', position: source.length })
  return tokens
}

function channelAliases(channel: ChannelDefinition, customLabel?: string): string[] {
  const occurrenceSuffix = channel.occurrence > 1 ? ` [${channel.occurrence}]` : ''
  return [
    channel.key,
    channel.rawLabel,
    channel.label,
    displayChannelName(channel),
    `${channel.rawLabel}${occurrenceSuffix}`,
    customLabel,
    customLabel ? `${customLabel}${occurrenceSuffix}` : undefined
  ].filter((value): value is string => Boolean(value?.trim()))
}

class Parser {
  private cursor = 0
  readonly referenced = new Set<string>()
  private readonly aliases = new Map<string, ChannelDefinition[]>()

  constructor(
    private readonly tokens: Token[],
    private readonly parsed: ParsedLog,
    customLabels: Record<string, string>
  ) {
    for (const channel of parsed.channels.filter((candidate) => candidate.kind !== 'empty')) {
      for (const alias of channelAliases(channel, customLabels[channel.key])) {
        const normalized = normalizeToken(alias)
        const existing = this.aliases.get(normalized) ?? []
        if (!existing.some((candidate) => candidate.key === channel.key)) existing.push(channel)
        this.aliases.set(normalized, existing)
      }
    }
  }

  parse(): Evaluator {
    const evaluator = this.parseOr()
    const trailing = this.peek()
    if (trailing.kind !== 'end') throw new TelemetryQueryError(`Unexpected “${trailing.text}”`, trailing.position)
    return evaluator
  }

  private peek(): Token { return this.tokens[this.cursor] }
  private take(): Token { return this.tokens[this.cursor++] }
  private matches(text: string): boolean { return this.peek().text.toLocaleLowerCase() === text }

  private consume(text: string): boolean {
    if (!this.matches(text)) return false
    this.cursor += 1
    return true
  }

  private parseOr(): Evaluator {
    let left = this.parseAnd()
    while (this.consume('or') || this.consume('||')) {
      const right = this.parseAnd()
      const previous = left
      left = (index) => truthy(previous(index)) || truthy(right(index))
    }
    return left
  }

  private parseAnd(): Evaluator {
    let left = this.parseNot()
    while (this.consume('and') || this.consume('&&')) {
      const right = this.parseNot()
      const previous = left
      left = (index) => truthy(previous(index)) && truthy(right(index))
    }
    return left
  }

  private parseNot(): Evaluator {
    if (this.consume('not') || this.consume('!')) {
      const operand = this.parseNot()
      return (index) => !truthy(operand(index))
    }
    return this.parseComparison()
  }

  private parseComparison(): Evaluator {
    const left = this.parseAdditive()
    const operator = this.peek().text
    if (!['>', '>=', '<', '<=', '==', '!='].includes(operator)) return left
    this.take()
    const right = this.parseAdditive()
    return (index) => compare(left(index), right(index), operator)
  }

  private parseAdditive(): Evaluator {
    let left = this.parseMultiplicative()
    while (['+', '-'].includes(this.peek().text)) {
      const operator = this.take().text
      const right = this.parseMultiplicative()
      const previous = left
      left = (index) => arithmetic(previous(index), right(index), operator)
    }
    return left
  }

  private parseMultiplicative(): Evaluator {
    let left = this.parseUnary()
    while (['*', '/', '%'].includes(this.peek().text)) {
      const operator = this.take().text
      const right = this.parseUnary()
      const previous = left
      left = (index) => arithmetic(previous(index), right(index), operator)
    }
    return left
  }

  private parseUnary(): Evaluator {
    if (this.consume('-')) {
      const operand = this.parseUnary()
      return (index) => {
        const value = numberValue(operand(index))
        return value === null ? null : -value
      }
    }
    if (this.consume('+')) return this.parseUnary()
    return this.parsePrimary()
  }

  private parsePrimary(): Evaluator {
    const token = this.take()
    if (token.kind === 'number') {
      const value = Number(token.text)
      return () => value
    }
    if (token.kind === 'left') {
      const expression = this.parseOr()
      const closing = this.take()
      if (closing.kind !== 'right') throw new TelemetryQueryError('Expected a closing parenthesis', closing.position)
      return expression
    }
    if (token.kind === 'channel') return this.channel(token)
    if (token.kind === 'name') {
      const name = token.text.toLocaleLowerCase()
      if (this.peek().kind === 'left') return this.functionCall(name, token.position)
      if (name === 'time' || name === 'elapsed') return (index) => (this.parsed.timestamps[index] - this.parsed.startMs) / 1000
      if (name === 'true') return () => true
      if (name === 'false') return () => false
      return this.channel(token)
    }
    if (token.kind === 'end') throw new TelemetryQueryError('The query ends before the condition is complete', token.position)
    throw new TelemetryQueryError(`Expected a number, channel, or parenthesis instead of “${token.text}”`, token.position)
  }

  private channel(token: Token): Evaluator {
    const matches = this.aliases.get(normalizeToken(token.text)) ?? []
    if (!matches.length) throw new TelemetryQueryError(`Unknown channel “${token.text}”`, token.position)
    if (matches.length > 1) {
      const suggestions = matches.map((channel) => `\`${displayChannelName(channel)}\``).join(' or ')
      throw new TelemetryQueryError(`Channel “${token.text}” is ambiguous; use ${suggestions}`, token.position)
    }
    const key = matches[0].key
    this.referenced.add(key)
    return (index) => this.parsed.series[key]?.[index] ?? null
  }

  private functionCall(name: string, position: number): Evaluator {
    this.take()
    const argumentsList: Evaluator[] = []
    if (this.peek().kind !== 'right') {
      do argumentsList.push(this.parseOr())
      while (this.consume(','))
    }
    const closing = this.take()
    if (closing.kind !== 'right') throw new TelemetryQueryError('Expected a closing parenthesis', closing.position)
    const arity = (expected: number) => {
      if (argumentsList.length !== expected) throw new TelemetryQueryError(`${name}() expects ${expected} argument${expected === 1 ? '' : 's'}`, position)
    }
    if (name === 'missing' || name === 'present' || name === 'abs') {
      arity(1)
      if (name === 'missing') return (index) => numberValue(argumentsList[0](index)) === null
      if (name === 'present') return (index) => numberValue(argumentsList[0](index)) !== null
      return (index) => {
        const value = numberValue(argumentsList[0](index))
        return value === null ? null : Math.abs(value)
      }
    }
    if (name === 'between') {
      arity(3)
      return (index) => {
        const value = numberValue(argumentsList[0](index))
        const lower = numberValue(argumentsList[1](index))
        const upper = numberValue(argumentsList[2](index))
        return value !== null && lower !== null && upper !== null && value >= lower && value <= upper
      }
    }
    throw new TelemetryQueryError(`Unknown function “${name}”`, position)
  }
}

function numberValue(value: Scalar): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function truthy(value: Scalar): boolean {
  return value === true || (typeof value === 'number' && Number.isFinite(value) && value !== 0)
}

function arithmetic(left: Scalar, right: Scalar, operator: string): number | null {
  const first = numberValue(left)
  const second = numberValue(right)
  if (first === null || second === null) return null
  const result = operator === '+' ? first + second : operator === '-' ? first - second : operator === '*' ? first * second : operator === '/' ? first / second : first % second
  return Number.isFinite(result) ? result : null
}

function compare(left: Scalar, right: Scalar, operator: string): boolean {
  const first = numberValue(left)
  const second = numberValue(right)
  if (first === null || second === null) return false
  if (operator === '>') return first > second
  if (operator === '>=') return first >= second
  if (operator === '<') return first < second
  if (operator === '<=') return first <= second
  if (operator === '==') return first === second
  return first !== second
}

export function evaluateTelemetryQuery(
  source: string,
  parsed: ParsedLog,
  customLabels: Record<string, string> = {}
): TelemetryQueryResult {
  if (!source.trim()) throw new TelemetryQueryError('Enter a condition to run')
  const parser = new Parser(tokenize(source), parsed, customLabels)
  const evaluator = parser.parse()
  const matches = parsed.timestamps.map((_, index) => truthy(evaluator(index)))
  const matchingIndices: number[] = []
  let matchingDurationMs = 0
  for (let index = 0; index < matches.length; index += 1) {
    if (!matches[index]) continue
    matchingIndices.push(index)
    const delta = (parsed.timestamps[index + 1] ?? parsed.timestamps[index]) - parsed.timestamps[index]
    if (delta > 0 && Number.isFinite(delta)) matchingDurationMs += delta
  }
  return {
    matches,
    matchingIndices,
    matchingSamples: matchingIndices.length,
    matchingDurationMs,
    firstMatchMs: matchingIndices.length ? parsed.timestamps[matchingIndices[0]] : undefined,
    lastMatchMs: matchingIndices.length ? parsed.timestamps[matchingIndices[matchingIndices.length - 1]] : undefined,
    referencedChannelKeys: [...parser.referenced]
  }
}

export function quoteQueryChannel(name: string): string {
  return `\`${name.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}\``
}
