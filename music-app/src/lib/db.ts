/**
 * Minimal promise wrapper around IndexedDB. Stores only references and
 * metadata snapshots — never audio files. All user data stays in the browser.
 */

const DB_NAME = 'anahad-db'
const DB_VERSION = 1

export type StoreName = 'playlists' | 'kv'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

async function withStore<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const os = tx.objectStore(store)
      let result: T | undefined
      const request = fn(os)
      if (request) {
        request.onsuccess = () => {
          result = request.result
        }
      }
      tx.oncomplete = () => resolve(result as T)
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  } finally {
    db.close()
  }
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return withStore<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  return withStore<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
}

export async function idbPut(store: StoreName, value: unknown, key?: string): Promise<void> {
  return withStore<void>(store, 'readwrite', (s) => {
    if (key !== undefined) s.put(value, key)
    else s.put(value)
  })
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  return withStore<void>(store, 'readwrite', (s) => {
    s.delete(key)
  })
}

export async function idbClear(store: StoreName): Promise<void> {
  return withStore<void>(store, 'readwrite', (s) => {
    s.clear()
  })
}

/** Wipe every local trace of the app (used by "Clear all local data"). */
export async function wipeLocalData(): Promise<void> {
  await Promise.all([idbClear('playlists'), idbClear('kv')])
  try {
    localStorage.clear()
  } catch {
    /* storage may be unavailable — nothing else to do */
  }
}
