/** 纯工具函数 —— 移植自 yuque-dl `src/utils/index.ts` 的纯函数部分 */

/** 获取 md 中的 img url */
export function getMarkdownImageList(mdStr: string): string[] {
  if (!mdStr) return []
  const mdImgReg = /!\[(.*?)\]\((.*?)\)/gm
  let list = Array.from(mdStr.match(mdImgReg) || [])
  list = list
    .map((itemUrl) => {
      itemUrl = itemUrl.replace(mdImgReg, '$2')
      // 如果出现非 http 开头的图片 如 "./xx.png" 则跳过
      if (!/^http.*/g.test(itemUrl)) return ''
      return itemUrl
    })
    .filter((url) => Boolean(url))
  return list
}

export function removeEmojis(dirName: string) {
  return dirName.replace(/[\ud800-\udbff][\udc00-\udfff]/g, '')
}

export function isValidUrl(url: string): boolean {
  if (typeof URL.canParse === 'function') {
    return URL.canParse(url)
  }
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function pad(num: number) {
  return num.toString().padStart(2, '0')
}

export function formateDate(d: string) {
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`
}

export function isValidDate(date: Date) {
  return date instanceof Date && !isNaN(date.getTime())
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** 转义正则元字符 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 字面量替换全部（避免 String.replace 的 $ 语义） */
export function replaceAllLiteral(source: string, find: string, replacement: string): string {
  if (!find) return source
  return source.split(find).join(replacement)
}

/** 从 URL 中提取一个安全的文件名（含扩展名） */
export function pickFileName(url: string, fallback = 'file'): string {
  try {
    const { pathname } = new URL(url)
    const base = pathname.split('/').filter(Boolean).pop() || ''
    const decoded = decodeURIComponent(base)
    if (!decoded) return fallback
    return decoded
  } catch {
    return fallback
  }
}

/** 判断是否 https?://*.yuque.com 域名 */
export function isYuqueUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url)
    return /^https?:$/.test(protocol) && (hostname === 'yuque.com' || hostname.endsWith('.yuque.com'))
  } catch {
    return false
  }
}
