import { ImageStore } from '../../services/imageStore';
import { loadImage } from '../../engine/image-converter/ImageProcessor';
import { Wallpaper } from '../../engine/environments/ImageWorld';
import { useSettingsStore } from '../../store/useSettingsStore';

/** Listeners (the canvas) that re-seed the scene when the wallpaper changes. */
const listeners = new Set<() => void>();
export function onWallpaperChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

/** Saves a picture locally, decodes it, and shows the Your Image world. */
export async function setWallpaperFile(file: Blob): Promise<void> {
  if (!file.type.startsWith('image/')) return;
  const img = await loadImage(file);
  await ImageStore.save(file);
  Wallpaper.set(img, useSettingsStore.getState().wallpaper);
  useSettingsStore.getState().showScene('world', 'your-image');
  notify();
}

export async function clearWallpaper(): Promise<void> {
  await ImageStore.clear();
  Wallpaper.set(null);
  notify();
}

/** On start-up: restore the saved picture, if any. */
export async function restoreWallpaper(): Promise<void> {
  const blob = await ImageStore.load();
  if (!blob) return;
  try {
    const img = await loadImage(blob);
    Wallpaper.set(img, useSettingsStore.getState().wallpaper);
    notify();
  } catch {
    /* corrupt or unsupported: ignore */
  }
}
