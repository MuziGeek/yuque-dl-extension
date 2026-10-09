/**
 * 图片下载 —— 替代 yuque-dl 使用的 `pull-md-img`（原库依赖 node:fs）。
 *
 * 行为对齐原项目：
 *  - 每篇文档一个目录 `{文档目录}/img/{uuid}/`
 *  - 外链图片先转成语雀代理地址（带签名）再下载
 *  - md 内图片链接改写为相对路径
 *  - 失败的图片保留远程链接（不中断整体下载）
 */
import { captureImageURL } from './image'
import { getMarkdownImageList, pickFileName, replaceAllLiteral, escapeRegExp } from './util'
import { writeFileAt, type DirHandle } from '../platform/fs'
import { fetchArrayBuffer } from '../platform/http'
import type { LimitFn } from '../platform/concurrency'

export interface DownloadImagesParams {
  mdData: string
  /** 知识库根目录 */
  bookDir: DirHandle
  /** 文档所在目录（相对知识库根的路径段） */
  docSegments: string[]
  uuid: string
  imageServiceDomains: string[]
  limit: LimitFn
}

export interface DownloadImagesResult {
  mdData: string
  errorList: Array<{ url: string; message: string }>
}

/** 去除语雀图床的水印参数 */
const WATERMARK_PARAM = 'x-oss-process=image%2Fwatermark%2C'

export async function downloadImages(params: DownloadImagesParams): Promise<DownloadImagesResult> {
  const { bookDir, docSegments, uuid, imageServiceDomains, limit } = params
  let mdData = params.mdData
  const errorList: Array<{ url: string; message: string }> = []

  const imgList = Array.from(new Set(getMarkdownImageList(mdData)))
  if (imgList.length === 0) return { mdData, errorList }

  const imgDirSegments = [...docSegments, 'img', uuid]
  const usedNames = new Set<string>()

  await Promise.all(
    imgList.map((rawUrl) =>
      limit(async () => {
        const cleanedUrl = rawUrl.replace(WATERMARK_PARAM, '')
        let proxied = cleanedUrl
        try {
          proxied = await captureImageURL(cleanedUrl, imageServiceDomains)
          const buf = await fetchArrayBuffer(proxied)
          let fileName = pickFileName(proxied, 'image')
          fileName = sanitizeFileName(fileName)
          fileName = dedupeName(fileName, usedNames)
          await writeFileAt(bookDir, imgDirSegments, fileName, buf)
          const relative = `./img/${uuid}/${fileName}`
          mdData = replaceImageLinks(mdData, rawUrl, relative)
          if (cleanedUrl !== rawUrl) mdData = replaceImageLinks(mdData, cleanedUrl, relative)
        } catch (e) {
          errorList.push({ url: rawUrl, message: (e as Error).message || 'unknown error' })
        }
      })
    )
  )

  return { mdData, errorList }
}

/** 同时替换 `](url)` 与裸 url 两种出现形式 */
function replaceImageLinks(md: string, url: string, relative: string): string {
  // 1) markdown 图片语法 ![](...)
  const escaped = escapeRegExp(url)
  const imgSyntax = new RegExp(`(!\\[[^\\]]*\\]\\()${escaped}(\\))`, 'g')
  md = md.replace(imgSyntax, (_m, p1, p2) => `${p1}${relative}${p2}`)
  // 2) 兜底：裸 url 字面替换
  md = replaceAllLiteral(md, url, relative)
  return md
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r]/g, '_').replace(/\s+/g, '_')
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'image'
  return cleaned.length > 120 ? cleaned.slice(-120) : cleaned
}

function dedupeName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let i = 1
  let candidate = `${base}_${i}${ext}`
  while (used.has(candidate)) {
    i += 1
    candidate = `${base}_${i}${ext}`
  }
  used.add(candidate)
  return candidate
}
