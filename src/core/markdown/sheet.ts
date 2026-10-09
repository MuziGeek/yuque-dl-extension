/** 表格类型解析 —— 移植自 yuque-dl `src/parse/sheet.ts` */
import pako from 'pako'
import type { SheetItem, SheetItemData } from '../types'

export const parseSheet = (sheetStr: string): string => {
  if (!sheetStr) return ''
  const raw = new Uint8Array(Array.from(sheetStr).map((c) => c.charCodeAt(0)))
  const parseStr = pako.inflate(raw, { to: 'string' })
  const sheetList = JSON.parse(parseStr) as SheetItem[]
  let mdData = ''
  sheetList.forEach((item) => {
    const sheetTitle = `## ${item.name}\n`
    const table = genMarkdownTable(item.data)
    mdData = `${mdData}\n${sheetTitle}\n${table}`
  })
  return mdData
}

export function genMarkdownTable(data: SheetItemData): string {
  let rowList: string[] = Object.keys(data)
  rowList = rowList.filter((rowKey) => {
    const colList = Object.keys(data[rowKey])
    return colList.some((col) => (data?.[rowKey]?.[col] as { v?: unknown })?.v)
  })
  let colList: string[] = []
  rowList.forEach((rowKey) => {
    const cols = data[rowKey]
    if (cols) colList = colList.concat(Object.keys(cols))
  })

  const rowMax = Math.max(...rowList.map((row) => Number(row)))
  const colMax = Math.max(...colList.map((col) => Number(col)))
  if (rowMax < 0 || colMax < 0) return ''
  let tableMd = ''
  const TITLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let rowTitle = Array(colMax + 1)
    .fill(' ')
    .map((_v, i) => {
      const index = i % TITLE.length
      return TITLE[index]
    })
    .join(' | ')
  rowTitle = `| |${rowTitle}|`
  let rowTitleLine = Array(colMax + 2).fill('---').join(' |')
  rowTitleLine = `|${rowTitleLine}|`
  tableMd = `${rowTitle}\n${rowTitleLine}\n`

  for (let row = 0; row < rowMax + 1; row++) {
    const colData: Array<string | null> = []
    for (let col = 0; col < colMax + 1; col++) {
      const v = data?.[row]?.[col]?.v as
        | string
        | { class?: string; src?: string; name?: string; value?: unknown; text?: string; url?: string }
        | null
        | undefined
      if (v && typeof v === 'string') {
        colData.push(v)
      } else if (v && typeof v === 'object') {
        if (v.class === 'image' && v.src) {
          colData.push(`![${v.name}'](${v.src})`)
        } else if (v.class === 'checkbox') {
          colData.push(v.value ? '[x] ' : '[ ] ')
        } else if (v.class === 'link') {
          colData.push(`[${v.text}](${v.url})`)
        } else if (v.class === 'select') {
          colData.push((v.value as string[])?.join(','))
        } else {
          colData.push(null)
        }
      } else {
        colData.push(null)
      }
    }
    const rowMd = `| ${row + 1} | ${colData.join(' | ')}|`
    tableMd = `${tableMd}${rowMd}\n`
  }
  return tableMd
}
