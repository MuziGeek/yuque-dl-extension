/**
 * 常量 —— 移植自 yuque-dl `src/constant.ts`（ISC License, https://github.com/gxr404/yuque-dl）
 * 为便于打包与浏览器环境，枚举改为普通常量对象。
 */

/** 语雀 toc 菜单类型 */
export const ARTICLE_TOC_TYPE = {
  /** title 目录类型 */
  TITLE: 'title',
  /** link 外链类型 */
  LINK: 'link',
  /** 内部文档 */
  DOC: 'doc'
} as const

/** 语雀文档类型 */
export const ARTICLE_CONTENT_TYPE = {
  /** 画板 */
  BOARD: 'board',
  /** 数据表 */
  TABLE: 'table',
  /** 表格 */
  SHEET: 'sheet',
  /** 文档 */
  DOC: 'doc'
} as const

export const ARTICLE_CONTENT_MAP: Record<string, string> = {
  [ARTICLE_CONTENT_TYPE.BOARD]: '画板类型',
  [ARTICLE_CONTENT_TYPE.TABLE]: '数据表类型',
  [ARTICLE_CONTENT_TYPE.SHEET]: '表格类型',
  [ARTICLE_CONTENT_TYPE.DOC]: '文档类型'
}

/** 默认语雀 cookie KEY */
export const DEFAULT_COOKIE_KEY = '_yuque_session'
/** 默认语雀域名 */
export const DEFAULT_DOMAIN = 'https://www.yuque.com'

/** 图片代理签名密钥（与原项目一致，由语雀前端使用） */
export const IMAGE_SING_KEY =
  'UXO91eVnUveQn8suOJaYMvBcWs9KptS8N5HoP8ezSeU4vqApZpy1CkPaTpkpQEx2W2mlhxL8zwS8UePwBgksUM0CTtAODbTTTDFD'

/** 公开密码知识库 RSA 公钥（PKCS1v1.5，浏览器端需 jsencrypt 或先手动输密码） */
export const PASSWORD_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCfwyOyncSrUTmkaUPsXT6UUdXx
TQ6a0wgPShvebfwq8XeNj575bUlXxVa/ExIn4nOUwx6iR7vJ2fvz5Ls750D051S7
q70sevcmc8SsBNoaMQtyF/gETPBSsyWv3ccBJFrzZ5hxFdlVUfg6tXARtEI8rbIH
su6TBkVjk+n1Pw/ihQIDAQAB
-----END PUBLIC KEY-----`

export const VERIFIED_COOKIE_KEY_MAP = {
  Book: 'verified_books',
  Doc: 'verified_docs'
} as const

export type TVerifiedTargetType = keyof typeof VERIFIED_COOKIE_KEY_MAP
