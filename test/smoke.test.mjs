import { describe, it } from 'node:test'
import assert from 'node:assert'

const {
  parseAppData,
  fixPath,
  genSign,
  detectTargetKind,
  genToc
} = await import('../dist-test/core.mjs')

describe('parseAppData', () => {
  it('从 SSR HTML 中解析语雀内嵌 JSON', () => {
    const appData = { book: { id: 123, slug: 'demo', name: '示例库', toc: [] } }
    // 原正则匹配 "decodeURIComponent(\"...\"));" 这种双右括号结构
    const html = `<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(appData))}"));</script>`
    const result = parseAppData(html)
    assert.equal(result?.book?.id, 123)
    assert.equal(result?.book?.name, '示例库')
  })

  it('没有数据时返回 undefined', () => {
    assert.equal(parseAppData('<html></html>'), undefined)
  })
})

describe('fixPath', () => {
  it('去除非法字符与 emoji', () => {
    assert.equal(fixPath('a/b:c?d"e'), 'a_b_c_d_e')
  })
})

describe('genSign', () => {
  it('为图片代理 URL 生成 sha256 hex 签名', async () => {
    const sign = await genSign('https://example.com/image.png')
    assert.equal(typeof sign, 'string')
    assert.equal(sign.length, 64)
    assert.match(sign, /^[0-9a-f]+$/)
  })
})

describe('detectTargetKind', () => {
  it('识别知识库链接', () => {
    const info = detectTargetKind('https://www.yuque.com/alice/mybook')
    assert.equal(info.kind, 'book')
    assert.equal(info.login, 'alice')
    assert.equal(info.bookSlug, 'mybook')
  })

  it('识别文档链接', () => {
    const info = detectTargetKind('https://www.yuque.com/alice/mybook/hello')
    assert.equal(info.kind, 'doc')
    assert.equal(info.docSlug, 'hello')
  })

  it('忽略非语雀链接', () => {
    assert.equal(detectTargetKind('https://example.com/').kind, 'unknown')
  })
})

describe('genToc', () => {
  it('生成文内目录', () => {
    const md = '# A\n\n## B\n\n### C\n\n## D\n'
    const toc = genToc(md)
    assert.ok(toc.includes('[A](#a)'))
    assert.ok(toc.includes('[B](#b)'))
    assert.ok(toc.includes('[C](#c)'))
    assert.ok(toc.includes('[D](#d)'))
  })
})
