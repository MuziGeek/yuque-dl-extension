/**
 * 语雀接口层 —— 移植自 yuque-dl `src/api.ts`，网络层换成平台的 fetch。
 *
 * 与原项目的差异：
 *  - 删除 getHeaders / genCommonOptions / beforeRedirect：
 *    浏览器扩展用 credentials:'include' 自动带 Cookie 并自动跟随重定向；
 *  - 删除 rand-user-agent（浏览器自带 UA）；
 *  - verifyPublicPassword 依赖 node:crypto 的 RSA_PKCS1v15，浏览器端能力受限，
 *    暂不在此实现（降级方案见 README：先在浏览器输入密码，插件复用其 Cookie）。
 */
import { fetchText, fetchJson } from '../platform/http'
import { DEFAULT_DOMAIN } from './constants'
import type {
  ArticleRootObject,
  IKnowledgeBaseInfo,
  IDocInfo,
  Toc,
  YuqueAppData
} from './types'
import { VERIFIED_COOKIE_KEY_MAP } from './constants'

function normalizeRequestError(e: unknown): Error {
  const errMsg = (e as Error)?.message ?? ''
  if (!errMsg) return new Error('unknown error')
  return new Error(errMsg)
}

/** 从语雀页面 SSR HTML 中解析内嵌的 appData JSON */
export function parseAppData(html: string): YuqueAppData | undefined {
  const appDataReg = /decodeURIComponent\("(.+)"\)\);/m
  const data = appDataReg.exec(html) ?? ''
  if (!data[1]) return undefined
  try {
    return JSON.parse(decodeURIComponent(data[1])) as YuqueAppData
  } catch {
    return undefined
  }
}

/** 知识库信息 + TOC */
export async function getKnowledgeBaseInfo(url: string): Promise<IKnowledgeBaseInfo> {
  try {
    const { html } = await fetchText(url)
    const jsonData = parseAppData(html)
    if (!jsonData?.book) return {}
    return {
      bookId: jsonData.book.id,
      bookSlug: jsonData.book.slug,
      tocList: jsonData.book.toc || [],
      bookName: jsonData.book.name || '',
      bookDesc: jsonData.book.description || '',
      host: jsonData.space?.host || DEFAULT_DOMAIN,
      imageServiceDomains: jsonData.imageServiceDomains || []
    }
  } catch (e) {
    throw normalizeRequestError(e)
  }
}

/** 单文档信息 */
export async function getDocInfoFromUrl(url: string): Promise<IDocInfo> {
  try {
    const { html } = await fetchText(url)
    const jsonData = parseAppData(html)
    if (!jsonData?.doc) return {}
    return {
      docId: jsonData.doc.id,
      docSlug: jsonData.doc.slug,
      docTitle: jsonData.doc.title || '',
      bookId: jsonData.doc.book_id,
      bookSlug: jsonData.book?.slug || '',
      bookName: jsonData.book?.name || '',
      host: jsonData.space?.host || DEFAULT_DOMAIN,
      imageServiceDomains: jsonData.imageServiceDomains || []
    }
  } catch (e) {
    throw normalizeRequestError(e)
  }
}

export interface GetMdDataParams {
  articleUrl: string
  bookId: number
  host?: string
}

export interface IGetDocsMdDataRes {
  apiUrl: string
  httpStatus: number
  response?: ArticleRootObject
}

/** 获取文档正文（isMd=true 时语雀服务端直接返回 markdown） */
export async function getDocsMdData(
  params: GetMdDataParams,
  isMd = true
): Promise<IGetDocsMdDataRes> {
  const { articleUrl, bookId, host = DEFAULT_DOMAIN } = params
  let apiUrl = `${host}/api/docs/${articleUrl}`
  const queryParams: Record<string, string> = {
    book_id: String(bookId),
    merge_dynamic_data: String(false)
  }
  if (isMd) queryParams.mode = 'markdown'
  const query = new URLSearchParams(queryParams).toString()
  apiUrl = `${apiUrl}?${query}`
  const { data, httpStatus } = await fetchJson<ArticleRootObject>(apiUrl)
  return { apiUrl, httpStatus, response: data }
}

export interface UserBookItem {
  type: 'Book' | 'Resource'
  id: number
  slug: string
  name: string
  items_count: number
  public: number
  user: { login: string }
}

/** 获取当前账号的所有知识库（需登录） */
export async function getUserBooks(): Promise<UserBookItem[]> {
  const books: UserBookItem[] = []
  let offset = 0
  const limit = 50
  for (;;) {
    const url = `${DEFAULT_DOMAIN}/api/mine/books?limit=${limit}&offset=${offset}`
    const { data } = await fetchJson<{ data: UserBookItem[] }>(url)
    const items = data?.data || []
    books.push(...items)
    if (items.length < limit) break
    offset += limit
  }
  return books
}

/** 页面是否提示需要验证密码 */
export function getVerifyCondition(html: string): YuqueAppData['matchCondition'] {
  return parseAppData(html)?.matchCondition
}

export { VERIFIED_COOKIE_KEY_MAP }

// ---------------- URL 识别 ----------------

const RESERVED_SEGMENTS = new Set([
  'dashboard',
  'search',
  'login',
  'signup',
  'signin',
  'settings',
  'account',
  'notifications',
  'explore',
  'api',
  'mobile',
  'attachments',
  'help',
  'about',
  'pricing',
  'download',
  'oauth',
  'new',
  'star',
  'follow',
  'index'
])

export interface TargetInfo {
  kind: 'book' | 'doc' | 'unknown'
  login?: string
  bookSlug?: string
  docSlug?: string
  normalizedUrl?: string
}

/**
 * 根据 URL 结构初步判断是知识库还是文档（最终以抓取页面 appData 为准）。
 *   /{login}/{book}            -> book
 *   /{login}/{book}/{docSlug}  -> doc
 */
export function detectTargetKind(url: string): TargetInfo {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { kind: 'unknown' }
  }
  if (!/^https?:$/.test(parsed.protocol)) return { kind: 'unknown' }

  const segments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })

  if (segments.length < 2) return { kind: 'unknown' }
  if (RESERVED_SEGMENTS.has(segments[0].toLowerCase())) return { kind: 'unknown' }

  const login = segments[0]
  const bookSlug = segments[1]
  const origin = parsed.origin
  if (segments.length === 2 || segments.length === 3) {
    // 语雀文档 URL 也可能带查询/锚点，两段即知识库首页
    if (segments.length === 2) {
      return { kind: 'book', login, bookSlug, normalizedUrl: `${origin}/${login}/${bookSlug}` }
    }
    return {
      kind: 'doc',
      login,
      bookSlug,
      docSlug: segments[2],
      normalizedUrl: `${origin}/${login}/${bookSlug}/${segments[2]}`
    }
  }
  // 更深的路径按知识库处理（取其前两段）
  return { kind: 'book', login, bookSlug, normalizedUrl: `${origin}/${login}/${bookSlug}` }
}

/** 计算知识库内文档 URL 前缀（用于生成原文链接） */
export function buildArticleUrlPrefix(url: string, bookSlug: string): string {
  return url.replace(new RegExp(`(.*?/${bookSlug}).*`), '$1')
}

/** toc 数组 → uuid 索引 */
export function indexToc(tocList: Toc[]): Map<string, Toc> {
  const map = new Map<string, Toc>()
  for (const toc of tocList) map.set(toc.uuid, toc)
  return map
}
