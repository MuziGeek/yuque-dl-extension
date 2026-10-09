/** 日志：同时输出到 console 与 UI 事件总线 */
import type { EventBus, LogEntry } from './events'

export interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
  success(message: string): void
}

export function createLogger(bus?: EventBus): Logger {
  const push = (level: LogEntry['level'], message: string) => {
    const entry: LogEntry = { level, message, time: Date.now() }
    bus?.emit('log', entry)
    if (level === 'error') console.error('[yuque-dl]', message)
    else if (level === 'warn') console.warn('[yuque-dl]', message)
    else console.log('[yuque-dl]', message)
  }
  return {
    info: (m) => push('info', m),
    warn: (m) => push('warn', m),
    error: (m) => push('error', m),
    success: (m) => push('success', m)
  }
}
