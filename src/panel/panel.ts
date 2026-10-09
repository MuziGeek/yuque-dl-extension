import { EventBus } from '../ui/events'
import { loadSettings, saveSettings, type Settings } from '../shared/settings'
import { detectTargetKind } from '../core/yuque-api'
import { downloadBook } from '../core/download-book'
import { downloadDocument } from '../core/download-doc'
import { isFSASupported, pickDirectory, ensurePermission, type DirHandle } from '../platform/fs'
import { loadRootHandle, saveRootHandle } from '../platform/fs-handle-store'
import { applyManualToken, ensureHostPermissions, isLoggedIn, getYuqueCookies } from '../platform/auth'
import type { IDownloadOptions } from '../core/types'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const els = {
  targetUrl: $<HTMLInputElement>('targetUrl'),
  detectBtn: $<HTMLButtonElement>('detectBtn'),
  kindBadge: $('kindBadge'),
  loginBadge: $('loginBadge'),
  detectDetail: $('detectDetail'),
  pickDirBtn: $<HTMLButtonElement>('pickDirBtn'),
  reuseDirBtn: $<HTMLButtonElement>('reuseDirBtn'),
  dirName: $('dirName'),
  dirPreview: $('dirPreview'),
  startBtn: $<HTMLButtonElement>('startBtn'),
  cancelBtn: $<HTMLButtonElement>('cancelBtn'),
  retryFailedBtn: $<HTMLButtonElement>('retryFailedBtn'),
  progressBar: $('progressBar'),
  progressText: $('progressText'),
  logList: $('logList'),
  openOptionsBtn: $<HTMLButtonElement>('openOptionsBtn'),
  optIgnoreImg: $<HTMLInputElement>('optIgnoreImg'),
  optIgnoreAttachments: $<HTMLInputElement>('optIgnoreAttachments'),
  optToc: $<HTMLInputElement>('optToc'),
  optHideFooter: $<HTMLInputElement>('optHideFooter'),
  optVideo: $<HTMLInputElement>('optVideo'),
  optIncremental: $<HTMLInputElement>('optIncremental'),
  optAttachmentExts: $<HTMLInputElement>('optAttachmentExts'),
  optDocsConc: $<HTMLInputElement>('optDocsConc'),
  optFilesConc: $<HTMLInputElement>('optFilesConc')
}

const bus = new EventBus()
let dirHandle: DirHandle | undefined
let settings: Settings
let running = false
let abortController: AbortController | undefined
let failedLastRun = 0

const MAX_LOG_LINES = 500

function appendLog(level: string, message: string) {
  const line = document.createElement('div')
  line.className = `line ${level}`
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  line.textContent = `[${time}] ${message}`
  els.logList.appendChild(line)
  while (els.logList.childElementCount > MAX_LOG_LINES) els.logList.removeChild(els.logList.firstChild!)
  els.logList.scrollTop = els.logList.scrollHeight
}

function setBadge(el: HTMLElement, text: string, cls = '') {
  el.textContent = text
  el.className = `badge ${cls}`.trim()
}

function bindBus() {
  bus.on('status', (msg) => appendLog('info', msg))
  bus.on('log', (entry) => appendLog(entry.level, entry.message))
  bus.on('progress', (s) => {
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0
    els.progressBar.style.width = `${pct}%`
    els.progressText.textContent =
      `进度 ${s.done}/${s.total}（${pct}%）` +
      (s.failed ? ` · 失败 ${s.failed}` : '') +
      (s.currentTitle ? ` · 当前：${s.currentTitle}` : '')
  })
  bus.on('article', ({ path, state, message }) => {
    if (state === 'success') appendLog('success', `√ ${path}`)
    else if (state === 'updated') appendLog('success', `↑ 已更新 ${path}`)
    else if (state === 'failed') appendLog('error', `✕ ${path} — ${message || '下载失败'}`)
  })
  bus.on('done', (stats) => {
    appendLog(
      stats.failed ? 'warn' : 'success',
      `完成：成功 ${stats.success}，失败 ${stats.failed}，跳过 ${stats.skipped}${stats.updated ? `，更新 ${stats.updated}` : ''}`
    )
  })
}

function readOptions(): IDownloadOptions {
  return {
    ignoreImg: els.optIgnoreImg.checked,
    ignoreAttachments: els.optIgnoreAttachments.checked
      ? els.optAttachmentExts.value.trim()
        ? els.optAttachmentExts.value.trim()
        : true
      : els.optAttachmentExts.value.trim() || false,
    toc: els.optToc.checked,
    hideFooter: els.optHideFooter.checked,
    convertMarkdownVideoLinks: els.optVideo.checked,
    incremental: els.optIncremental.checked,
    concurrency: {
      docs: clamp(Number(els.optDocsConc.value) || 3, 1, 8),
      files: clamp(Number(els.optFilesConc.value) || 5, 1, 12)
    },
    key: settings.cookieKey,
    token: settings.manualTokenEnabled ? settings.manualToken : undefined
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

async function applySettingsToForm(s: Settings) {
  els.optIgnoreImg.checked = s.ignoreImg
  els.optIgnoreAttachments.checked = s.ignoreAttachments
  els.optToc.checked = s.toc
  els.optHideFooter.checked = s.hideFooter
  els.optVideo.checked = s.convertMarkdownVideoLinks
  els.optIncremental.checked = s.incremental
  els.optAttachmentExts.value = s.ignoreAttachmentExts
  els.optDocsConc.value = String(s.docsConcurrency)
  els.optFilesConc.value = String(s.filesConcurrency)
}

async function persistOptions() {
  settings = await saveSettings({
    ignoreImg: els.optIgnoreImg.checked,
    ignoreAttachments: els.optIgnoreAttachments.checked,
    toc: els.optToc.checked,
    hideFooter: els.optHideFooter.checked,
    convertMarkdownVideoLinks: els.optVideo.checked,
    incremental: els.optIncremental.checked,
    ignoreAttachmentExts: els.optAttachmentExts.value.trim(),
    docsConcurrency: clamp(Number(els.optDocsConc.value) || 3, 1, 8),
    filesConcurrency: clamp(Number(els.optFilesConc.value) || 5, 1, 12)
  })
}

function setRunning(value: boolean) {
  running = value
  els.startBtn.disabled = value
  els.cancelBtn.disabled = !value
  els.pickDirBtn.disabled = value
  els.reuseDirBtn.disabled = value
}

function refreshDirUI() {
  const name = dirHandle?.name
  els.dirName.textContent = name ? `已选择：${name}` : '尚未选择'
  els.dirPreview.textContent = name ? `{${name}}/知识库名/...md` : '{所选目录}/知识库名/...md'
  els.startBtn.disabled = running || !dirHandle
}

async function detect() {
  const url = els.targetUrl.value.trim()
  if (!url) {
    setBadge(els.kindBadge, '请输入链接', 'err')
    return
  }
  const info = detectTargetKind(url)
  if (info.kind === 'unknown') {
    setBadge(els.kindBadge, '无法识别为知识库/文档链接', 'err')
    els.detectDetail.textContent = ''
    return
  }
  setBadge(els.kindBadge, info.kind === 'book' ? '知识库' : '文档', 'ok')
  els.detectDetail.textContent = '解析中…'
  try {
    if (info.kind === 'book') {
      const { getKnowledgeBaseInfo } = await import('../core/yuque-api')
      const res = await getKnowledgeBaseInfo(url)
      if (!res.bookId) throw new Error('未获取到知识库信息（可能需登录）')
      els.detectDetail.textContent = `「${res.bookName}」· ${res.tocList?.length ?? 0} 篇文档`
    } else {
      const { getDocInfoFromUrl } = await import('../core/yuque-api')
      const res = await getDocInfoFromUrl(url)
      if (!res.docId) throw new Error('未获取到文档信息（可能需登录）')
      els.detectDetail.textContent = `文档「${res.docTitle}」· 所属知识库「${res.bookName || ''}」`
    }
  } catch (e) {
    els.detectDetail.textContent = `解析失败：${(e as Error).message}`
  }
}

async function refreshLoginBadge() {
  const loggedIn = await isLoggedIn(settings.cookieKey)
  if (loggedIn) {
    setBadge(els.loginBadge, '已登录语雀（自动复用 Cookie）', 'ok')
    return
  }
  if (settings.manualTokenEnabled && settings.manualToken) {
    setBadge(els.loginBadge, '使用手动 Token', 'ok')
    return
  }
  const cookies = await getYuqueCookies()
  const hasAny = Object.keys(cookies).length > 0
  setBadge(els.loginBadge, hasAny ? '未发现会话 Cookie，可能需要登录' : '未登录语雀', 'err')
}

async function startDownload() {
  if (!dirHandle) return
  const url = els.targetUrl.value.trim()
  const info = detectTargetKind(url)
  if (info.kind === 'unknown') {
    appendLog('error', '链接无法识别为语雀知识库或文档')
    return
  }

  await persistOptions()

  // 权限申请必须尽量靠近用户手势
  const ok = await ensurePermission(dirHandle, { interactive: true })
  if (!ok) {
    appendLog('error', '未获得所选目录的写入权限，请重新选择文件夹')
    return
  }

  setRunning(true)
  failedLastRun = 0
  els.retryFailedBtn.hidden = true
  els.progressBar.style.width = '0%'
  els.progressText.textContent = '准备中…'
  abortController = new AbortController()

  try {
    if (settings.manualTokenEnabled && settings.manualToken) {
      await applyManualToken(
        { key: settings.cookieKey, token: settings.manualToken },
        settings.customDomains
      )
    }
    if (settings.customDomains.length) {
      await ensureHostPermissions(settings.customDomains)
    }

    const options = readOptions()
    const stats =
      info.kind === 'book'
        ? await downloadBook({ url, root: dirHandle, options, bus, signal: abortController.signal })
        : await downloadDocument({ url, root: dirHandle, options, bus })

    failedLastRun = stats.failed
    if (stats.failed > 0) {
      els.retryFailedBtn.hidden = false
      els.retryFailedBtn.textContent = `重试未完成项（${stats.failed}）`
    }
  } catch (e) {
    appendLog('error', `下载中断：${(e as Error).message}`)
  } finally {
    setRunning(false)
  }
}

async function init() {
  bus && bindBus()
  settings = await loadSettings()
  await applySettingsToForm(settings)

  if (!isFSASupported()) {
    els.pickDirBtn.disabled = true
    appendLog('error', '当前浏览器不支持 File System Access API，请使用 Chrome / Edge 最新版')
  }

  // 目标链接
  const params = new URLSearchParams(location.search)
  let target = params.get('target') || ''
  if (!target) {
    const session = await chrome.storage.session.get('pendingTarget')
    target = session.pendingTarget || ''
  }
  if (target) els.targetUrl.value = target

  // 上次目录
  const last = await loadRootHandle()
  if (last) {
    els.reuseDirBtn.hidden = false
    els.reuseDirBtn.textContent = `使用上次的文件夹（${last.name}）`
  }

  await refreshLoginBadge()
  if (els.targetUrl.value) void detect()

  // 事件
  els.detectBtn.addEventListener('click', () => void detect())
  els.openOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage())
  els.pickDirBtn.addEventListener('click', async () => {
    try {
      dirHandle = await pickDirectory()
      await saveRootHandle(dirHandle)
      refreshDirUI()
      appendLog('info', `已选择保存目录：${dirHandle.name}`)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') appendLog('error', `选择目录失败：${(e as Error).message}`)
    }
  })
  els.reuseDirBtn.addEventListener('click', async () => {
    try {
      const handle = await loadRootHandle()
      if (!handle) return
      const granted = await ensurePermission(handle, { interactive: true })
      if (!granted) {
        appendLog('error', '未授权访问上次的目录，请重新选择文件夹')
        return
      }
      dirHandle = handle
      refreshDirUI()
      appendLog('info', `已恢复保存目录：${handle.name}`)
    } catch (e) {
      appendLog('error', `恢复目录失败：${(e as Error).message}`)
    }
  })
  els.startBtn.addEventListener('click', () => void startDownload())
  els.cancelBtn.addEventListener('click', () => {
    abortController?.abort()
    appendLog('warn', '已请求取消，正在等待进行中的任务结束…')
  })
  els.retryFailedBtn.addEventListener('click', () => void startDownload())
  els.optIncremental.addEventListener('change', () => void persistOptions())

  refreshDirUI()
}

void init()
