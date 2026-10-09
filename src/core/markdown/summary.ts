/** 生成知识库目录 index.md —— 移植自 yuque-dl `src/parse/Summary.ts`（fs → FSA） */
import { ARTICLE_TOC_TYPE } from '../constants'
import { writeFileAt, type DirHandle } from '../../platform/fs'
import type { IProgressItem, SummaryItem } from '../types'

export interface SummaryOptions {
  /** 知识库根目录句柄 */
  bookDir: DirHandle
  bookName?: string
  bookDesc?: string
  uuidMap: Map<string, IProgressItem>
}

export class Summary {
  private summaryInfo: SummaryOptions
  constructor(summaryInfo: SummaryOptions) {
    this.summaryInfo = summaryInfo
  }

  async genFile(): Promise<string> {
    const { bookName, bookDesc, bookDir, uuidMap } = this.summaryInfo
    let header = `# ${bookName}\n\n`
    if (bookDesc) header += `> ${bookDesc}\n\n`
    let mdContent = header
    const summary: SummaryItem[] = []
    uuidMap.forEach((progressItem) => {
      const toc = progressItem.toc
      const parentId = toc['parent_uuid']
      const findRes = this.findTree(summary, parentId)
      const dirNameReg = /[\\/:*?"<>|\n\r]/g
      const tocText = toc.title
        .replace(dirNameReg, '_')
        .replace(/\s/, '')
        .replace(/\(/g, '（')
        .replace(/\)/g, '）')
      const item: SummaryItem = {
        text: tocText,
        id: toc.uuid,
        level: 1,
        type: 'link'
      }
      const tocType = toc.type.toLocaleLowerCase()
      if (tocType === ARTICLE_TOC_TYPE.TITLE || toc['child_uuid'] !== '') {
        item.type = 'title'
        if (typeof findRes !== 'boolean') {
          if (!Array.isArray(findRes.children)) findRes.children = []
          item.level = findRes.level + 1
          findRes.children.push(item)
        } else {
          item.level = 1
          summary.push(item)
        }
        if (tocType === ARTICLE_TOC_TYPE.DOC) {
          item.link = progressItem.path
        }
      } else {
        item.type = 'link'
        item.link = tocType === ARTICLE_TOC_TYPE.LINK ? progressItem.toc.url : progressItem.path
        if (typeof findRes !== 'boolean') {
          if (!Array.isArray(findRes.children)) findRes.children = []
          item.level = findRes.level + 1
          findRes.children.push(item)
        } else {
          item.level = 1
          summary.push(item)
        }
      }
    })
    mdContent += this.genSummaryContent(summary, '')
    try {
      await writeFileAt(bookDir, [], 'index.md', mdContent)
    } catch {
      /* 忽略写目录失败 */
    }
    return mdContent
  }

  genSummaryContent(summary: SummaryItem[], summaryContent: string): string {
    for (const item of summary) {
      if (item.type === ARTICLE_TOC_TYPE.TITLE) {
        if (item.link) {
          const link = this.formatLink(item.link)
          summaryContent += `\n${''.padStart(item.level + 1, '#')} [${item.text}](${link})\n\n`
        } else {
          summaryContent += `\n${''.padStart(item.level + 1, '#')} ${item.text}\n\n`
        }
      } else if (item.type === ARTICLE_TOC_TYPE.LINK) {
        const link = this.formatLink(item.link)
        summaryContent += `${item.level === 1 ? '\n##' : '-'} [${item.text}](${link})\n`
      }
      if (Array.isArray(item.children)) {
        summaryContent += this.genSummaryContent(item.children, '')
      }
    }
    return summaryContent
  }

  formatLink(rawLink?: string): string {
    if (!rawLink) return ''
    return rawLink.replace(/\s/g, '%20').replace(/\(/g, '（').replace(/\)/g, '）')
  }

  findIdItem(node: SummaryItem, id: string): SummaryItem | false {
    if (node.id === id) return node
    if (node.children) {
      const findRes = this.findTree(node.children, id)
      if (findRes) return findRes
    }
    return false
  }

  findTree(tree: SummaryItem[], id: string): SummaryItem | false {
    if (!id) return false
    for (const item of tree) {
      const findRes = this.findIdItem(item, id)
      if (findRes) return findRes
    }
    return false
  }
}
