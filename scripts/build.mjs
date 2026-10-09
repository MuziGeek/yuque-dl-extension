// 构建脚本：用 esbuild 打包扩展各入口，并复制静态资源。
// 不用 vite-plugin-web-extension / crxjs，避免与新版 vite 的兼容风险。
//
//   node scripts/build.mjs            生产构建 -> dist/
//   node scripts/build.mjs --watch    监听重建
//   node scripts/build.mjs --test     额外产出 dist-test/core.mjs（供 node --test 使用）
import * as esbuild from 'esbuild'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const isWatch = args.has('--watch')
const withTestBundle = args.has('--test')

// manifest.json 中引用的入口（输出路径必须与之完全一致）
const entries = [
  { in: 'src/background/index.ts', out: 'background/background.js' },
  { in: 'src/popup/popup.ts', out: 'popup/popup.js' },
  { in: 'src/panel/panel.ts', out: 'panel/panel.js' },
  { in: 'src/options/options.ts', out: 'options/options.js' }
]

const dist = path.join(root, 'dist')

/** 递归复制目录/文件列表 */
async function copyStatic() {
  // manifest
  await fs.copyFile(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'))

  // public/** -> dist/**
  const publicDir = path.join(root, 'public')
  if (await exists(publicDir)) {
    await fs.cp(publicDir, dist, { recursive: true })
  }

  // src 下的 html / css 原样复制（保留目录结构）
  const staticFiles = []
  await walk(path.join(root, 'src'), (file) => {
    if (file.endsWith('.html') || file.endsWith('.css')) staticFiles.push(file)
  })
  for (const file of staticFiles) {
    const rel = path.relative(path.join(root, 'src'), file)
    const target = path.join(dist, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(file, target)
  }
}

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function walk(dir, cb) {
  const list = await fs.readdir(dir, { withFileTypes: true })
  for (const item of list) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) await walk(full, cb)
    else cb(full)
  }
}

function commonBuildOptions() {
  return {
    bundle: true,
    format: 'esm',
    target: 'chrome120',
    platform: 'browser',
    sourcemap: true,
    logLevel: 'info',
    // 扩展页面使用 ES module，无需 IIFE
    mainFields: ['browser', 'module', 'main'],
    conditions: ['browser', 'import', 'default'],
    loader: { '.png': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' }
  }
}

async function build() {
  await fs.rm(dist, { recursive: true, force: true })
  await fs.mkdir(dist, { recursive: true })
  await copyStatic()

  const contexts = []
  for (const e of entries) {
    const opts = {
      ...commonBuildOptions(),
      entryPoints: [path.join(root, e.in)],
      outfile: path.join(dist, e.out)
    }
    contexts.push(await esbuild.context(opts))
  }

  if (withTestBundle) {
    const testEntry = path.join(root, 'test/entry.ts')
    if (await exists(testEntry)) {
      contexts.push(
        await esbuild.context({
          ...commonBuildOptions(),
          platform: 'neutral',
          target: 'es2022',
          entryPoints: [testEntry],
          outfile: path.join(root, 'dist-test/core.mjs'),
          sourcemap: false,
          logLevel: 'warning'
        })
      )
    }
  }

  if (isWatch) {
    await Promise.all(contexts.map((c) => c.watch()))
    console.log('[build] watching...')
  } else {
    await Promise.all(contexts.map((c) => c.rebuild()))
    await Promise.all(contexts.map((c) => c.dispose()))
    console.log('[build] done -> dist/')
  }
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
