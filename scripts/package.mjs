/**
 * 零依赖打包脚本：把 dist/ 打包成可分发的 ZIP（用于 GitHub Release）。
 *
 * 用法：
 *   node scripts/package.mjs            # 打包 dist/
 *   node scripts/package.mjs --with-maps  # 保留 .map（默认剔除，减小体积）
 *
 * 产物：release/yuque-dl-extension-v{version}.zip
 * 说明：ZIP 内文件位于根目录，解压后直接得到可被 Chrome/Edge
 *       「加载已解压的扩展程序」识别的文件夹。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const releaseDir = path.join(root, 'release')
const withMaps = process.argv.includes('--with-maps')

// ---------- CRC32 ----------
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
  let c = 0 ^ -1
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff]
  return (c ^ -1) >>> 0
}

// ---------- DOS 时间 ----------
function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980)
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: day }
}

// ---------- 遍历 dist ----------
async function walk(dir, base = '') {
  const out = []
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, rel)))
    } else if (entry.isFile()) {
      if (!withMaps && rel.endsWith('.map')) continue
      out.push({ rel, abs })
    }
  }
  return out
}

// ---------- 最小 ZIP 写入器（deflate） ----------
function buildZip(files) {
  const chunks = []
  const central = []
  let offset = 0

  for (const file of files) {
    const nameBuf = Buffer.from(file.rel, 'utf8')
    const raw = file.data
    const compressed = zlib.deflateRawSync(raw, { level: 9 })
    const crc = crc32(raw)
    const { time, date } = dosDateTime(file.mtime)

    // 本地文件头
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 文件名
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)

    chunks.push(local, nameBuf, compressed)

    // 中央目录条目
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4) // version made by
    cd.writeUInt16LE(20, 6) // version needed
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(8, 10)
    cd.writeUInt16LE(time, 12)
    cd.writeUInt16LE(date, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(compressed.length, 20)
    cd.writeUInt32LE(raw.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30) // extra
    cd.writeUInt16LE(0, 32) // comment
    cd.writeUInt16LE(0, 34) // disk start
    cd.writeUInt16LE(0, 36) // internal attrs
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38) // external attrs
    cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBuf)

    offset += local.length + nameBuf.length + compressed.length
  }

  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...chunks, centralBuf, eocd])
}

// ---------- 主流程 ----------
const INSTALL_NOTE = `语雀知识库下载插件 — 安装说明
================================

1. 解压本压缩包到你希望长期保留的位置（解压后请勿删除或移动其中的文件）。
2. 打开 Chrome（或 Edge），在地址栏输入：
     Chrome:  chrome://extensions
     Edge:    edge://extensions
3. 打开右上角的「开发者模式」开关。
4. 点击左上角「加载已解压的扩展程序」。
5. 选择本文件夹（即包含 manifest.json 的这一层目录）。

使用：
- 在浏览器里登录语雀，打开任意知识库或文档页面。
- 点击工具栏上的插件图标 → 「打开下载面板」。
- 选择保存目录 → 开始下载。

文档与源码：https://github.com/MuziGeek/yuque-dl-extension
基于 yuque-dl (https://github.com/gxr404/yuque-dl)，ISC 许可。
`

async function main() {
  if (!fs.existsSync(distDir)) {
    console.error('[pack] 未找到 dist/，请先运行 npm run build')
    process.exit(1)
  }

  const manifest = JSON.parse(await fsp.readFile(path.join(distDir, 'manifest.json'), 'utf8'))
  const version = manifest.version || '0.0.0'

  const files = await walk(distDir)
  const payload = []
  for (const file of files) {
    const stat = await fsp.stat(file.abs)
    payload.push({ rel: file.rel, data: await fsp.readFile(file.abs), mtime: stat.mtime })
  }
  // 附加安装说明
  payload.push({
    rel: 'INSTALL.txt',
    data: Buffer.from(INSTALL_NOTE, 'utf8'),
    mtime: new Date()
  })

  await fsp.mkdir(releaseDir, { recursive: true })
  const outName = `yuque-dl-extension-v${version}.zip`
  const outPath = path.join(releaseDir, outName)
  const zip = buildZip(payload)
  await fsp.writeFile(outPath, zip)

  const kb = (zip.length / 1024).toFixed(1)
  console.log(`[pack] v${version} -> ${path.relative(root, outPath)} (${payload.length} files, ${kb} KB)`)
}

main().catch((err) => {
  console.error('[pack] failed:', err)
  process.exit(1)
})
