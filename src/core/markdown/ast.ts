/** mdast 封装 —— 移植自 yuque-dl `src/parse/ast.ts` */
import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import type { Root, Nodes, Parents, Link, InlineCode } from 'mdast'

export function getAst(mdData: string): Root {
  return fromMarkdown(mdData)
}

export function toMd(astTree: Root): string {
  return toMarkdown(astTree)
}

export interface ILinkItem {
  node: Link
  keyChain: string[]
}

export function getLinkList(curNode: Root): ILinkItem[] {
  const linkList: ILinkItem[] = []
  eachNode(curNode, function (node, keyChain) {
    if (node.type === 'link') linkList.push({ node: node as Link, keyChain })
  })
  return linkList
}

export interface IInlineCodeItem {
  node: InlineCode
  keyChain: string[]
}

export function getInLineCodeList(curNode: Root): IInlineCodeItem[] {
  const list: IInlineCodeItem[] = []
  eachNode(curNode, function (node, keyChain) {
    if (node.type === 'inlineCode') list.push({ node: node as InlineCode, keyChain })
  })
  return list
}

function eachNode(
  node: Nodes,
  callback: (node: Nodes, keyChain: string[]) => void,
  keyChain: string[] = []
) {
  callback(node, keyChain)
  if (Array.isArray((node as Parents).children)) {
    keyChain.push('children')
    ;(node as Parents).children.forEach((child, index) => {
      eachNode(child, callback, [...keyChain, String(index)])
    })
  }
}
