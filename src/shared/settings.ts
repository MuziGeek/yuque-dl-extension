/** 插件设置（chrome.storage.local） */
import { DEFAULT_COOKIE_KEY } from '../core/constants'

export interface Settings {
  /** 语雀 cookie key（企业版可能不同） */
  cookieKey: string
  /** 是否启用手动 token */
  manualTokenEnabled: boolean
  /** 手动填入的 token（对应 cookieKey 的值） */
  manualToken: string
  /** 企业自定义域名（origin，如 https://yuque.example.com） */
  customDomains: string[]
  ignoreImg: boolean
  ignoreAttachments: boolean
  /** 忽略的附件后缀，逗号分隔，如 "mp4,pdf" */
  ignoreAttachmentExts: string
  toc: boolean
  hideFooter: boolean
  convertMarkdownVideoLinks: boolean
  incremental: boolean
  docsConcurrency: number
  filesConcurrency: number
}

export const DEFAULT_SETTINGS: Settings = {
  cookieKey: DEFAULT_COOKIE_KEY,
  manualTokenEnabled: false,
  manualToken: '',
  customDomains: [],
  ignoreImg: false,
  ignoreAttachments: false,
  ignoreAttachmentExts: '',
  toc: false,
  hideFooter: false,
  convertMarkdownVideoLinks: false,
  incremental: false,
  docsConcurrency: 3,
  filesConcurrency: 5
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings')
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings()
  const next = { ...current, ...patch }
  await chrome.storage.local.set({ settings: next })
  return next
}

export async function resetSettings(): Promise<Settings> {
  await chrome.storage.local.set({ settings: DEFAULT_SETTINGS })
  return DEFAULT_SETTINGS
}
