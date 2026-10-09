/**
 * IndexedDB 存储层。
 * 用途：
 *  1) 持久化用户选择的目录句柄（FileSystemDirectoryHandle 可结构化克隆）；
 *  2) 作为下载进度的镜像（key = book:{bookId}）。
 */
import type { DirHandle } from './fs'

const DB_NAME = 'yuque-dl'
const DB_VERSION = 1
const STORE = 'kv'
const HANDLE_KEY = 'rootDir'

let dbPromise: Promise<IDBDatabase> | undefined

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

export function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  return tx<T | undefined>('readonly', (s) => s.get(key))
}

export function idbPut(key: string, value: unknown): Promise<IDBValidKey> {
  return tx<IDBValidKey>('readwrite', (s) => s.put(value, key))
}

export function idbDelete(key: string): Promise<undefined> {
  return tx<undefined>('readwrite', (s) => s.delete(key))
}

// ---------- 目录句柄 ----------

export function saveRootHandle(handle: DirHandle): Promise<IDBValidKey> {
  return idbPut(HANDLE_KEY, handle)
}

export function loadRootHandle(): Promise<DirHandle | undefined> {
  return idbGet<DirHandle>(HANDLE_KEY)
}

export function clearRootHandle(): Promise<undefined> {
  return idbDelete(HANDLE_KEY)
}
