// 生成扩展图标 PNG（无第三方依赖，手写 PNG 编码）
//   node scripts/gen-icons.mjs
import zlib from 'node:zlib'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'icons')

const BRAND = [0x00, 0xb9, 0x6b]

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = zlib.deflateSync(raw, { level: 9 })
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

/** 归一化坐标下采样：返回 { color:[r,g,b], alpha } */
function sample(px, py) {
  const R = 0.24
  // 圆角矩形遮罩
  if (!insideRoundedRect(px, py, R)) return { color: BRAND, alpha: 0 }

  // 白色下载箭头
  const inStem = px >= 0.45 && px <= 0.55 && py >= 0.22 && py <= 0.5
  const inHead = py >= 0.44 && py <= 0.66 && Math.abs(px - 0.5) <= ((0.66 - py) / 0.22) * 0.22
  const inBar = px >= 0.3 && px <= 0.7 && py >= 0.74 && py <= 0.82
  if (inStem || inHead || inBar) return { color: [255, 255, 255], alpha: 1 }

  return { color: BRAND, alpha: 1 }
}

function insideRoundedRect(px, py, r) {
  if (px < 0 || px > 1 || py < 0 || py > 1) return false
  const cx = Math.min(Math.max(px, r), 1 - r)
  const cy = Math.min(Math.max(py, r), 1 - r)
  // 在四角区域：判断到圆心的距离
  const inCornerZone = (px < r || px > 1 - r) && (py < r || py > 1 - r)
  if (!inCornerZone) return true
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r + 1e-6
}

function render(size) {
  const SS = 4 // 超采样
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / size
          const py = (y + (sy + 0.5) / SS) / size
          const s = sample(px, py)
          r += s.color[0] * s.alpha
          g += s.color[1] * s.alpha
          b += s.color[2] * s.alpha
          a += s.alpha
        }
      }
      const n = SS * SS
      const idx = (y * size + x) * 4
      if (a > 0) {
        out[idx] = Math.round(r / a)
        out[idx + 1] = Math.round(g / a)
        out[idx + 2] = Math.round(b / a)
        out[idx + 3] = Math.round((a / n) * 255)
      }
    }
  }
  return encodePng(size, size, out)
}

async function main() {
  await fs.mkdir(outDir, { recursive: true })
  for (const size of [16, 32, 48, 128]) {
    const png = render(size)
    await fs.writeFile(path.join(outDir, `icon${size}.png`), png)
    console.log(`icon${size}.png (${png.length} bytes)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
