/** 图片 URL 处理 —— 移植自 yuque-dl `src/crypto/index.ts` */
import { genSign } from '../platform/crypto'

export function isCaptureImageURL(url: string, imageServiceDomains: string[]): boolean {
  try {
    const { host, pathname } = new URL(url)
    if (imageServiceDomains.includes(host)) return false
    return Boolean(pathname)
  } catch {
    return false
  }
}

/**
 * 把外部图片 URL 改写为语雀图片代理地址（同域，自动携带 Cookie）。
 * 与原项目不同：genSign 现在是异步的（Web Crypto）。
 */
export async function captureImageURL(url: string, imageServiceDomains: string[] = []): Promise<string> {
  if (!isCaptureImageURL(url, imageServiceDomains)) return url
  const sign = await genSign(url)
  return `https://www.yuque.com/api/filetransfer/images?url=${encodeURIComponent(url)}&sign=${sign}`
}
