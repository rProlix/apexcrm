const TOKEN_PATTERN = /xox(?:a|b|p|r|s)-[A-Za-z0-9-]+/gi
const SECRET_KEY_PATTERN = /(authorization|token|secret|api[_-]?key)\s*[=:]\s*[^\s,}]+/gi
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const

export type LogLevel = keyof typeof LEVELS

let configuredLevel: LogLevel = 'info'

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(TOKEN_PATTERN, '[REDACTED_SLACK_TOKEN]').replace(SECRET_KEY_PATTERN, '$1=[REDACTED]')
  }
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /token|secret|authorization|api.?key/i.test(key) ? '[REDACTED]' : redact(item),
    ]))
  }
  return value
}

export function initializeLogger(level: LogLevel) {
  configuredLevel = level
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[configuredLevel]) return
  const payload = { timestamp: new Date().toISOString(), level, message, ...(context ? redact(context) as object : {}) }
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
}
