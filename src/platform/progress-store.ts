/**
 * 进度存储 —— 替代 yuque-dl 的 `utils/ProgressBar.ts`。
 *
 * 双写：
 *  - 目录内 `{知识库}/.yuque-dl/progress.json`（可迁移，换会话/换机器只要选同目录即可续传）
 *  - IndexedDB 镜像（key = progress:{bookId}，面板启动时快速恢复）
 */
import { writeFileAt, readFileAt, type DirHandle } from './fs'
import { idbGet, idbPut } from './fs-handle-store'
import type { IProgressItem } from '../core/types'

const PROGRESS_DIR = '.yuque-dl'
const PROGRESS_FILE = 'progress.json'

export interface ProgressData {
  bookId: number
  total: number
  updatedAt: number
  successUuids: string[]
  failedUuids: string[]
  items: IProgressItem[]
}

export interface ProgressStoreOptions {
  bookId: number
  total: number
  /** 知识库根目录句柄（可缺省，此时只写 IndexedDB） */
  bookDir?: DirHandle
  /** 增量模式：忽略完成计数，按内容更新时间判断是否需要重下 */
  incremental?: boolean
}

export class ProgressStore {
  private items = new Map<string, IProgressItem>()
  private successUuids = new Set<string>()
  private failedUuids = new Set<string>()
  private persistQueued = false

  readonly total: number
  readonly incremental: boolean
  /** 是否检测到上次未完成的下载 */
  isDownloadInterrupted = false

  constructor(private opts: ProgressStoreOptions) {
    this.total = opts.total
    this.incremental = Boolean(opts.incremental)
  }

  get curr(): number {
    return this.successUuids.size
  }

  get failedCount(): number {
    return this.failedUuids.size
  }

  get allItems(): IProgressItem[] {
    return [...this.items.values()]
  }

  getItem(uuid: string): IProgressItem | undefined {
    return this.items.get(uuid)
  }

  isSuccess(uuid: string): boolean {
    return this.successUuids.has(uuid)
  }

  failedPaths(): string[] {
    return [...this.failedUuids].map((uuid) => this.items.get(uuid)?.path || uuid)
  }

  /** 读取历史进度 */
  async init(): Promise<void> {
    const data = await this.load()
    if (!data) return
    for (const item of data.items || []) {
      if (item?.toc?.uuid) this.items.set(item.toc.uuid, item)
    }
    for (const uuid of data.successUuids || []) this.successUuids.add(uuid)
    for (const uuid of data.failedUuids || []) this.failedUuids.add(uuid)
    if (!this.incremental && this.successUuids.size > 0 && this.successUuids.size < this.total) {
      this.isDownloadInterrupted = true
    }
    // 增量模式下也保留旧 item 供内容比较
  }

  private async load(): Promise<ProgressData | undefined> {
    // 先读目录内文件（更权威）
    if (this.opts.bookDir) {
      const raw = await readFileAt(this.opts.bookDir, [PROGRESS_DIR], PROGRESS_FILE)
      if (raw) {
        try {
          return JSON.parse(raw) as ProgressData
        } catch {
          /* ignore */
        }
      }
    }
    // 回退 IndexedDB 镜像
    return idbGet<ProgressData>(`progress:${this.opts.bookId}`)
  }

  /** 记录一篇文档的结果 */
  async mark(item: IProgressItem, success: boolean): Promise<void> {
    this.items.set(item.toc.uuid, item)
    if (success) {
      this.successUuids.add(item.toc.uuid)
      this.failedUuids.delete(item.toc.uuid)
    } else {
      this.failedUuids.add(item.toc.uuid)
    }
    await this.schedulePersist()
  }

  private schedulePersist(): Promise<void> {
    if (this.persistQueued) return Promise.resolve()
    this.persistQueued = true
    return new Promise((resolve) => {
      setTimeout(async () => {
        this.persistQueued = false
        await this.persist()
        resolve()
      }, 300)
    })
  }

  async persist(): Promise<void> {
    const data: ProgressData = {
      bookId: this.opts.bookId,
      total: this.total,
      updatedAt: Date.now(),
      successUuids: [...this.successUuids],
      failedUuids: [...this.failedUuids],
      items: this.allItems
    }
    const json = JSON.stringify(data)
    await idbPut(`progress:${this.opts.bookId}`, data).catch(() => undefined)
    if (this.opts.bookDir) {
      await writeFileAt(this.opts.bookDir, [PROGRESS_DIR], PROGRESS_FILE, json).catch(() => undefined)
    }
  }

  async clearPersisted(): Promise<void> {
    await idbPut(`progress:${this.opts.bookId}`, null).catch(() => undefined)
  }

  /** 重置完成标记（重新下载时用） */
  reset(): void {
    this.successUuids.clear()
    this.failedUuids.clear()
  }
}
