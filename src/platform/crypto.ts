/**
 * 浏览器端签名 —— 对应 yuque-dl `src/crypto/index.ts: genSign`
 * 原实现：crypto.createHash('sha256').update(`${IMAGE_SING_KEY}${url}`).digest('hex')
 * 这里用 Web Crypto 实现等价逻辑。
 */
import { IMAGE_SING_KEY } from '../core/constants'

const encoder = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function genSign(url: string): Promise<string> {
  const data = encoder.encode(`${IMAGE_SING_KEY}${url}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}
