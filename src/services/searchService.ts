import { SearchEngine, SearchEngineId } from '../types/settings';

export const SEARCH_ENGINES: Record<SearchEngineId, SearchEngine> = {
  google: {
    id: 'google',
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q=%s',
    icon: 'search',
  },
  duckduckgo: {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    searchUrl: 'https://duckduckgo.com/?q=%s',
    icon: 'shield',
  },
  bing: {
    id: 'bing',
    name: 'Bing',
    searchUrl: 'https://www.bing.com/search?q=%s',
    icon: 'compass',
  },
  brave: {
    id: 'brave',
    name: 'Brave Search',
    searchUrl: 'https://search.brave.com/search?q=%s',
    icon: 'flame',
  },
  ecosia: {
    id: 'ecosia',
    name: 'Ecosia',
    searchUrl: 'https://www.ecosia.org/search?q=%s',
    icon: 'tree-pine',
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    searchUrl: '',
    icon: 'globe',
  },
};

/** Bang shortcuts: "!d cats" searches DuckDuckGo regardless of the default engine. */
const BANGS: Record<string, SearchEngineId> = {
  '!g': 'google',
  '!d': 'duckduckgo',
  '!ddg': 'duckduckgo',
  '!b': 'bing',
  '!br': 'brave',
  '!e': 'ecosia',
};

/** Returns a navigable URL if the input looks like one, else null. */
export function asUrl(input: string): string | null {
  const q = input.trim();
  if (!q || /\s/.test(q)) return null;
  if (/^(https?|ftp|chrome|edge|about|file):/i.test(q)) return q;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(q)) return `http://${q}`;
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(q)) return `http://${q}`;
  // domain.tld with an alphabetic TLD of 2+ chars, optional port/path
  if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(q)) return `https://${q}`;
  return null;
}

export class SearchService {
  public static resolve(query: string, engineId: SearchEngineId, customUrl?: string): string | null {
    let q = query.trim();
    if (!q) return null;
    const url = asUrl(q);
    if (url) return url;

    let engine = engineId;
    const bang = q.split(/\s+/)[0].toLowerCase();
    if (BANGS[bang]) {
      engine = BANGS[bang];
      q = q.slice(bang.length).trim();
      if (!q) return null;
    }

    let template = SEARCH_ENGINES[engine]?.searchUrl || SEARCH_ENGINES.google.searchUrl;
    if (engine === 'custom') {
      template = customUrl?.trim() ? (customUrl.includes('%s') ? customUrl : `${customUrl}%s`) : SEARCH_ENGINES.google.searchUrl;
    }
    return template.replace('%s', encodeURIComponent(q));
  }

  public static executeSearch(query: string, engineId: SearchEngineId, customUrl?: string): void {
    const target = this.resolve(query, engineId, customUrl);
    if (target) window.location.href = target;
  }
}
