/** 单篇文档下载 —— 移植自 yuque-dl `src/index.ts: downloadDocsFromUrls`（单篇路径） */
import { getDocInfoFromUrl } from './yuque-api'
import { fixPath } from './markdown/fix'
import { downloadArticle } from './download-article'
import { ensureDir, type DirHandle } from '../platform/fs'
import { createLimiter } from '../platform/concurrency'
import type { EventBus } from '../ui/events'
import type { DownloadStats, IDownloadOptions, IProgressItem, Toc } from './types'

export interface DownloadDocParams {
  url: string
  root: DirHandle
  options: IDownloadOptions
  bus: EventBus
}

export async function downloadDocument(params: DownloadDocParams): Promise<DownloadStats> {
  const { url, root, options, bus } = params
  bus.emit('status', '正在解析文档…')
  const info = await getDocInfoFromUrl(url)
  const { docId, docSlug, docTitle, bookId, bookSlug, bookName, host, imageServiceDomains = [] } = info

  if (!docId || !bookId || !docSlug) {
    throw new Error('无法从该链接解析文档信息（可能需要登录，或链接并非文档页）')
  }

  const bookDirName = fixPath(bookName || '') || String(bookId)
  const bookDir = await ensureDir(root, [bookDirName])

  const fileName = fixPath(docTitle || docSlug)
  const mdPath = `${fileName}.md`

  const toc: Toc = {
    type: 'DOC',
    title: docTitle || docSlug,
    uuid: String(docId),
    url: docSlug,
    prev_uuid: '',
    sibling_uuid: '',
    child_uuid: '',
    parent_uuid: '',
    doc_id: docId,
    level: 0,
    id: docId,
    open_window: 0,
    visible: 1
  }

  const progressItem: IProgressItem = {
    path: mdPath,
    pathTitleList: [fileName],
    pathIdList: [String(docId)],
    toc
  }

  const articleUrl = bookSlug ? `${host}/${bookSlug}/${docSlug}` : url
  const stats: DownloadStats = { total: 1, success: 0, failed: 0, skipped: 0, updated: 0 }
  const fileLimit = createLimiter(options.concurrency?.files ?? 5)

  bus.emit('progress', { total: 1, done: 0, failed: 0, currentTitle: toc.title })
  bus.emit('article', { path: mdPath, state: 'start' })

  try {
    const res = await downloadArticle({
      articleInfo: {
        bookId,
        itemUrl: docSlug,
        savePath: '',
        saveFilePath: mdPath,
        uuid: String(docId),
        articleUrl,
        articleTitle: docTitle || docSlug,
        host,
        imageServiceDomains
      },
      options,
      progressItem,
      bookDir,
      imageLimit: fileLimit,
      fileLimit
    })
    stats.success = 1
    res.warnings.forEach((w) =>
      bus.emit('log', { level: 'warn', message: `${mdPath}: ${w}`, time: Date.now() })
    )
    bus.emit('article', { path: mdPath, state: 'success' })
  } catch (e) {
    stats.failed = 1
    bus.emit('article', { path: mdPath, state: 'failed', message: (e as Error).message || 'unknown error' })
  }

  bus.emit('progress', { total: 1, done: stats.success, failed: stats.failed, currentTitle: toc.title })
  bus.emit('done', stats)
  return stats
}
