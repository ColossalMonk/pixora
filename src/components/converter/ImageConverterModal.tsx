import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, Copy, Check, Download, Image as ImageIcon, Eye, FileText } from 'lucide-react';
import {
  AsciiResult,
  Charset,
  ColorMode,
  ConvertOptions,
  DEFAULT_CONVERT,
  RenderMode,
  convert,
  drawResult,
  loadImage,
} from '../../engine/image-converter/ImageProcessor';
import { useEscape } from '../common/useEscape';

interface ImageConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODES: { id: RenderMode; label: string; hint: string }[] = [
  { id: 'characters', label: 'Characters', hint: 'Classic ASCII' },
  { id: 'braille', label: 'Braille', hint: 'Fine dithered dots' },
  { id: 'blocks', label: 'Blocks', hint: 'Half-block pixels' },
];
const COLORS: { id: ColorMode; label: string; swatch: string }[] = [
  { id: 'full', label: 'Full colour', swatch: 'linear-gradient(135deg,#f97316,#22c55e,#3b82f6)' },
  { id: 'mono', label: 'Mono', swatch: '#e5e7eb' },
  { id: 'matrix', label: 'Matrix', swatch: '#22c55e' },
  { id: 'amber', label: 'Amber', swatch: '#f59e0b' },
];
const CHARSETS: { id: Charset; label: string }[] = [
  { id: 'standard', label: 'Standard  .:-=+*#%@' },
  { id: 'detailed', label: 'Detailed  .,:;-~=+*xX#%@' },
  { id: 'dense', label: 'Dense (70 glyphs)' },
  { id: 'shapes', label: 'Shapes  ·•○●█' },
];

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, format, onChange }) => (
  <label className="block">
    <span className="flex justify-between text-[11px] text-slate-400 mb-1">
      <span>{label}</span>
      <span className="font-mono text-slate-300">{format ? format(value) : value}</span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-teal-400 cursor-pointer"
    />
  </label>
);

export const ImageConverterModal: React.FC<ImageConverterModalProps> = ({ isOpen, onClose }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [opts, setOpts] = useState<ConvertOptions>(DEFAULT_CONVERT);
  const [result, setResult] = useState<AsciiResult | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEscape(isOpen, onClose);

  const set = <K extends keyof ConvertOptions>(k: K, v: ConvertOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const openFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.');
      return;
    }
    try {
      setError('');
      const img = await loadImage(file);
      setImage(img);
      setFileName(file.name);
      setShowOriginal(false);
    } catch {
      setError('Could not read that image.');
    }
  }, []);

  // Convert whenever the image or options change (debounced for slider drags).
  useEffect(() => {
    if (!image) return;
    const id = window.setTimeout(() => setResult(convert(image, opts)), 40);
    return () => window.clearTimeout(id);
  }, [image, opts]);

  // Draw the result to the preview canvas.
  useEffect(() => {
    if (!result || !canvasRef.current) return;
    drawResult(canvasRef.current, result, 12, '#05060a');
  }, [result]);

  // Paste an image from the clipboard.
  useEffect(() => {
    if (!isOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'));
      if (f) openFile(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [isOpen, openFile]);

  if (!isOpen) return null;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'));
    if (f) openFile(f);
  };

  const baseName = (fileName.replace(/\.[^.]+$/, '') || 'pixora') + '-ascii';

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportPng = () => {
    if (!result) return;
    const c = document.createElement('canvas');
    drawResult(c, result, 16, '#05060a', 2);
    c.toBlob((b) => b && download(b, `${baseName}.png`), 'image/png');
  };

  const exportTxt = () => {
    if (!result) return;
    download(new Blob([result.text], { type: 'text/plain;charset=utf-8' }), `${baseName}.txt`);
  };

  const copyText = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-fade-in"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="ASCII Studio"
    >
      <div className="glass-panel w-full max-w-6xl h-[90vh] rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 text-purple-300 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">ASCII Studio</h2>
            {fileName && <span className="text-xs text-slate-500 truncate">/ {fileName}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {image && (
              <>
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs ${showOriginal ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'}`}
                  title="Compare with the original"
                >
                  <Eye className="w-3.5 h-3.5" /> Original
                </button>
                <button type="button" onClick={copyText} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-slate-300 hover:bg-white/10">
                  {copied ? <Check className="w-3.5 h-3.5 text-teal-300" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" onClick={exportTxt} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-slate-300 hover:bg-white/10">
                  <FileText className="w-3.5 h-3.5" /> .txt
                </button>
                <button type="button" onClick={exportPng} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white text-slate-900 hover:bg-slate-200">
                  <Download className="w-3.5 h-3.5" /> PNG
                </button>
              </>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 ml-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Preview */}
          <div
            className={`relative flex-1 min-h-0 flex items-center justify-center p-4 bg-black/40 ${dragging ? 'ring-2 ring-inset ring-teal-400/60' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {!image ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 w-full max-w-md aspect-video rounded-2xl border border-dashed border-white/15 hover:border-teal-400/50 hover:bg-white/[0.03] transition-colors text-slate-300"
              >
                <Upload className="w-7 h-7 text-teal-300" />
                <span className="text-sm">Drop an image, paste one, or click to choose</span>
                <span className="text-[11px] text-slate-500">Everything stays on your computer</span>
              </button>
            ) : showOriginal ? (
              <img src={image.src} alt="Original" className="max-w-full max-h-full object-contain rounded-lg" />
            ) : (
              <canvas ref={canvasRef} className="max-w-full max-h-full object-contain rounded-lg" style={{ imageRendering: 'auto' }} />
            )}
            {error && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-rose-300 bg-rose-950/60 px-3 py-1.5 rounded-full">{error}</div>}
            {result && !showOriginal && (
              <div className="absolute bottom-3 right-4 text-[11px] font-mono text-slate-500">
                {MODES.find((m) => m.id === opts.mode)?.label} · {result.cols} × {result.rows}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) openFile(f);
                e.target.value = '';
              }}
            />
          </div>

          {/* Controls */}
          <aside className="w-full md:w-72 shrink-0 border-t md:border-t-0 md:border-l border-white/10 p-4 overflow-y-auto space-y-5 text-xs">
            <section>
              <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Render style</h3>
              <div className="grid grid-cols-3 gap-1.5">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => set('mode', m.id)}
                    title={m.hint}
                    className={`px-2 py-2 rounded-xl border text-[11px] transition-colors ${
                      opts.mode === m.id ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Colour</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set('color', c.id)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[11px] ${
                      opts.color === c.id ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full" style={{ background: c.swatch }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Detail & tone</h3>
              <Slider label="Columns" value={opts.cols} min={40} max={300} step={5} onChange={(v) => set('cols', v)} />
              <Slider label="Brightness" value={opts.brightness} min={-0.4} max={0.4} step={0.02} format={(v) => (v > 0 ? '+' : '') + v.toFixed(2)} onChange={(v) => set('brightness', v)} />
              <Slider label="Contrast" value={opts.contrast} min={0.5} max={2} step={0.05} format={(v) => v.toFixed(2) + '×'} onChange={(v) => set('contrast', v)} />
              <Slider label="Gamma" value={opts.gamma} min={0.5} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set('gamma', v)} />
            </section>

            {opts.mode === 'characters' && (
              <section className="space-y-2">
                <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Characters</h3>
                <select
                  value={opts.charset}
                  onChange={(e) => set('charset', e.target.value as Charset)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-slate-200 outline-none font-mono text-[11px]"
                >
                  {CHARSETS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                  <span>Edge strokes (/ | \ -)</span>
                  <input type="checkbox" checked={opts.edges} onChange={(e) => set('edges', e.target.checked)} className="accent-teal-400" />
                </label>
              </section>
            )}

            <section className="space-y-2">
              <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                <span>Invert</span>
                <input type="checkbox" checked={opts.invert} onChange={(e) => set('invert', e.target.checked)} className="accent-teal-400" />
              </label>
              <button type="button" onClick={() => setOpts(DEFAULT_CONVERT)} className="text-[11px] text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline">
                Reset settings
              </button>
            </section>

            {image && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5"
              >
                <Upload className="w-3.5 h-3.5" /> Choose another image
              </button>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};
