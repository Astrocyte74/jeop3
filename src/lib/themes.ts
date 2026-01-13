export type ThemeKey = 'classic' | 'sunset' | 'forest' | 'purple' | 'ocean' | 'rose' | 'ember' | 'midnight';
export type IconSize = '128' | '256' | '512' | '1024';

export type Theme = {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  gold: string;
  danger: string;
  success: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
};

export const themes: Record<ThemeKey, Theme> = {
  classic: {
    name: 'Classic Blue',
    primary: '#0055a4',
    secondary: '#003366',
    accent: '#ffcc00',
    gold: '#ffd700',
    danger: '#dc3545',
    success: '#28a745',
    bgStart: '#0a0a20',
    bgMid: '#1a1a40',
    bgEnd: '#0a0a20',
  },
  sunset: {
    name: 'Sunset Orange',
    primary: '#ff6b35',
    secondary: '#f7931e',
    accent: '#fff59d',
    gold: '#ffd54f',
    danger: '#c62828',
    success: '#2e7d32',
    bgStart: '#1a0a10',
    bgMid: '#2a1a20',
    bgEnd: '#1a0a10',
  },
  forest: {
    name: 'Forest Green',
    primary: '#2d5a27',
    secondary: '#1a3a18',
    accent: '#aed581',
    gold: '#cddc39',
    danger: '#c62828',
    success: '#1b5e20',
    bgStart: '#0a1a08',
    bgMid: '#1a2a18',
    bgEnd: '#0a1a08',
  },
  purple: {
    name: 'Royal Purple',
    primary: '#6b3fa0',
    secondary: '#4a2570',
    accent: '#ce93d8',
    gold: '#e1bee7',
    danger: '#c62828',
    success: '#2e7d32',
    bgStart: '#1a0a1e',
    bgMid: '#2a1a3e',
    bgEnd: '#1a0a1e',
  },
  ocean: {
    name: 'Ocean Blue',
    primary: '#0077be',
    secondary: '#004466',
    accent: '#4dd0e1',
    gold: '#26c6da',
    danger: '#c62828',
    success: '#2e7d32',
    bgStart: '#0a1a1a',
    bgMid: '#0a2a3a',
    bgEnd: '#0a1a1a',
  },
  rose: {
    name: 'Rose Pink',
    primary: '#e91e63',
    secondary: '#880e4f',
    accent: '#f48fb1',
    gold: '#f06292',
    danger: '#b71c1c',
    success: '#2e7d32',
    bgStart: '#1a0a12',
    bgMid: '#2a1a22',
    bgEnd: '#1a0a12',
  },
  ember: {
    name: 'Ember Red',
    primary: '#d32f2f',
    secondary: '#b71c1c',
    accent: '#ffcc80',
    gold: '#ffa726',
    danger: '#b71c1c',
    success: '#1b5e20',
    bgStart: '#1a0808',
    bgMid: '#2a1818',
    bgEnd: '#1a0808',
  },
  midnight: {
    name: 'Midnight Dark',
    primary: '#1a1a2e',
    secondary: '#16213e',
    accent: '#e94560',
    gold: '#ffd700',
    danger: '#e94560',
    success: '#00ff88',
    bgStart: '#050510',
    bgMid: '#0f0f23',
    bgEnd: '#050510',
  },
};

const THEME_KEY = 'jeop3:theme';

export function getTheme(key: ThemeKey = 'classic'): Theme {
  return themes[key] || themes.classic;
}

export function applyTheme(themeKey: ThemeKey): void {
  const theme = getTheme(themeKey);
  const root = document.documentElement;

  root.style.setProperty('--theme-primary', theme.primary);
  root.style.setProperty('--theme-secondary', theme.secondary);
  root.style.setProperty('--theme-accent', theme.accent);
  root.style.setProperty('--theme-gold', theme.gold);
  root.style.setProperty('--theme-danger', theme.danger);
  root.style.setProperty('--theme-success', theme.success);
  root.style.setProperty('--theme-bg-start', theme.bgStart);
  root.style.setProperty('--theme-bg-mid', theme.bgMid);
  root.style.setProperty('--theme-bg-end', theme.bgEnd);

  localStorage.setItem(THEME_KEY, themeKey);
}

export function getStoredTheme(): ThemeKey {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored && stored in themes) {
    return stored as ThemeKey;
  }
  return 'classic';
}

// Icon size settings
const ICON_SIZE_KEY = 'jeop3:iconSize';

export function getIconSize(): IconSize {
  const stored = localStorage.getItem(ICON_SIZE_KEY);
  if (stored === '128' || stored === '256' || stored === '512' || stored === '1024') {
    return stored as IconSize;
  }
  return '512'; // Default to 512px for good balance
}

export function setIconSize(size: IconSize): void {
  localStorage.setItem(ICON_SIZE_KEY, size);
}
