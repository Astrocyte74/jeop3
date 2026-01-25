/**
 * TTS (Text-to-Speech) Settings and Types
 */

export interface TTSSettings {
  enabled: boolean;
  apiUrl: string;
  autoRead: boolean;
  defaultVoice: string;
  speed: number;
  language: string;
}

export interface TTSVoice {
  id: string;
  label: string;
  locale: string;
  gender?: 'male' | 'female' | 'unknown';
  tags?: string[];
  accent?: {
    id: string;
    label: string;
    flag?: string;
  };
  engine: string;
  preview_url?: string;
}

export interface TTSVoicesResponse {
  engine: string;
  available: boolean;
  voices: TTSVoice[];
  count: number;
}

export interface TTSSynthesizeRequest {
  text: string;
  voice?: string;
  speed?: number;
  language?: string;
  trimSilence?: boolean;
  engine?: string;
}

export interface TTSSynthesizeResponse {
  id: string;
  engine: string;
  voice: string;
  url?: string;
  filename?: string;
  path?: string;
  clip?: string;
  sample_rate?: number;
  duration?: number;
}

export interface TTSAudioCache {
  [key: string]: {
    audioUrl: string;
    synthesizedAt: number;
  };
}
