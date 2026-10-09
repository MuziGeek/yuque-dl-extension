/**
 * 轻量文内目录生成 —— 替代 yuque-dl 使用的 `markdown-toc`。
 * 仅扫描标题行（跳过代码块），生成嵌套列表。
 */
export function genToc(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const headings: Array<{ level: number; text: string }> = []
  let inFence = false
  let fenceMark = ''

  for (const line of lines) {
    const fence = /^\s*(```|~~~)/.exec(line)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceMark = fence[1]
      } else if (line.trim().startsWith(fenceMark)) {
        inFence = false
      }
      continue
    }
    if (inFence) continue

    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line)
    if (m) headings.push({ level: m[1].length, text: m[2].replace(/#+\s*$/, '').trim() })
  }

  if (headings.length < 2) return ''

  const usedSlugs = new Map<string, number>()
  const list: string[] = []
  const stack: number[] = []

  for (const h of headings) {
    const slug = slugify(h.text, usedSlugs)
    while (stack.length && stack[stack.length - 1] >= h.level) stack.pop()
    const depth = stack.length
    stack.push(h.level)
    list.push(`${'  '.repeat(depth)}- [${h.text}](#${slug})`)
  }
  return list.join('\n')
}

function slugify(text: string, used: Map<string, number>): string {
  let base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
  if (!base) base = 'section'
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}
