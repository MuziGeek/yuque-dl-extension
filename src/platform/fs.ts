/**
 * 文件系统适配层 —— 用 File System Access API 替代原项目的 node:fs。
 *
 * 目录结构约定（与原项目一致）：
 *   {用户所选目录}/
 *     {知识库名}/
 *       {标题}_{uuid}/...
 *       {标题}_{uuid}.md
 *       index.md
 *       img/{docUuid}/xxx.png
 *       attachments/{docUuid}/xxx.pdf
 */

export type DirHandle = FileSystemDirectoryHandle

/** 带权限方法的目录句柄（部分 TS lib 未声明） */
export type PermDirHandle = DirHandle & {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}

type ShowDirectoryPicker = (options?: {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: string | FileSystemHandle
}) => Promise<FileSystemDirectoryHandle>

export function isFSASupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

/** 弹出系统目录选择框（必须在用户手势中调用） */
export async function pickDirectory(): Promise<DirHandle> {
  const picker = (window as unknown as { showDirectoryPicker?: ShowDirectoryPicker }).showDirectoryPicker
  if (typeof picker !== 'function') {
    throw new Error('当前浏览器不支持 File System Access API（请使用 Chrome/Edge）')
  }
  return picker({ id: 'yuque-dl', mode: 'readwrite' })
}

export async function queryPermission(handle: DirHandle, mode: 'read' | 'readwrite' = 'readwrite'): Promise<PermissionState> {
  const h = handle as PermDirHandle
  if (typeof h.queryPermission !== 'function') return 'granted'
  return h.queryPermission({ mode })
}

/** 请求权限（必须在用户手势中调用） */
export async function requestPermission(handle: DirHandle, mode: 'read' | 'readwrite' = 'readwrite'): Promise<PermissionState> {
  const h = handle as PermDirHandle
  if (typeof h.requestPermission !== 'function') return 'granted'
  return h.requestPermission({ mode })
}

/** 确保权限可用；若未授权且允许交互，则在用户手势里请求 */
export async function ensurePermission(
  handle: DirHandle,
  { interactive = false, mode = 'readwrite' as 'read' | 'readwrite' } = {}
): Promise<boolean> {
  const state = await queryPermission(handle, mode)
  if (state === 'granted') return true
  if (!interactive) return false
  const next = await requestPermission(handle, mode)
  return next === 'granted'
}

/** 逐级定位目录（不创建） */
export async function getDir(root: DirHandle, segments: string[]): Promise<DirHandle> {
  let dir = root
  for (const seg of segments) {
    if (!seg) continue
    dir = await dir.getDirectoryHandle(seg)
  }
  return dir
}

/** 逐级创建目录 */
export async function ensureDir(root: DirHandle, segments: string[]): Promise<DirHandle> {
  let dir = root
  for (const seg of segments) {
    if (!seg) continue
    dir = await dir.getDirectoryHandle(seg, { create: true })
  }
  return dir
}

/** 在指定目录下写入文件 */
export async function writeFileToDir(dir: DirHandle, name: string, content: BlobPart): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(content)
  } finally {
    await writable.close()
  }
}

/**
 * 按路径写入文件。
 * @param root      知识库根目录句柄
 * @param segments  目录层级（相对 root）
 * @param fileName  文件名
 */
export async function writeFileAt(
  root: DirHandle,
  segments: string[],
  fileName: string,
  content: BlobPart
): Promise<void> {
  const dir = await ensureDir(root, segments)
  await writeFileToDir(dir, fileName, content)
}

/** 按路径打开一个可写流（用于流式下载大文件） */
export async function createWriterAt(
  root: DirHandle,
  segments: string[],
  fileName: string
): Promise<FileSystemWritableFileStream> {
  const dir = await ensureDir(root, segments)
  const fileHandle = await dir.getFileHandle(fileName, { create: true })
  return fileHandle.createWritable()
}

/** 读取文本文件，不存在返回 undefined */
export async function readFileAt(
  root: DirHandle,
  segments: string[],
  fileName: string
): Promise<string | undefined> {
  try {
    const dir = await getDir(root, segments)
    const fileHandle = await dir.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return undefined
  }
}

/** 判断文件是否存在 */
export async function fileExistsAt(root: DirHandle, segments: string[], fileName: string): Promise<boolean> {
  try {
    const dir = await getDir(root, segments)
    await dir.getFileHandle(fileName)
    return true
  } catch {
    return false
  }
}

/** 把 "a/b/c.md" 拆成 { segments:['a','b'], fileName:'c.md' } */
export function splitPath(relPath: string): { segments: string[]; fileName: string } {
  const parts = relPath.split('/').filter(Boolean)
  const fileName = parts.pop() ?? ''
  return { segments: parts, fileName }
}
