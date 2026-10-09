/** markdown 修正 —— 移植自 yuque-dl `src/parse/fix.ts` */
import { removeEmojis } from '../util'
import { getAst, getInLineCodeList, toMd } from './ast'

// latex：非 svg 的 latex 图直接替换为 code 文案
export function fixLatex(mdData: string): string {
  const latexReg = /!\[(.*?)\]\((http.*?latex.*?)\)/gm
  const list = mdData.match(latexReg)
  let fixMaData = mdData
  const rawMaData = mdData
  try {
    list?.forEach((latexMd) => {
      latexReg.lastIndex = 0
      const url = latexReg.exec(latexMd)?.[2] ?? ''
      const { pathname, search } = new URL(url)
      const isSvg = pathname.endsWith('.svg')
      if (!isSvg && search) {
        const data = decodeURIComponent(search)
        fixMaData = fixMaData.replace(latexMd, data.slice(1))
      }
    })
  } catch {
    return rawMaData
  }
  return fixMaData
}

/** 根据 html 接口返回的图片修复 md 接口返回的图片 url */
export function fixMarkdownImage(imgList: string[], mdData: string, htmlData: string): string {
  if (!htmlData) return mdData
  const htmlDataImgReg = /<card.*?name="image".*?value="data:(.*?)">(.*?)<\/card>/gm
  const htmlImgDataList: string[] = []
  let regExec: RegExpExecArray | null = null
  let init = true
  while (init || Boolean(regExec)) {
    init = false
    regExec = htmlDataImgReg.exec(htmlData)
    if (regExec?.[1]) {
      try {
        const strData = decodeURIComponent(regExec[1])
        const cardData = JSON.parse(strData)
        htmlImgDataList.push(cardData?.src || '')
      } catch {
        htmlImgDataList.push('')
      }
    }
  }
  const replaceURLCountMap = new Map<string, number>()
  imgList.forEach((imgUrl) => {
    let origin = ''
    let pathname = ''
    try {
      ;({ origin, pathname } = new URL(imgUrl))
    } catch {
      return
    }
    const matchURL = `${origin}${pathname}`

    const targetURL = htmlImgDataList.find((item, index) => {
      const reg = new RegExp(`${escapeRegExp(matchURL)}.*?`)
      const isFind = reg.test(item)
      if (isFind) htmlImgDataList.splice(index, 1)
      return isFind
    })
    if (targetURL) {
      const reg = new RegExp(escapeRegExp(imgUrl), 'g')
      const count = replaceURLCountMap.get(imgUrl) || 0
      let temp = 0
      mdData = mdData.replace(reg, (match) => {
        let res = match
        if (temp === count) res = targetURL
        temp = temp + 1
        return res
      })
      replaceURLCountMap.set(imgUrl, count + 1)
    }
  })
  return mdData
}

/** 路径/文件名安全化（去 emoji、替换非法字符） */
export function fixPath(dirPath: string): string {
  if (!dirPath) return ''
  const dirNameReg = /[\\/:*?"<>|\n\r]/g
  return removeEmojis(
    dirPath.replace(dirNameReg, '_').replace(/\s/g, '').replace(/\(/g, '（').replace(/\)/g, '）')
  )
}

function containsHtmlTags(str: string) {
  return /<([a-z][\s\S]*?)>/i.test(str)
}

function containsMarkdownLabel(str: string) {
  return /(~~|\*\*|_)/g.test(str)
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 修复 markdown 行内代码 */
export function fixInlineCode(mdData: string, htmlData: string): string {
  let fixMdData = mdData
  const ast = getAst(mdData)
  const inlineCodeList = getInLineCodeList(ast)
  if (inlineCodeList.length === 0) return mdData

  inlineCodeList.forEach((item) => {
    const inlineCodeNode = item.node
    const isContainsHtmlTags = containsHtmlTags(inlineCodeNode.value)
    const isContainsMarkdownLabel = containsMarkdownLabel(inlineCodeNode.value)

    if (!isContainsHtmlTags && !isContainsMarkdownLabel) return

    const tarnsfromCode = inlineCodeNode.value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    if (htmlData.includes(tarnsfromCode)) return

    ;(inlineCodeNode as unknown as { type: string }).type = 'html'
    inlineCodeNode.value = `<code>${inlineCodeNode.value}</code>`
  })
  fixMdData = toMd(ast)
  return fixMdData
}
