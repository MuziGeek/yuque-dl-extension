/**
 * 测试入口：重新导出纯逻辑函数，打包成 dist-test/core.mjs 供 node --test 使用。
 */
export { parseAppData, detectTargetKind } from '../src/core/yuque-api'
export { fixPath } from '../src/core/markdown/fix'
export { genSign } from '../src/platform/crypto'
export { genToc } from '../src/core/markdown/toc'
