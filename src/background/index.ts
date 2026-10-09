/** background (Service Worker)：只做入口路由，不执行下载 */

import { detectTargetKind } from '../core/yuque-api'

const PANEL_PATH = 'panel/panel.html'
const MENU_ID = 'yuque-dl-download'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: '用「语雀知识库下载」下载此页面',
    contexts: ['page', 'link'],
    documentUrlPatterns: ['https://*.yuque.com/*', 'https://yuque.com/*']
  })
})

async function openPanel(targetUrl?: string) {
  if (targetUrl) {
    await chrome.storage.session.set({ pendingTarget: targetUrl })
  }
  const url = chrome.runtime.getURL(`${PANEL_PATH}${targetUrl ? `?target=${encodeURIComponent(targetUrl)}` : ''}`)
  // 已打开则聚焦
  const existing = await chrome.tabs.query({ url: chrome.runtime.getURL(`${PANEL_PATH}*`) })
  if (existing.length && existing[0].id != null) {
    await chrome.tabs.update(existing[0].id, { active: true, url })
    await chrome.windows.update(existing[0].windowId, { focused: true })
    return
  }
  await chrome.tabs.create({ url })
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl || tab?.url
  if (url) void openPanel(url)
})

export interface ActiveTarget {
  url?: string
  kind: 'book' | 'doc' | 'unknown' | 'none'
}

async function getActiveTarget(): Promise<ActiveTarget> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const url = tab?.url
  if (!url) return { kind: 'none' }
  const info = detectTargetKind(url)
  return { url, kind: info.kind }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_ACTIVE_TARGET') {
    getActiveTarget().then(sendResponse)
    return true
  }
  if (message?.type === 'OPEN_PANEL') {
    openPanel(message.url).then(() => sendResponse({ ok: true }))
    return true
  }
  return false
})
