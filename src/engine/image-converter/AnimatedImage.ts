/**
 * Animated GIF / WebP / APNG / AVIF for custom slots, through the WebCodecs
 * ImageDecoder (Chrome, Edge, Brave). Frames are decoded one at a time as they
 * fall due, so a long GIF never sits in memory as hundreds of bitmaps.
 * Where ImageDecoder is missing, open() returns null and the slot shows the
 * first frame through a plain <img>, as before.
 */

/** Browsers stretch GIF delays of 0–10 ms to 100 ms; do the same. */
export function frameDelayMs(durationMicros: number | null | undefined): number {
  const ms = (durationMicros ?? 0) / 1000;
  return ms <= 10 ? 100 : ms;
}

export const ANIMATABLE_TYPES = ['image/gif', 'image/webp', 'image/png', 'image/apng', 'image/avif'];

interface DecodedFrame {
  image: VideoFrame;
}
interface ImageTrackLike {
  animated: boolean;
  frameCount: number;
}
interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: ImageTrackLike | null };
  completed: Promise<void>;
  decode(opts: { frameIndex: number }): Promise<DecodedFrame>;
  close(): void;
}
type ImageDecoderCtor = {
  new (init: { data: BufferSource; type: string }): ImageDecoderLike;
  isTypeSupported?(type: string): Promise<boolean>;
};

export class AnimatedImage {
  /** The frame on screen (a VideoFrame, drawable like an image). */
  public frame: VideoFrame;
  /** Counts frames shown, so the scene re-samples once per new frame. */
  public frames = 0;
  private index = 0;
  private elapsed = 0;
  private delay: number;
  private pending = false;
  private closed = false;

  private constructor(
    private decoder: ImageDecoderLike,
    private count: number,
    first: VideoFrame,
  ) {
    this.frame = first;
    this.delay = frameDelayMs(first.duration);
  }

  /** An animated image, or null (not animated, unsupported type, or no ImageDecoder). */
  static async open(blob: Blob): Promise<AnimatedImage | null> {
    const Ctor = (globalThis as unknown as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder;
    if (!Ctor || !ANIMATABLE_TYPES.includes(blob.type)) return null;
    let decoder: ImageDecoderLike | null = null;
    try {
      if (Ctor.isTypeSupported && !(await Ctor.isTypeSupported(blob.type))) return null;
      decoder = new Ctor({ data: await blob.arrayBuffer(), type: blob.type });
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;
      if (!track || !track.animated) {
        decoder.close();
        return null;
      }
      await decoder.completed;
      if (track.frameCount < 2) {
        decoder.close();
        return null;
      }
      const first = await decoder.decode({ frameIndex: 0 });
      return new AnimatedImage(decoder, track.frameCount, first.image);
    } catch {
      decoder?.close();
      return null;
    }
  }

  get width() {
    return this.frame.displayWidth;
  }

  get height() {
    return this.frame.displayHeight;
  }

  /** Moves the clock on; decodes the next frame once the current one has had its time. */
  advance(dtMs: number): void {
    if (this.closed) return;
    this.elapsed += dtMs;
    if (this.pending || this.elapsed < this.delay) return;
    this.pending = true;
    const next = (this.index + 1) % this.count;
    this.decoder
      .decode({ frameIndex: next })
      .then(({ image }) => {
        if (this.closed) {
          image.close();
          return;
        }
        this.frame.close();
        this.frame = image;
        this.index = next;
        // Carry the overshoot, but don't try to catch up after a long pause.
        this.elapsed = Math.min(this.elapsed - this.delay, 250);
        this.delay = frameDelayMs(image.duration);
        this.frames++;
      })
      .catch(() => {})
      .finally(() => {
        this.pending = false;
      });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.frame.close();
    } catch {
      /* already closed */
    }
    this.decoder.close();
  }
}
