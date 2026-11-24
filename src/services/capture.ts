/**
 * Save the current frame as a PNG. The live scene registers a function that
 * draws a fresh frame and returns it as one canvas (WebGL layers are only
 * readable in the same task they were drawn, so capture redraws first).
 */

type Capturer = () => HTMLCanvasElement | null;

let capturer: Capturer | null = null;

export function registerCapturer(fn: Capturer): () => void {
  capturer = fn;
  return () => {
    if (capturer === fn) capturer = null;
  };
}

/** pixora-koi-2026-11-24-1532.png */
export function frameFileName(scene: string, at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const slug = scene.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene';
  return `pixora-${slug}-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.png`;
}

/** Captures the frame and downloads it. Resolves false if there was nothing to capture. */
export async function saveFrame(sceneName: string): Promise<boolean> {
  const canvas = capturer?.();
  if (!canvas) return false;
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = frameFileName(sceneName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
