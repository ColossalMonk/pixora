import React, { useState } from 'react';
import { Plus, X, Globe } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';

export const ShortcutsBar: React.FC = () => {
  const { shortcuts, showShortcuts, addShortcut, removeShortcut } = useSettingsStore();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  if (!showShortcuts) return null;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    let finalTitle = title.trim();
    if (!finalTitle) {
      try {
        finalTitle = new URL(finalUrl).hostname.replace(/^www\./, '');
      } catch {
        finalTitle = 'Website';
      }
    }

    addShortcut({ title: finalTitle, url: finalUrl });
    setTitle('');
    setUrl('');
    setIsAddOpen(false);
  };

  const getFaviconUrl = (siteUrl: string) => {
    try {
      const domain = new URL(siteUrl).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {
      return '';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 mt-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {shortcuts.map((shortcut) => {
          const favicon = getFaviconUrl(shortcut.url);
          return (
            <div
              key={shortcut.id}
              className="group relative flex flex-col items-center justify-center w-20 h-20 rounded-2xl bg-surface/80 hover:bg-surface-2/95 backdrop-blur-2xl border border-white/12 hover:border-white/25 shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-200 cursor-pointer text-slate-300 hover:text-white"
            >
              {/* Delete button on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeShortcut(shortcut.id);
                }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800/90 text-slate-400 hover:text-white border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Remove shortcut"
              >
                <X className="w-3 h-3" />
              </button>

              <a
                href={shortcut.url}
                className="flex flex-col items-center justify-center w-full h-full p-2"
              >
                <div className="w-9 h-9 rounded-xl bg-white/[0.08] group-hover:bg-white/[0.14] flex items-center justify-center mb-1 shadow-inner border border-white/5 transition-colors overflow-hidden">
                  {favicon ? (
                    <img
                      src={favicon}
                      alt={shortcut.title}
                      className="w-5 h-5 object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Globe className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <span className="text-[11px] font-medium text-slate-200 group-hover:text-white truncate max-w-[68px] drop-shadow-[0_1px_4px_rgb(var(--c-black)/0.9)]">
                  {shortcut.title}
                </span>
              </a>
            </div>
          );
        })}

        {/* Quick Add Button */}
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="flex flex-col items-center justify-center w-20 h-20 rounded-2xl bg-surface/60 hover:bg-surface-2/90 backdrop-blur-2xl border border-dashed border-white/20 hover:border-teal-400/50 text-slate-400 hover:text-teal-300 hover:scale-105 transition-all duration-200 shadow-lg"
          title="Add shortcut"
        >
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center mb-1">
            <Plus className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-medium truncate">Add</span>
        </button>
      </div>

      {/* Add Shortcut Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-100">Add New Shortcut</h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Website Name (Optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. GitHub"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-400/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Website URL *
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="e.g. github.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-400/50"
                  autoFocus
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 rounded-xl glass-button text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-teal-400 text-slate-950 font-medium text-xs hover:bg-teal-300 transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
