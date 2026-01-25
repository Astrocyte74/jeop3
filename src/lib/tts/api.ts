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
 * Synthesize speech from text
 */
export async function synthesize(request: TTSSynthesizeRequest): Promise<TTSSynthesizeResponse | null> {
  const settings = getTTSSettings();

  try {
    const response = await fetch(`${settings.apiUrl}/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: request.text,
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
      return null;
    }

    return await response.json();
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
