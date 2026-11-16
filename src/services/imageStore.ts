/**
 * Keeps the user's wallpaper image on their machine (IndexedDB). Nothing is
 * uploaded anywhere; chrome.storage would cap the size, IndexedDB does not.
 */
const DB = 'pixora-media';
const STORE = 'files';
const KEY = 'wallpaper';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export const ImageStore = {
  async save(blob: Blob): Promise<void> {
    await run('readwrite', (s) => s.put(blob, KEY));
  },
  async load(): Promise<Blob | null> {
    try {
      const v = await run<Blob | undefined>('readonly', (s) => s.get(KEY) as IDBRequest<Blob | undefined>);
      return v ?? null;
    } catch {
      return null;
    }
  },
  async clear(): Promise<void> {
    await run('readwrite', (s) => s.delete(KEY));
  },
};
