/** 类型定义 —— 移植/裁剪自 yuque-dl `src/types/*` */

export interface Toc {
  type: string
  title: string
  uuid: string
  url: string
  prev_uuid: string
  sibling_uuid: string
  child_uuid: string
  parent_uuid: string
  doc_id: number
  level: number
  id: number
  open_window: number
  visible: number
}

export interface ArticleData {
  id: number
  space_id?: number
  type: string
  format?: string
  title: string
  slug: string
  created_at: string
  content_updated_at: string
  published_at: string
  first_published_at: string
  sourcecode: string
  content?: string
}

export interface ArticleRootObject {
  meta?: unknown
  data: ArticleData
}

/** 知识库页面内嵌 appData（部分字段） */
export interface YuqueAppData {
  book?: {
    id: number
    slug: string
    name: string
    description?: string
    toc?: Toc[]
  }
  doc?: {
    id: number
    slug: string
    title?: string
    book_id: number
  }
  space?: { host?: string }
  imageServiceDomains?: string[]
  timestamp?: number
  matchCondition?: {
    targetType?: 'Book' | 'Doc'
    needVerifyTargetId?: number
  }
}

export interface IKnowledgeBaseInfo {
  bookId?: number
  bookSlug?: string
  tocList?: Toc[]
  bookName?: string
  bookDesc?: string
  host?: string
  imageServiceDomains?: string[]
}

export interface IDocInfo {
  docId?: number
  docSlug?: string
  docTitle?: string
  bookId?: number
  bookSlug?: string
  bookName?: string
  host?: string
  imageServiceDomains?: string[]
}

export interface IProgressItem {
  path: string
  toc: Toc
  pathIdList: string[]
  pathTitleList: string[]
  rawPathTitleList?: string[]
  rawPath?: string
  rawMdPath?: string
  /** 文档所在目录（相对知识库根） */
  savePath?: string
  createAt?: string
  contentUpdatedAt?: string
  publishedAt?: string
  firstPublishedAt?: string
}

export interface SummaryItem {
  id: string
  children?: SummaryItem[]
  type: 'link' | 'title'
  text: string
  level: number
  link?: string
}

export interface SheetItemData {
  [row: string]: {
    [col: string]: { v: unknown }
  }
}

export interface SheetItem {
  name: string
  data: SheetItemData
}

export interface ArticleInfo {
  bookId: number
  itemUrl: string
  /** 文档所在目录（相对知识库根，'' 表示根目录） */
  savePath: string
  /** 相对知识库根的文件路径，含文件名 */
  saveFilePath: string
  uuid: string
  articleTitle: string
  articleUrl: string
  host?: string
  imageServiceDomains: string[]
}

export interface IHandleMdDataOptions {
  articleUrl: string
  articleTitle: string
  toc: boolean
  articleUpdateTime: string
  convertMarkdownVideoLinks: boolean
  hideFooter: boolean
}

export interface ConcurrencyOptions {
  docs: number
  files: number
}

/** 插件下载选项（对应原 ICliOptions，去掉 Node 专属字段） */
export interface IDownloadOptions {
  ignoreImg: boolean
  ignoreAttachments: boolean | string
  toc: boolean
  incremental: boolean
  convertMarkdownVideoLinks: boolean
  hideFooter: boolean
  concurrency?: ConcurrencyOptions
  token?: string
  key?: string
  password?: string
}

/** 下载任务的最终统计 */
export interface DownloadStats {
  total: number
  success: number
  failed: number
  skipped: number
  updated: number
}

export interface FailedArticle {
  path: string
  articleUrl: string
  message: string
}
