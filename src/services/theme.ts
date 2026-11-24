import { useEffect, useSyncExternalStore } from 'react';
import type { Appearance } from '../types/settings';

export type ResolvedTheme = 'light' | 'dark';

/** Last resolved theme, read before React renders so a new tab doesn't flash. */
const CACHE_KEY = 'pixora_theme';

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null;

export function resolveTheme(appearance: Appearance, systemLight: boolean): ResolvedTheme {
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return systemLight ? 'light' : 'dark';
}

/** Sets data-theme on <html> (the CSS variables follow it) and remembers it. */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(CACHE_KEY, theme);
  } catch {
    /* storage blocked: fine, only the first paint is affected */
  }
}

/** Called in main.tsx before the first render. */
export function applyCachedTheme(): void {
  let theme: ResolvedTheme | null = null;
  try {
    const v = localStorage.getItem(CACHE_KEY);
    if (v === 'light' || v === 'dark') theme = v;
  } catch {
    /* ignore */
  }
  applyTheme(theme ?? (media?.matches ? 'light' : 'dark'));
}

const subscribeSystem = (fn: () => void) => {
  media?.addEventListener('change', fn);
  return () => media?.removeEventListener('change', fn);
};

/** The theme in effect for this appearance setting; keeps <html data-theme> in sync. */
export function useResolvedTheme(appearance: Appearance): ResolvedTheme {
  const systemLight = useSyncExternalStore(subscribeSystem, () => !!media?.matches, () => false);
  const theme = resolveTheme(appearance, systemLight);
  useEffect(() => applyTheme(theme), [theme]);
  return theme;
}
