import React, { useState, useRef } from 'react';
import { X, Upload, Copy, Check, Download, Image as ImageIcon, Sparkles } from 'lucide-react';
import { ImageProcessor, ProcessedAsciiResult } from '../../engine/image-converter/ImageProcessor';
import { CharacterStyle } from '../../types/engine';

interface ImageConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImageConverterModal: React.FC<ImageConverterModalProps> = ({ isOpen, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [cols, setCols] = useState(100);
  const [style, setStyle] = useState<CharacterStyle>('ascii-standard');
  const [invert, setInvert] = useState(false);
  const [useSobel, setUseSobel] = useState(true);
  const [result, setResult] = useState<ProcessedAsciiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const processFile = async (selectedFile: File) => {
    setLoading(true);
    setFile(selectedFile);
    try {
      const res = await ImageProcessor.processImage(selectedFile, cols, style, invert, useSobel);
      setResult(res);
    } catch (e) {
      console.error(e);
      alert('Failed to process image');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleReprocess = async (
    newCols = cols,
    newStyle = style,
    newInvert = invert,
    newSobel = useSobel
  ) => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await ImageProcessor.processImage(file, newCols, newStyle, newInvert, newSobel);
      setResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownloadTxt = () => {
    if (!result) return;
    const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pixora-ascii-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="glass-panel w-full max-w-4xl max-h-[90vh] rounded-3xl p-6 overflow-hidden border border-white/10 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-400/10 text-teal-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Image to ASCII Studio</h2>
              <p className="text-xs text-slate-400">
                Convert your images into character-based artwork using luminance & Sobel contours
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {!result && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/15 hover:border-teal-400/50 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-white/5"
            >
              <Upload className="w-10 h-10 text-slate-400 mb-3" />
              <p className="text-sm font-medium text-slate-200">
                Click to upload an image, or drag and drop
              </p>
              <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP or GIF</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl glass-panel-subtle border border-white/5 text-xs">
                {/* Style selector */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">Style:</span>
                  <select
                    value={style}
                    onChange={(e) => {
                      const s = e.target.value as CharacterStyle;
                      setStyle(s);
                      handleReprocess(cols, s, invert, useSobel);
                    }}
                    className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-slate-200 outline-none"
                  >
                    <option value="ascii-standard">Standard ASCII</option>
                    <option value="ascii-dense">Dense ASCII (70)</option>
                    <option value="blocks">Blocks & Shading</option>
                    <option value="geometric">Geometric</option>
                  </select>
                </div>

                {/* Resolution slider */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">Width ({cols} chars):</span>
                  <input
                    type="range"
                    min="50"
                    max="160"
                    step="5"
                    value={cols}
                    onChange={(e) => {
                      const c = Number(e.target.value);
                      setCols(c);
                      handleReprocess(c, style, invert, useSobel);
                    }}
                    className="w-28 accent-teal-400 cursor-pointer"
                  />
                </div>

                {/* Toggles */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={useSobel}
                      onChange={(e) => {
                        setUseSobel(e.target.checked);
                        handleReprocess(cols, style, invert, e.target.checked);
                      }}
                      className="accent-teal-400 rounded"
                    />
                    <span>Sobel Contours</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={invert}
                      onChange={(e) => {
                        setInvert(e.target.checked);
                        handleReprocess(cols, style, e.target.checked, useSobel);
                      }}
                      className="accent-teal-400 rounded"
                    />
                    <span>Invert</span>
                  </label>
                </div>
              </div>

              {/* Character Output Display */}
              <div className="relative rounded-2xl bg-black/80 border border-white/10 p-4 max-h-[50vh] overflow-auto select-text font-mono text-[9px] leading-[10px] text-teal-300 shadow-inner whitespace-pre">
                {result.text}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setFile(null);
                  }}
                  className="px-3.5 py-1.5 rounded-xl glass-button text-xs text-slate-300 flex items-center gap-1.5"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Choose another image
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3.5 py-1.5 rounded-xl glass-button text-xs text-slate-200 flex items-center gap-1.5 hover:text-white"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy Text'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTxt}
                    className="px-4 py-1.5 rounded-xl bg-teal-400 text-slate-950 font-medium text-xs hover:bg-teal-300 transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .txt</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
