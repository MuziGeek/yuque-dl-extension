/**
 * 鉴权适配层。
 *
 * 主路径：无需做任何事 —— 扩展 fetch 用 credentials:'include' 时，浏览器会自动
 * 携带 `host_permissions` 内域名的 Cookie（含 HttpOnly 的 _yuque_session）。
 *
 * 兜底路径：用户手动填 token 时，用 declarativeNetRequest 会话规则把
 * `cookie` 请求头重写为「当前浏览器已有 Cookie + 手动 token」的组合，
 * 这样既不破坏用户已有 Cookie，也不污染浏览器状态（会话规则随浏览器关闭失效）。
 */
import { DEFAULT_COOKIE_KEY } from '../core/constants'

const RULE_ID = 9001
const RESOURCE_TYPES: `${chrome.declarativeNetRequest.ResourceType}`[] = [
  chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
  chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
  chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
  chrome.declarativeNetRequest.ResourceType.IMAGE,
  chrome.declarativeNetRequest.ResourceType.MEDIA,
  chrome.declarativeNetRequest.ResourceType.OTHER
]

export interface ManualToken {
  key: string
  token: string
}

/** 读取语雀相关 Cookie */
export async function getYuqueCookies(domain = 'yuque.com'): Promise<Record<string, string>> {
  try {
    const list = await chrome.cookies.getAll({ domain })
    const map: Record<string, string> = {}
    for (const c of list) map[c.name] = c.value
    return map
  } catch {
    return {}
  }
}

/** 是否已登录语雀（存在 _yuque_session 或自定义 key） */
export async function isLoggedIn(key = DEFAULT_COOKIE_KEY): Promise<boolean> {
  const cookies = await getYuqueCookies()
  return Boolean(cookies[key])
}

/** 把当前浏览器 Cookie 拼成请求头值 */
async function buildCookieHeader(extra?: ManualToken): Promise<string> {
  const cookies = await getYuqueCookies()
  if (extra?.key && extra.token) cookies[extra.key] = extra.token
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

/**
 * 应用手动 token（重建 DNR 会话规则）。
 * @param manual   手动 token 配置；不传则清除
 * @param domains  额外需要覆盖的域名（企业版自定义域），如 ['https://foo.example.com']
 */
export async function applyManualToken(manual?: ManualToken, domains: string[] = []): Promise<void> {
  await clearManualToken()

  if (!manual?.token) return

  const cookieValue = await buildCookieHeader(manual)

  const condition: chrome.declarativeNetRequest.RuleCondition = {
    resourceTypes: RESOURCE_TYPES,
    requestDomains: ['yuque.com', ...domains.map(toHost).filter(Boolean)]
  }

  const rule: chrome.declarativeNetRequest.Rule = {
    id: RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'cookie', operation: 'set', value: cookieValue }]
    },
    condition
  }

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [RULE_ID],
    addRules: [rule]
  })
}

export async function clearManualToken(): Promise<void> {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID] })
  } catch {
    /* ignore */
  }
}

function toHost(origin: string): string {
  try {
    return new URL(origin).hostname
  } catch {
    return origin.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
}

/** 为一个或多个域名申请可选权限（需在用户手势中调用） */
export async function ensureHostPermissions(origins: string[]): Promise<boolean> {
  if (origins.length === 0) return true
  const has = await chrome.permissions.contains({ origins })
  if (has) return true
  return chrome.permissions.request({ origins })
}
