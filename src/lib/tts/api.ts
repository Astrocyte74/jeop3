/**
 * TTS API Client
 */

import type {
  TTSSynthesizeRequest,
  TTSSynthesizeResponse,
  TTSVoice
} from './types';
import { getTTSSettings } from './storage';

/**
 * Check if TTS API is available
 */
export async function checkTTSAvailable(): Promise<boolean> {
  const settings = getTTSSettings();
  if (!settings.enabled) return false;

  try {
    const response = await fetch(`${settings.apiUrl}/meta`);
    if (!response.ok) return false;
    const data = await response.json();
    return data.has_voices === true;
  } catch {
    return false;
  }
}

/**
 * Get available voices from TTS API
 */
export async function getVoices(): Promise<TTSVoice[]> {
  const settings = getTTSSettings();

  try {
    const response = await fetch(`${settings.apiUrl}/voices_catalog?engine=kokoro`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.voices || [];
  } catch (error) {
    console.error('[TTS] Failed to fetch voices:', error);
    return [];
  }
}

/**
 * Get favorite voices from TTS API
 */
export async function getFavoriteVoices(): Promise<TTSVoice[]> {
  const settings = getTTSSettings();

  try {
    const response = await fetch(`${settings.apiUrl}/favorites?engine=kokoro`);
    if (!response.ok) return [];
    const data = await response.json();
    // Favorites have a different structure: { profiles: [{ label, engine, voiceId, ... }] }
    // We need to map these to TTSVoice format
    const profiles = data.profiles || [];
    return profiles.map((p: any) => ({
      id: p.voiceId,
      label: p.label,
      locale: p.language || 'en',
      gender: p.gender || 'unknown',
      tags: p.tags || [],
      engine: p.engine || 'kokoro',
    }));
  } catch (error) {
    console.error('[TTS] Failed to fetch favorite voices:', error);
    return [];
  }
}

/**
 * Normalize text for TTS synthesis
 * Force single-line output, collapse spaces, and ensure ending punctuation
 */
function normalizeText(text: string): string {
  // Replace all line breaks with spaces
  let normalized = text.replace(/[\r\n]+/g, ' ').trim();
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ');

  // Ensure text ends with punctuation for better TTS quality
  // Add period if no ending punctuation (. ! ? ; :)
  if (normalized.length > 0 && !/[.!?;:]$/.test(normalized)) {
    normalized += '.';
  }

  return normalized;
}

/**
 * Synthesize speech from text
 */
export async function synthesize(request: TTSSynthesizeRequest): Promise<TTSSynthesizeResponse | null> {
  const settings = getTTSSettings();

  try {
    const normalizedText = normalizeText(request.text);

    // Add timestamp to prevent browser/caching issues
    const cacheBuster = Date.now();

    const response = await fetch(`${settings.apiUrl}/synthesize?_t=${cacheBuster}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        text: normalizedText,
        voice: request.voice || settings.defaultVoice,
        speed: request.speed ?? settings.speed,
        language: request.language ?? settings.language,
        trimSilence: request.trimSilence ?? true,
        engine: request.engine || 'kokoro',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[TTS] Synthesis failed:', error);
      console.error('[TTS] Request text was:', normalizedText.substring(0, 100));
      return null;
    }

    const result = await response.json();
    console.log('[TTS] Synthesis success:', result.id, 'duration:', result.duration);
    return result;
  } catch (error) {
    console.error('[TTS] Synthesis error:', error);
    return null;
  }
}

/**
 * Get audio URL from synthesise response
 */
export function getAudioUrl(response: TTSSynthesizeResponse): string {
  const settings = getTTSSettings();
  // Try different URL fields that might be returned
  if (response.url) return response.url;
  if (response.clip) return `${settings.apiUrl.replace('/api', '')}/audio/${response.clip}`;
  if (response.filename) return `${settings.apiUrl.replace('/api', '')}/audio/${response.filename}`;
  if (response.path) return response.path;

  // Fallback: construct from ID
  return `${settings.apiUrl.replace('/api', '')}/audio/${response.id}.wav`;
}
