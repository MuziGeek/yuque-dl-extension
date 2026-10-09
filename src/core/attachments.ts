/**
 * 附件下载 —— 移植自 yuque-dl `src/download/attachments.ts`（fs → FSA + fetch）
 */
import { createWriterAt, type DirHandle } from '../platform/fs'
import { fetchToWriter } from '../platform/http'
import type { LimitFn } from '../platform/concurrency'

const mdUrlReg = /\[(.*?)\]\((.*?)\)/g
export const AttachmentsReg = /\[(.*?)\]\((.*?\.yuque\.com\/attachments.*?)\)/

export interface DownloadAttachmentsParams {
  mdData: string
  bookDir: DirHandle
  /** 文档所在目录（相对知识库根的路径段） */
  docSegments: string[]
  uuid: string
  articleTitle: string
  ignoreAttachments?: boolean | string
  limit: LimitFn
}

export interface IAttachmentsItem {
  fileName: string
  url: string
  rawMd: string
}

export async function downloadAttachments(
  params: DownloadAttachmentsParams
): Promise<{ mdData: string; errorList: Array<{ url: string; message: string }> }> {
  const { mdData, bookDir, docSegments, uuid, ignoreAttachments, limit } = params
  const errorList: Array<{ url: string; message: string }> = []

  const attachmentsList = (mdData.match(mdUrlReg) || []).filter((item) => AttachmentsReg.test(item))
  if (attachmentsList.length === 0) return { mdData, errorList }

  let attachmentsDataList = attachmentsList
    .map((item) => parseAttachments(item))
    .filter((item): item is IAttachmentsItem => item !== false)

  if (typeof ignoreAttachments === 'string') {
    const ignoreExtList = ignoreAttachments.split(',').map((s) => s.trim()).filter(Boolean)
    attachmentsDataList = attachmentsDataList.filter((item) => {
      const extIndex = item.url.lastIndexOf('.')
      if (extIndex === -1) return true
      const currentExt = item.url.slice(extIndex + 1)
      return !ignoreExtList.find((ext) => ext === currentExt)
    })
  }

  if (attachmentsDataList.length === 0) return { mdData, errorList }

  const attachDirSegments = [...docSegments, 'attachments', uuid]
  const relativeDir = `./attachments/${uuid}`

  const results = await Promise.all(
    attachmentsDataList.map((item) =>
      limit(async () => {
        try {
          const writable = await createWriterAt(bookDir, attachDirSegments, item.fileName)
          try {
            await fetchToWriter(item.url, writable, item.fileName)
          } finally {
            await writable.close()
          }
          return { item, ok: true as const }
        } catch (e) {
          errorList.push({ url: item.url, message: (e as Error).message || 'unknown error' })
          return { item, ok: false as const }
        }
      })
    )
  )

  let resMdData = mdData
  for (const r of results) {
    if (!r.ok) continue
    const replaceData = `[附件: ${r.item.fileName}](${relativeDir}/${r.item.fileName})`
    resMdData = resMdData.split(r.item.rawMd).join(replaceData)
  }

  return { mdData: resMdData, errorList }
}

function parseAttachments(mdText: string): IAttachmentsItem | false {
  const [, rawFileName, url] = AttachmentsReg.exec(mdText) || []
  if (!url) return false
  const fileName = sanitize(rawFileName || url.split('/').at(-1) || '')
  if (!fileName) return false
  return { fileName, url, rawMd: mdText }
}

function sanitize(name: string): string {
  return decodeURIComponent(name).replace(/[\\/:*?"<>|\n\r]/g, '_').replace(/\s+/g, '_')
}
