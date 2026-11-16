import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, Sparkles, Globe, Shield, Flame, Compass } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { SEARCH_ENGINES, SearchService, asUrl } from '../../services/searchService';
import { SearchEngineId } from '../../types/settings';

const ENGINE_ICONS: Record<string, React.ReactNode> = {
  search: <Search className="w-4 h-4" />,
  shield: <Shield className="w-4 h-4 text-emerald-400" />,
  compass: <Compass className="w-4 h-4 text-sky-400" />,
  flame: <Flame className="w-4 h-4 text-amber-500" />,
  'tree-pine': <Sparkles className="w-4 h-4 text-teal-400" />,
  globe: <Globe className="w-4 h-4 text-indigo-400" />,
};

export const CentralSearchBar: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const { searchEngine, customSearchUrl, setSearchEngine } = useSettingsStore();
  const currentEngine = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.google;
  const looksLikeUrl = asUrl(query) !== null;

  // Press "/" to focus search; "Esc" to blur
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement !== inputRef.current &&
        !['INPUT', 'TEXTAREA'].includes((document.activeElement?.tagName || ''))
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        if (inputRef.current?.value) setQuery('');
        else inputRef.current?.blur();
        setIsDropdownOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    SearchService.executeSearch(query, searchEngine, customSearchUrl);
  };

  return (
    <div className="relative z-30 w-full max-w-xl mx-auto px-4">
      <form
        onSubmit={handleSearch}
        className="relative flex items-center glass-panel rounded-2xl px-3 py-2.5 transition-all duration-300 focus-within:ring-2 focus-within:ring-teal-400/40 focus-within:border-teal-400/50 shadow-2xl"
      >
        {/* Search Engine Selector Pill */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-button text-xs font-medium text-slate-300 hover:text-white"
            title="Change search engine"
          >
            {ENGINE_ICONS[currentEngine.icon] || <Search className="w-4 h-4" />}
            <span className="hidden sm:inline">{currentEngine.name}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {/* Engine Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute left-0 mt-2 w-48 rounded-xl glass-panel p-1.5 z-50 shadow-2xl animate-fade-in border border-white/10">
              <div className="text-[10px] uppercase font-semibold text-slate-400 px-2 py-1 tracking-wider">
                Search Engine
              </div>
              {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => {
                const engine = SEARCH_ENGINES[id];
                const isSelected = searchEngine === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSearchEngine(id);
                      setIsDropdownOpen(false);
                      inputRef.current?.focus();
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                      isSelected
                        ? 'bg-teal-500/20 text-teal-300 font-medium'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {ENGINE_ICONS[engine.icon]}
                      <span>{engine.name}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-teal-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Text Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${currentEngine.name}, type a URL, or !d / !b …`}
          aria-label="Search or enter address"
          className="flex-1 bg-transparent border-none outline-none px-3 text-sm md:text-base text-slate-100 placeholder:text-slate-500 font-normal"
          autoFocus
        />

        {/* Clear or Search Action */}
        <div className="flex items-center gap-1.5">
          {query.trim() && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 text-xs"
            >
              ✕
            </button>
          )}
          <button
            type="submit"
            className="p-1.5 rounded-xl bg-teal-400/20 text-teal-300 hover:bg-teal-400/30 transition-colors"
            title={looksLikeUrl ? 'Open address' : 'Search'}
          >
            {looksLikeUrl ? <Globe className="w-4 h-4" /> : <Search className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
};
