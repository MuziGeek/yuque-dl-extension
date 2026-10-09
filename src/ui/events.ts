/** 极简类型化事件总线 + 日志，替代原项目的 ora / cli-progress / log4js */
import type { DownloadStats } from '../core/types'

export interface ProgressSnapshot {
  total: number
  done: number
  failed: number
  currentTitle?: string
}

export type ArticleState = 'start' | 'success' | 'failed' | 'skipped' | 'updated'

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  time: number
}

export interface AppEvents {
  status: (message: string) => void
  progress: (snapshot: ProgressSnapshot) => void
  article: (payload: { path: string; state: ArticleState; message?: string }) => void
  log: (entry: LogEntry) => void
  done: (stats: DownloadStats) => void
}

export type EventName = keyof AppEvents
type Listener<K extends EventName> = AppEvents[K]

export class EventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners = new Map<EventName, Set<(...args: any[]) => void>>()

  on<K extends EventName>(name: K, fn: Listener<K>): () => void {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set())
    this.listeners.get(name)!.add(fn as (...args: unknown[]) => void)
    return () => this.off(name, fn)
  }

  off<K extends EventName>(name: K, fn: Listener<K>): void {
    this.listeners.get(name)?.delete(fn as (...args: unknown[]) => void)
  }

  emit<K extends EventName>(name: K, ...args: Parameters<Listener<K>>): void {
    this.listeners.get(name)?.forEach((fn) => {
      try {
        fn(...(args as unknown[]))
      } catch {
        /* 监听器异常不影响主流程 */
      }
    })
  }
}
