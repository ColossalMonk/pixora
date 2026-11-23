import { RenderGrid } from './RenderGrid';

/**
 * WebGL2 renderer for a RenderGrid: one instanced draw call per frame.
 *
 * Every lit cell becomes one instance (column, row, atlas slot, glyph colour,
 * tile colour). Glyphs are drawn once into a texture atlas with the same font
 * and centring as the 2D Rasterizer, Braille as dot rectangles, so the two
 * renderers look alike; the 2D one stays as the fallback. (Both asciify.org and
 * ascii-magic draw this way; this is our own implementation.)
 *
 * The canvas is transparent: the page backdrop shows through, as with 2D.
 */

const VERT = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aCell;    // col, row, atlas slot
layout(location = 2) in vec4 aFg;      // glyph colour, premultiplied below
layout(location = 3) in vec4 aBg;      // tile colour
uniform vec2 uCell;                    // cell size in device px
uniform vec2 uView;                    // canvas size in device px
uniform vec2 uSlot;                    // atlas slot size in px
uniform vec2 uAtlasSize;               // atlas size in px
uniform float uSlotsPerRow;
out vec2 vLocal;                       // px inside the cell
out vec2 vUv;
out vec4 vFg;
out vec4 vBg;
void main() {
  vec2 px = (aCell.xy + aCorner) * uCell;
  vLocal = aCorner * uCell;
  float slot = aCell.z;
  vec2 origin = vec2(mod(slot, uSlotsPerRow), floor(slot / uSlotsPerRow)) * uSlot;
  vUv = (origin + aCorner * uCell) / uAtlasSize;
  vFg = aFg;
  vBg = aBg;
  vec2 clip = px / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vUv;
in vec4 vFg;
in vec4 vBg;
uniform sampler2D uAtlas;
uniform vec2 uCell;
uniform float uGap;
out vec4 outColor;
void main() {
  // Tile, inset by a hairline so the cell grid reads (same as the 2D renderer).
  float inside = step(uGap, vLocal.x) * step(vLocal.x, uCell.x - uGap)
               * step(uGap, vLocal.y) * step(vLocal.y, uCell.y - uGap);
  float bgA = vBg.a * inside;
  float g = texture(uAtlas, vUv).a * vFg.a;
  // Glyph over tile, premultiplied.
  vec3 rgb = vFg.rgb * g + vBg.rgb * bgA * (1.0 - g);
  float a = g + bgA * (1.0 - g);
  outColor = vec4(rgb, a);
}`;

/** The 2D renderer draws alpha in 8 steps; match it so both look the same. */
const quant = (a: number) => (a >= 1 ? 1 : Math.min(1, (Math.floor(a * 8) + 1) / 8));

export class GlyphGL {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private instanceBuf: WebGLBuffer;
  private atlasTex: WebGLTexture;
  private atlas = document.createElement('canvas');
  private atlasCtx: CanvasRenderingContext2D;
  private slots = new Map<number, number>();
  private atlasDirty = true;
  private slotW = 1;
  private slotH = 1;
  private slotsPerRow = 1;
  private atlasKey = '';
  private data = new ArrayBuffer(0);
  private f32 = new Float32Array(0);
  private u8 = new Uint8Array(0);
  private uni: Record<string, WebGLUniformLocation | null> = {};
  public lost = false;

  /** null when WebGL2 isn't available (the caller keeps the 2D renderer). */
  static create(canvas: HTMLCanvasElement): GlyphGL | null {
    try {
      const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
      if (!gl) return null;
      return new GlyphGL(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    this.program = p;
    for (const name of ['uCell', 'uView', 'uSlot', 'uAtlasSize', 'uAtlas', 'uSlotsPerRow', 'uGap']) {
      this.uni[name] = gl.getUniformLocation(p, name);
    }

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Instance layout (20 bytes): col, row, slot (3 × f32) + fg rgba + bg rgba (8 × u8).
    this.instanceBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    const stride = 20;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, stride, 12);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, stride, 16);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);

    this.atlasTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.atlasCtx = this.atlas.getContext('2d')!;
  }

  /** Lays out a fresh atlas for this cell size and font (glyphs are added as they appear). */
  private ensureAtlas(cw: number, ch: number, font: string, dpr: number): void {
    const key = `${cw}|${ch}|${font}|${dpr}`;
    if (key === this.atlasKey) return;
    this.atlasKey = key;
    this.slotW = Math.ceil(cw * dpr) + 1;
    this.slotH = Math.ceil(ch * dpr) + 1;
    this.slotsPerRow = Math.max(1, Math.floor(2048 / this.slotW));
    const rows = Math.ceil(640 / this.slotsPerRow);
    this.atlas.width = this.slotsPerRow * this.slotW;
    this.atlas.height = Math.min(4096, rows * this.slotH);
    this.slots.clear();
    this.atlasCtx.clearRect(0, 0, this.atlas.width, this.atlas.height);
    this.atlasDirty = true;
  }

  private slotFor(cp: number, cw: number, ch: number, font: string, dpr: number): number {
    let slot = this.slots.get(cp);
    if (slot !== undefined) return slot;
    slot = this.slots.size;
    const capacity = this.slotsPerRow * Math.floor(this.atlas.height / this.slotH);
    if (slot >= capacity) return 0; // atlas full (shouldn't happen): reuse slot 0
    this.slots.set(cp, slot);
    const g = this.atlasCtx;
    const x0 = (slot % this.slotsPerRow) * this.slotW;
    const y0 = Math.floor(slot / this.slotsPerRow) * this.slotH;
    g.save();
    g.setTransform(dpr, 0, 0, dpr, x0, y0);
    g.fillStyle = '#fff';
    if (cp >= 0x2800 && cp <= 0x28ff) {
      // Braille as dot rectangles, exactly as the 2D renderer draws them.
      const bits = cp - 0x2800;
      const dot = Math.max(1, Math.min(cw / 2, ch / 4) * 0.62);
      const sx = cw / 2;
      const sy = ch / 4;
      const ox = sx / 2 - dot / 2;
      const oy = sy / 2 - dot / 2;
      const on = [0x01, 0x02, 0x04, 0x40, 0x08, 0x10, 0x20, 0x80];
      for (let k = 0; k < 8; k++) {
        if (!(bits & on[k])) continue;
        const col = k < 4 ? 0 : 1;
        const row = k % 4;
        g.fillRect(ox + col * sx, oy + row * sy, dot, dot);
      }
    } else {
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String.fromCodePoint(cp), cw / 2, ch / 2);
    }
    g.restore();
    this.atlasDirty = true;
    return slot;
  }

  /** Draws the grid. Returns false if the context is gone (caller falls back to 2D). */
  public draw(grid: RenderGrid, width: number, height: number, dpr: number, font: string): boolean {
    if (this.lost) return false;
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const W = Math.round(width * dpr);
    const H = Math.round(height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    this.ensureAtlas(cw, ch, font, dpr);

    // Pack lit cells.
    const n = grid.size;
    if (this.data.byteLength < n * 20) {
      this.data = new ArrayBuffer(n * 20);
      this.f32 = new Float32Array(this.data);
      this.u8 = new Uint8Array(this.data);
    }
    const { f32, u8 } = this;
    const cols = grid.cols;
    const { glyph, fg, alpha, bg, bgAlpha, focus } = grid;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const fa = glyph[i] !== 0 ? alpha[i] * focus[i] : 0;
      const ba = bgAlpha[i] * focus[i];
      const hasFg = fa >= 0.04;
      const hasBg = ba >= 0.04;
      if (!hasFg && !hasBg) continue;
      const o = count * 5;
      f32[o] = i % cols;
      f32[o + 1] = (i / cols) | 0;
      f32[o + 2] = hasFg ? this.slotFor(glyph[i], cw, ch, font, dpr) : 0;
      const b = o * 4 + 12;
      const c = fg[i];
      u8[b] = (c >> 16) & 255;
      u8[b + 1] = (c >> 8) & 255;
      u8[b + 2] = c & 255;
      u8[b + 3] = hasFg ? Math.round(quant(fa) * 255) : 0;
      const t = bg[i];
      u8[b + 4] = (t >> 16) & 255;
      u8[b + 5] = (t >> 8) & 255;
      u8[b + 6] = t & 255;
      u8[b + 7] = hasBg ? Math.round(quant(ba) * 255) : 0;
      count++;
    }

    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (count === 0) return true;

    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    if (this.atlasDirty) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas);
      this.atlasDirty = false;
    }
    gl.uniform2f(this.uni.uCell, cw * dpr, ch * dpr);
    gl.uniform2f(this.uni.uView, W, H);
    gl.uniform2f(this.uni.uSlot, this.slotW, this.slotH);
    gl.uniform2f(this.uni.uAtlasSize, this.atlas.width, this.atlas.height);
    gl.uniform1f(this.uni.uSlotsPerRow, this.slotsPerRow);
    gl.uniform1f(this.uni.uGap, Math.min(1, cw * 0.06) * dpr);
    gl.uniform1i(this.uni.uAtlas, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.u8.subarray(0, count * 20), gl.STREAM_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
    return true;
  }

  /** Clears the canvas (switching away from a custom slot). */
  public clear(): void {
    if (this.lost) return;
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}
