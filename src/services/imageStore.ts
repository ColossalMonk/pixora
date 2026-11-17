import { CustomSlotId } from '../types/environment';

/**
 * Keeps the user's custom images on their machine (IndexedDB).
 * Supports up to 3 custom image slots ('custom-1', 'custom-2', 'custom-3').
 */
const DB = 'pixora-media';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
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

type SlotListener = (slot: CustomSlotId) => void;
const listeners = new Set<SlotListener>();

export const ImageStore = {
  subscribe(fn: SlotListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  notify(slot: CustomSlotId): void {
    listeners.forEach((fn) => {
      try {
        fn(slot);
      } catch (err) {
        console.error('Error notifying image store listener', err);
      }
    });
  },

  async saveImage(slot: CustomSlotId, blob: Blob): Promise<void> {
    await run('readwrite', (s) => s.put(blob, slot));
    this.notify(slot);
  },

  async loadImage(slot: CustomSlotId): Promise<Blob | null> {
    try {
      let v = await run<Blob | undefined>('readonly', (s) => s.get(slot) as IDBRequest<Blob | undefined>);
      // Legacy fallback for slot 1: check old 'wallpaper' key
      if (!v && slot === 'custom-1') {
        v = await run<Blob | undefined>('readonly', (s) => s.get('wallpaper') as IDBRequest<Blob | undefined>);
      }
      return v ?? null;
    } catch {
      return null;
    }
  },

  async deleteImage(slot: CustomSlotId): Promise<void> {
    await run('readwrite', (s) => s.delete(slot));
    if (slot === 'custom-1') {
      try {
        await run('readwrite', (s) => s.delete('wallpaper'));
      } catch {}
    }
    this.notify(slot);
  },

  async hasImage(slot: CustomSlotId): Promise<boolean> {
    const img = await this.loadImage(slot);
    return img !== null;
  },

  async getMediaType(slot: CustomSlotId): Promise<'video' | 'image' | 'none'> {
    const blob = await this.loadImage(slot);
    if (!blob) return 'none';
    return blob.type.startsWith('video/') ? 'video' : 'image';
  },
};
