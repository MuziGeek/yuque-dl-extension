import type { ActiveTarget } from '../background/index'

const KIND_TEXT: Record<ActiveTarget['kind'], string> = {
  book: '知识库页面',
  doc: '文档页面',
  unknown: '非语雀知识库/文档页',
  none: '无法读取当前标签页'
}

let currentUrl: string | undefined

async function init() {
  const urlEl = document.getElementById('targetUrl')!
  const badgeEl = document.getElementById('kindBadge')!
  const openBtn = document.getElementById('openPanelBtn') as HTMLButtonElement
  const optionsBtn = document.getElementById('openOptionsBtn') as HTMLButtonElement

  let target: ActiveTarget = { kind: 'none' }
  try {
    target = (await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TARGET' })) as ActiveTarget
  } catch {
    /* ignore */
  }

  currentUrl = target.url
  urlEl.textContent = target.url || '（未获取到）'
  badgeEl.textContent = KIND_TEXT[target.kind]
  badgeEl.className = `badge badge-${target.kind}`
  openBtn.disabled = target.kind !== 'book' && target.kind !== 'doc'

  openBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'OPEN_PANEL', url: currentUrl })
    window.close()
  })

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage()
  })
}

void init()
