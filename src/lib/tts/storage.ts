/**
 * TTS Settings Storage and Management
 */

import type { TTSSettings } from './types';

const TTS_SETTINGS_KEY = 'jeop3:ttsSettings:v1';

const DEFAULT_TTS_SETTINGS: TTSSettings = {
  enabled: false,
  apiUrl: 'http://127.0.0.1:7860/api',
  autoRead: false,
  defaultVoice: '',
  speed: 1.0,
  language: 'en',
};

/**
 * Load TTS settings from localStorage
 */
export function getTTSSettings(): TTSSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_TTS_SETTINGS };

  const stored = localStorage.getItem(TTS_SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_TTS_SETTINGS };

  try {
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_TTS_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_TTS_SETTINGS };
  }
}

/**
 * Save TTS settings to localStorage
 */
export function saveTTSSettings(settings: TTSSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Update specific TTS settings
 */
export function updateTTSSettings(updates: Partial<TTSSettings>): TTSSettings {
  const current = getTTSSettings();
  const updated = { ...current, ...updates };
  saveTTSSettings(updated);
  return updated;
}
