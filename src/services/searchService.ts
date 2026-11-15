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

export class SearchService {
  public static executeSearch(
    query: string,
    engineId: SearchEngineId,
    customUrl?: string
  ): void {
    if (!query.trim()) return;

    let targetTemplate = SEARCH_ENGINES[engineId]?.searchUrl || SEARCH_ENGINES.google.searchUrl;
    if (engineId === 'custom' && customUrl?.trim()) {
      targetTemplate = customUrl.includes('%s') ? customUrl : `${customUrl}%s`;
    }

    const encoded = encodeURIComponent(query.trim());
    const finalUrl = targetTemplate.replace('%s', encoded);
    window.location.href = finalUrl;
  }
}
