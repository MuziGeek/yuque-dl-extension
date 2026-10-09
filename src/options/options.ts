import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSettings, type Settings } from '../shared/settings'
import { ensureHostPermissions } from '../platform/auth'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const els = {
  manualTokenEnabled: $<HTMLInputElement>('manualTokenEnabled'),
  manualToken: $<HTMLInputElement>('manualToken'),
  cookieKey: $<HTMLInputElement>('cookieKey'),
  customDomains: $<HTMLTextAreaElement>('customDomains'),
  ignoreImg: $<HTMLInputElement>('ignoreImg'),
  ignoreAttachments: $<HTMLInputElement>('ignoreAttachments'),
  toc: $<HTMLInputElement>('toc'),
  hideFooter: $<HTMLInputElement>('hideFooter'),
  convertMarkdownVideoLinks: $<HTMLInputElement>('convertMarkdownVideoLinks'),
  incremental: $<HTMLInputElement>('incremental'),
  ignoreAttachmentExts: $<HTMLInputElement>('ignoreAttachmentExts'),
  docsConcurrency: $<HTMLInputElement>('docsConcurrency'),
  filesConcurrency: $<HTMLInputElement>('filesConcurrency'),
  saveBtn: $<HTMLButtonElement>('saveBtn'),
  resetBtn: $<HTMLButtonElement>('resetBtn'),
  status: $('status')
}

function fill(s: Settings) {
  els.manualTokenEnabled.checked = s.manualTokenEnabled
  els.manualToken.value = s.manualToken
  els.cookieKey.value = s.cookieKey
  els.customDomains.value = s.customDomains.join('\n')
  els.ignoreImg.checked = s.ignoreImg
  els.ignoreAttachments.checked = s.ignoreAttachments
  els.toc.checked = s.toc
  els.hideFooter.checked = s.hideFooter
  els.convertMarkdownVideoLinks.checked = s.convertMarkdownVideoLinks
  els.incremental.checked = s.incremental
  els.ignoreAttachmentExts.value = s.ignoreAttachmentExts
  els.docsConcurrency.value = String(s.docsConcurrency)
  els.filesConcurrency.value = String(s.filesConcurrency)
}

function collect(): Partial<Settings> {
  const domains = els.customDomains.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    manualTokenEnabled: els.manualTokenEnabled.checked,
    manualToken: els.manualToken.value.trim(),
    cookieKey: els.cookieKey.value.trim() || DEFAULT_SETTINGS.cookieKey,
    customDomains: domains,
    ignoreImg: els.ignoreImg.checked,
    ignoreAttachments: els.ignoreAttachments.checked,
    toc: els.toc.checked,
    hideFooter: els.hideFooter.checked,
    convertMarkdownVideoLinks: els.convertMarkdownVideoLinks.checked,
    incremental: els.incremental.checked,
    ignoreAttachmentExts: els.ignoreAttachmentExts.value.trim(),
    docsConcurrency: Number(els.docsConcurrency.value) || DEFAULT_SETTINGS.docsConcurrency,
    filesConcurrency: Number(els.filesConcurrency.value) || DEFAULT_SETTINGS.filesConcurrency
  }
}

function setStatus(text: string) {
  els.status.textContent = text
  setTimeout(() => {
    if (els.status.textContent === text) els.status.textContent = ''
  }, 3000)
}

async function init() {
  fill(await loadSettings())

  els.saveBtn.addEventListener('click', async () => {
    const patch = collect()
    // 自定义域需要动态申请可选权限（必须在用户手势中）
    if (patch.customDomains && patch.customDomains.length) {
      const origins = patch.customDomains
        .map((d) => (d.startsWith('http') ? d : `https://${d}`))
        .map((d) => `${d.replace(/\/.*$/, '')}/*`)
      try {
        await ensureHostPermissions(origins)
      } catch {
        /* 用户拒绝也不阻塞保存 */
      }
    }
    const next = await saveSettings(patch)
    fill(next)
    setStatus('已保存 ✓')
  })

  els.resetBtn.addEventListener('click', async () => {
    fill(await resetSettings())
    setStatus('已恢复默认 ✓')
  })
}

void init()
