/**
 * 单篇文档下载 —— 移植自 yuque-dl `src/download/article.ts`
 * 差异：fs → FSA；pull-md-img → 自研 downloadImages；ora → UI 事件；
 *       图片/附件失败不再中断（"失败的以远程链接保存"）。
 */
import { getDocsMdData } from './yuque-api'
import { ARTICLE_CONTENT_MAP, ARTICLE_CONTENT_TYPE } from './constants'
import { fixInlineCode, fixLatex, fixMarkdownImage } from './markdown/fix'
import { parseSheet } from './markdown/sheet'
import { genToc } from './markdown/toc'
import { downloadAttachments } from './attachments'
import { downloadImages } from './download-images'
import { formateDate, getMarkdownImageList, isValidDate } from './util'
import { writeFileAt, splitPath, type DirHandle } from '../platform/fs'
import type { LimitFn } from '../platform/concurrency'
import type {
  ArticleInfo,
  IHandleMdDataOptions,
  IProgressItem,
  IDownloadOptions
} from './types'

export interface DownloadArticleParams {
  articleInfo: ArticleInfo
  options: IDownloadOptions
  progressItem: IProgressItem
  oldProgressItem?: IProgressItem
  bookDir: DirHandle
  imageLimit: LimitFn
  fileLimit: LimitFn
  onStatus?: (message: string) => void
}

export interface DownloadArticleRes {
  needDownload: boolean
  isUpdateDownload: boolean
  isDownloadFinish: boolean
  warnings: string[]
}

export async function downloadArticle(params: DownloadArticleParams): Promise<DownloadArticleRes> {
  const { articleInfo, options, progressItem, oldProgressItem, bookDir, imageLimit, fileLimit } = params
  const { convertMarkdownVideoLinks, hideFooter, ignoreImg, ignoreAttachments } = options
  const { bookId, itemUrl, uuid, articleUrl, articleTitle, host, imageServiceDomains } = articleInfo

  const reqParams = { articleUrl: itemUrl, bookId, host }
  const { httpStatus, apiUrl, response } = await getDocsMdData(reqParams)

  updateProgressItemTime()
  const { needDownload, isUpdateDownload } = checkProgressItemUpdate(progressItem, oldProgressItem)

  if (!needDownload) {
    return { needDownload, isUpdateDownload, isDownloadFinish: true, warnings: [] }
  }

  const contentType = (response?.data?.type?.toLocaleLowerCase() ?? '') as string
  let mdData = ''

  if (contentType === ARTICLE_CONTENT_TYPE.SHEET) {
    const sheetRes = await getDocsMdData(reqParams, false)
    try {
      const rawContent = sheetRes.response?.data?.content
      const content = rawContent ? JSON.parse(rawContent) : {}
      const sheetData = content?.sheet
      mdData = sheetData ? parseSheet(sheetData) : ''
    } catch (e) {
      const notSupportType = ARTICLE_CONTENT_MAP[contentType]
      throw new Error(`download article Error: “${notSupportType}”解析错误 ${e}`)
    }
  } else if ([ARTICLE_CONTENT_TYPE.BOARD, ARTICLE_CONTENT_TYPE.TABLE].includes(contentType as never)) {
    const notSupportType = ARTICLE_CONTENT_MAP[contentType]
    throw new Error(`download article Error: 暂不支持“${notSupportType}”的文档`)
  } else if (typeof response?.data?.sourcecode !== 'string') {
    throw new Error(`download article Error: ${apiUrl}, http status ${httpStatus}`)
  } else {
    mdData = response.data.sourcecode
    mdData = fixLatex(mdData)
  }

  const imgList = getMarkdownImageList(mdData)
  // 取 HTML 版正文，用于修正图片真实地址
  let htmlData = ''
  if (imgList.length && !ignoreImg) {
    const rawData = await getDocsMdData(reqParams, false)
    htmlData = rawData.response?.data?.content ?? ''
    mdData = fixMarkdownImage(imgList, mdData, htmlData)
  }

  const handleOptions: IHandleMdDataOptions = {
    toc: options.toc,
    articleTitle,
    articleUrl,
    articleUpdateTime: formateDate(response?.data?.content_updated_at ?? ''),
    convertMarkdownVideoLinks,
    hideFooter
  }

  const warnings: string[] = []
  const { segments } = splitPath(progressItem.path)

  // 附件
  if (!ignoreAttachments || typeof ignoreAttachments === 'string') {
    try {
      const res = await downloadAttachments({
        mdData,
        bookDir,
        docSegments: segments,
        uuid,
        articleTitle,
        ignoreAttachments,
        limit: fileLimit
      })
      mdData = res.mdData
      res.errorList.forEach((e) => warnings.push(`附件下载失败: ${e.message} ${e.url.slice(0, 60)}`))
    } catch (e) {
      warnings.push(`附件下载失败: ${(e as Error).message || 'unknown error'}`)
    }
  }

  // 图片
  if (imgList.length && !ignoreImg) {
    try {
      const res = await downloadImages({
        mdData,
        bookDir,
        docSegments: segments,
        uuid,
        imageServiceDomains,
        limit: imageLimit
      })
      mdData = res.mdData
      res.errorList.forEach((e) => warnings.push(`图片下载失败(已保留远程链接): ${e.message} ${e.url.slice(0, 60)}`))
    } catch (e) {
      warnings.push(`图片下载失败: ${(e as Error).message || 'unknown error'}`)
    }
  }

  mdData = fixInlineCode(mdData, htmlData)
  const finalMd = handleMdData(mdData, handleOptions)
  await writeFileAt(bookDir, segments, fileNameOf(progressItem.path), finalMd)

  return { needDownload, isUpdateDownload, isDownloadFinish: true, warnings }

  function updateProgressItemTime() {
    progressItem.createAt = response?.data?.created_at || ''
    progressItem.contentUpdatedAt = response?.data?.content_updated_at || ''
    progressItem.publishedAt = response?.data?.published_at || ''
    progressItem.firstPublishedAt = response?.data?.first_published_at || ''
  }
}

function fileNameOf(relPath: string): string {
  const parts = relPath.split('/')
  return parts[parts.length - 1] || 'index.md'
}

/** 组装最终 markdown（标题 + 文内目录 + 正文 + 页脚） */
export function handleMdData(rawMdData: string, options: IHandleMdDataOptions): string {
  const { articleTitle, articleUrl, toc, convertMarkdownVideoLinks, hideFooter } = options
  let mdData = rawMdData

  mdData = mdData.replace(/<a\b[^>]*?>(\s*?)<\/a>/gm, '')
  const header = articleTitle ? `# ${articleTitle}\n\n` : ''
  let tocData = toc ? genToc(mdData) : ''
  if (tocData) tocData = `${tocData}\n\n---\n\n`

  let footer = ''
  if (!hideFooter) {
    footer = '\n\n'
    if (options.articleUpdateTime) footer += `> 更新: ${options.articleUpdateTime}  \n`
    if (articleUrl) footer += `> 原文: <${articleUrl}>`
  }

  mdData = `${header}${tocData}${mdData}${footer}`
  if (convertMarkdownVideoLinks) mdData = handleVideoMd(mdData)
  return mdData
}

/** 将 video 链接转成 html video/audio 标签 */
function handleVideoMd(mdData: string): string {
  return mdData.replace(/\[(.*?)\]\((.*?)\.(mp4|mp3)\)/gm, (_match, alt, url, extType) => {
    const htmlTag = extType === 'mp3' ? 'audio' : 'video'
    return `<${htmlTag} controls width="800" alt="${alt}" src="${url + '.' + extType}"></${htmlTag}>`
  })
}

/** 增量判断：比较内容更新时间 */
export function checkProgressItemUpdate(progressItem: IProgressItem, oldProgressItem?: IProgressItem) {
  const defaultRes = { isFirstDownload: true, isUpdateDownload: false, needDownload: true }
  if (!progressItem.contentUpdatedAt || !oldProgressItem || !oldProgressItem?.contentUpdatedAt) {
    return defaultRes
  }
  const currentUpdateDate = new Date(progressItem.contentUpdatedAt)
  const preUpdateDate = new Date(oldProgressItem.contentUpdatedAt)
  if (!isValidDate(currentUpdateDate) || !isValidDate(preUpdateDate)) return defaultRes

  if (currentUpdateDate.getTime() > preUpdateDate.getTime()) {
    return { needDownload: true, isUpdateDownload: true, isFirstDownload: false }
  } else if (currentUpdateDate.getTime() === preUpdateDate.getTime()) {
    return { needDownload: false, isUpdateDownload: false, isFirstDownload: false }
  }
  return defaultRes
}
