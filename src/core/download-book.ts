/**
 * 知识库整库下载编排 —— 移植自 yuque-dl `src/index.ts: main` + `src/download/list.ts`。
 *
 * 与原项目的差异：
 *  - 两遍处理：先按原始顺序构建「路径映射 uuidMap + 待下载任务」，再并发下载
 *    （原项目是串行 for 循环；这里保持路径构造逻辑一致，只把下载并发化）；
 *  - 目录用 FSA 句柄；进度用 ProgressStore；
 *  - 进度/日志通过 EventBus 上报给面板 UI。
 */
import { getKnowledgeBaseInfo, buildArticleUrlPrefix } from './yuque-api'
import { ARTICLE_CONTENT_TYPE, ARTICLE_TOC_TYPE } from './constants'
import { fixPath } from './markdown/fix'
import { Summary } from './markdown/summary'
import { downloadArticle } from './download-article'
import { ensureDir, type DirHandle } from '../platform/fs'
import { createLimiter } from '../platform/concurrency'
import { ProgressStore } from '../platform/progress-store'
import type { EventBus } from '../ui/events'
import type { ArticleInfo, DownloadStats, IDownloadOptions, IProgressItem, Toc } from './types'

export interface DownloadBookParams {
  url: string
  /** 用户选择的根目录句柄 */
  root: DirHandle
  options: IDownloadOptions
  bus: EventBus
  /** 主动取消 */
  signal?: AbortSignal
}

const DEFAULT_CONCURRENCY = { docs: 3, files: 5 }

export async function downloadBook(params: DownloadBookParams): Promise<DownloadStats> {
  const { url, root, options, bus } = params
  const signal = params.signal
  const log = (msg: string) => bus.emit('status', msg)

  bus.emit('status', '正在解析知识库信息…')
  const info = await getKnowledgeBaseInfo(url)
  const { bookId, tocList = [], bookName = '', bookDesc = '', bookSlug = '', host, imageServiceDomains = [] } = info

  if (!bookId) throw new Error('未找到知识库信息（bookId 为空），请确认链接是知识库首页且已登录语雀')
  if (!tocList.length) throw new Error('未找到目录（toc 为空），可能是权限不足或链接有误')

  const bookDirName = fixPath(bookName) || String(bookId)
  const bookDir = await ensureDir(root, [bookDirName])

  // ---------- 第一遍：构建路径映射 + 任务列表 ----------
  const uuidMap = new Map<string, IProgressItem>()
  const docTasks: Array<{ progressItem: IProgressItem; articleInfo: ArticleInfo }> = []
  const articleUrlPrefix = bookSlug ? buildArticleUrlPrefix(url, bookSlug) : url

  const total = tocList.length
  for (let i = 0; i < total; i++) {
    const item = tocList[i]
    if (typeof item.type !== 'string') continue
    const itemType = item.type.toLocaleLowerCase()

    if (itemType === ARTICLE_TOC_TYPE.TITLE || item['child_uuid'] !== '' || itemType === ARTICLE_TOC_TYPE.LINK) {
      // 构建自身路径（含自身）
      const { pathTitleList, rawPathTitleList, pathIdList } = buildChain(item, uuidMap)
      const progressItem: IProgressItem = {
        path: pathTitleList.map(fixPath).join('/'),
        rawPath: rawPathTitleList.map(fixPath).join('/'),
        pathTitleList,
        rawPathTitleList,
        pathIdList,
        toc: item
      }
      if (itemType === ARTICLE_TOC_TYPE.LINK) {
        // 外链类型：不建目录、不下载
        continue
      }
      await ensureDir(bookDir, pathTitleList.map(fixPath).join('/').split('/').filter(Boolean))
      if (itemType === ARTICLE_CONTENT_TYPE.DOC) {
        const docTask = buildDocTask(item, uuidMap, articleUrlPrefix, bookId, host, imageServiceDomains)
        if (docTask) {
          uuidMap.set(item.uuid, docTask.progressItem)
          docTasks.push(docTask)
        }
      } else {
        uuidMap.set(item.uuid, progressItem)
      }
    } else if (item.url) {
      const docTask = buildDocTask(item, uuidMap, articleUrlPrefix, bookId, host, imageServiceDomains)
      if (docTask) {
        uuidMap.set(item.uuid, docTask.progressItem)
        docTasks.push(docTask)
      }
    }
  }

  // ---------- 进度存储 ----------
  const progressStore = new ProgressStore({
    bookId,
    total: docTasks.length,
    bookDir,
    incremental: options.incremental
  })
  await progressStore.init()

  const concurrency = { ...DEFAULT_CONCURRENCY, ...(options.concurrency || {}) }
  const docLimit = createLimiter(concurrency.docs)
  const fileLimit = createLimiter(concurrency.files)

  const stats: DownloadStats = { total: docTasks.length, success: 0, failed: 0, skipped: 0, updated: 0 }
  const pending = docTasks.filter((t) => {
    if (!options.incremental && progressStore.isSuccess(t.progressItem.toc.uuid)) {
      stats.skipped += 1
      stats.success += 1
      return false
    }
    return true
  })

  log(
    `知识库「${bookName}」，共 ${docTasks.length} 篇文档` +
      (stats.skipped ? `（已完成 ${stats.skipped} 篇将跳过）` : '')
  )

  let finished = 0
  const baseDone = stats.skipped

  const emitProgress = (currentTitle?: string) => {
    bus.emit('progress', {
      total: stats.total,
      done: baseDone + finished,
      failed: stats.failed,
      currentTitle
    })
  }
  emitProgress()

  await Promise.all(
    pending.map((task) =>
      docLimit(async () => {
        if (signal?.aborted) return
        const { progressItem, articleInfo } = task
        bus.emit('article', { path: progressItem.path, state: 'start' })
        try {
          const oldItem = options.incremental ? progressStore.getItem(progressItem.toc.uuid) : undefined
          const res = await downloadArticle({
            articleInfo,
            options,
            progressItem,
            oldProgressItem: oldItem,
            bookDir,
            imageLimit: fileLimit,
            fileLimit
          })
          if (res.needDownload === false) {
            stats.skipped += 1
          } else if (res.isUpdateDownload) {
            stats.updated += 1
            stats.success += 1
          } else {
            stats.success += 1
          }
          await progressStore.mark(progressItem, true)
          res.warnings.forEach((w) => bus.emit('log', { level: 'warn', message: `${progressItem.path}: ${w}`, time: Date.now() }))
          bus.emit('article', {
            path: progressItem.path,
            state: res.isUpdateDownload ? 'updated' : res.needDownload === false ? 'skipped' : 'success'
          })
        } catch (e) {
          stats.failed += 1
          await progressStore.mark(progressItem, false)
          bus.emit('article', {
            path: progressItem.path,
            state: 'failed',
            message: (e as Error).message || 'unknown error'
          })
        } finally {
          finished += 1
          emitProgress(articleInfo.articleTitle)
        }
      })
    )
  )

  // ---------- 生成目录 ----------
  bus.emit('status', '正在生成目录 index.md…')
  try {
    const summary = new Summary({ bookDir, bookName, bookDesc, uuidMap })
    await summary.genFile()
  } catch (e) {
    bus.emit('log', { level: 'warn', message: `生成 index.md 失败: ${(e as Error).message}`, time: Date.now() })
  }

  await progressStore.persist()
  bus.emit('done', stats)
  return stats
}

/** 沿 parent_uuid 向上回溯，构建 pathTitleList（含自身） */
function buildChain(
  item: Toc,
  uuidMap: Map<string, IProgressItem>
): { pathTitleList: string[]; rawPathTitleList: string[]; pathIdList: string[] } {
  const pathTitleList: string[] = []
  const rawPathTitleList: string[] = []
  const pathIdList: string[] = []
  let tempItem: Toc | undefined = item
  while (tempItem) {
    pathTitleList.unshift(`${fixPath(tempItem.title)}_${tempItem.uuid}`)
    rawPathTitleList.unshift(`${fixPath(tempItem.title)}`)
    pathIdList.unshift(tempItem.uuid)
    const parent: IProgressItem | undefined = tempItem['parent_uuid']
      ? uuidMap.get(tempItem['parent_uuid'])
      : undefined
    tempItem = parent?.toc
  }
  return { pathTitleList, rawPathTitleList, pathIdList }
}

/** 构建单篇文档任务（不含下载），路径规则与原项目一致 */
function buildDocTask(
  item: Toc,
  uuidMap: Map<string, IProgressItem>,
  articleUrlPrefix: string,
  bookId: number,
  host: string | undefined,
  imageServiceDomains: string[]
): { progressItem: IProgressItem; articleInfo: ArticleInfo } | undefined {
  if (!item.url) return undefined
  const itemType = item.type.toLocaleLowerCase()
  const preItem: Partial<IProgressItem> = uuidMap.get(item['parent_uuid']) ?? {
    pathTitleList: [],
    rawPathTitleList: [],
    pathIdList: []
  }
  const preTitleList = preItem.pathTitleList ?? []
  const preRawTitleList = preItem.rawPathTitleList ?? []
  const preIdList = preItem.pathIdList ?? []

  const fileName = fixPath(item.title)
  const pathTitleList = [...preTitleList, `${fileName}_${item.uuid}`]
  const rawPathTitleList = [...preRawTitleList, fileName]
  const pathIdList = [...preIdList, item.uuid]

  let mdPath = [...preTitleList, `${fileName}_${item.uuid}.md`].map(fixPath).join('/')
  let rawMdPath = [...preTitleList, `${fileName}.md`].map(fixPath).join('/')
  let savePath = preTitleList.map(fixPath).join('/')

  // 既是标题也是文档
  if (itemType === ARTICLE_CONTENT_TYPE.DOC && item['child_uuid']) {
    mdPath = [...preTitleList, `${fileName}_${item.uuid}`, 'index.md'].map(fixPath).join('/')
    rawMdPath = [...preTitleList, `${fileName}`, 'index.md'].map(fixPath).join('/')
    savePath = pathTitleList.map(fixPath).join('/')
  }

  const progressItem: IProgressItem = {
    path: mdPath,
    savePath,
    rawPath: rawMdPath,
    pathTitleList,
    rawPathTitleList,
    rawMdPath,
    pathIdList,
    toc: item
  }

  const articleInfo: ArticleInfo = {
    bookId,
    itemUrl: item.url,
    savePath,
    saveFilePath: mdPath,
    uuid: item.uuid,
    articleUrl: `${articleUrlPrefix}/${item.url}`,
    articleTitle: item.title,
    host,
    imageServiceDomains
  }

  return { progressItem, articleInfo }
}
