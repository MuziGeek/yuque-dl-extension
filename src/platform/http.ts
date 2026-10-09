/**
 * HTTP 适配层 —— 替代原项目的 axios。
 *
 * 关键点：
 * - 扩展页面/Service Worker 对 `host_permissions` 内的域发起请求可绕过 CORS；
 * - 使用 credentials:'include' 让浏览器自动携带语雀登录 Cookie（含 HttpOnly），
 *   这比原项目手工拼 `Cookie` 请求头更省事，也天然解决了跨子域重定向丢 Cookie 的问题；
 * - `Cookie` 是 fetch 的 forbidden header，绝不能手动设置。
 */

export interface FetchTextResult {
  html: string
  status: number
  finalUrl: string
}

export interface FetchJsonResult<T> {
  apiUrl: string
  httpStatus: number
  data: T
}

export class HttpError extends Error {
  status: number
  url: string
  constructor(message: string, status: number, url: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.url = url
  }
}

const DEFAULT_TIMEOUT = 60_000
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const MAX_RETRY = 3

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

async function request(url: string, init: RequestInit = {}, timeout = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, {
      ...init,
      credentials: 'include',
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store'
    })
  } finally {
    clearTimeout(timer)
  }
}

/** 带指数退避的请求 */
async function requestWithRetry(
  url: string,
  init: RequestInit = {},
  { timeout = DEFAULT_TIMEOUT, retry = MAX_RETRY }: { timeout?: number; retry?: number } = {}
): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      const res = await request(url, init, timeout)
      if (!RETRY_STATUS.has(res.status) || attempt === retry) return res
      lastErr = new HttpError(`HTTP ${res.status}`, res.status, url)
    } catch (e) {
      lastErr = e
      if (attempt === retry) break
    }
    await sleep(500 * Math.pow(2, attempt))
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** 请求并返回文本（用于抓取语雀页面的内嵌 JSON） */
export async function fetchText(url: string, init: RequestInit = {}): Promise<FetchTextResult> {
  const res = await requestWithRetry(url, init)
  const html = res.status === 200 ? await res.text() : ''
  return { html, status: res.status, finalUrl: res.url }
}

/** 请求并返回 JSON */
export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<FetchJsonResult<T>> {
  const res = await requestWithRetry(url, init)
  const data = (res.status === 200 ? await res.json() : undefined) as T
  return { apiUrl: url, httpStatus: res.status, data }
}

/** 请求并返回 ArrayBuffer（用于图片） */
export async function fetchArrayBuffer(url: string, timeout = 3 * 60 * 1000): Promise<ArrayBuffer> {
  const res = await requestWithRetry(url, {}, { timeout, retry: 2 })
  if (res.status !== 200) throw new HttpError(`response status ${res.status}`, res.status, url)
  return res.arrayBuffer()
}

/**
 * 流式下载到 FileSystemWritableFileStream（替代原 download/common.ts）。
 * 返回最终 URL 以判断是否被重定向到登录页。
 */
export async function fetchToWriter(
  url: string,
  writable: FileSystemWritableFileStream,
  fileName = '',
  timeout = 3 * 60 * 1000
): Promise<{ fileUrl: string; finalUrl: string }> {
  const res = await requestWithRetry(url, {}, { timeout, retry: 2 })
  const finalUrl = res.url || ''
  if (finalUrl.includes('/login')) {
    throw new HttpError(`"${fileName}" need token`, res.status, url)
  }
  if (res.status !== 200) {
    throw new HttpError(`response status ${res.status}`, res.status, url)
  }
  if (!res.body) {
    // 无 body 时退回一次性写入
    await writable.write(await res.arrayBuffer())
  } else {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) await writable.write(value)
    }
  }
  return { fileUrl: url, finalUrl }
}

/** 判断当前响应是否为登录页（用于探测登录态） */
export async function checkLoggedIn(url: string): Promise<{ loggedIn: boolean; status: number }> {
  try {
    const res = await request(url, { method: 'GET' })
    const text = await res.text()
    // 语雀未登录访问私有页面会跳到登录页
    const isLogin = /\/login|请先登录|登录语雀/.test(res.url + text.slice(0, 4000))
    return { loggedIn: res.status === 200 && !isLogin, status: res.status }
  } catch {
    return { loggedIn: false, status: 0 }
  }
}
