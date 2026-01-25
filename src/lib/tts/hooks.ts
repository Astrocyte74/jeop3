/**
 * TTS React Hooks
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getTTSSettings,
  updateTTSSettings,
  checkTTSAvailable,
  getVoices,
  synthesize,
  getAudioUrl,
  type TTSSettings,
  type TTSVoice,
} from './index';

export interface TTSClueAudio {
  clueAudioUrl: string | null;
  answerAudioUrl: string | null;
  isClueLoading: boolean;
  isAnswerLoading: boolean;
  clueError: string | null;
  answerError: string | null;
  isPlaying: boolean;
}

// LRU Cache for audio URLs
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove existing key if present (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Add new key at end
    this.cache.set(key, value);
    // Evict oldest entry if over limit
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Main TTS hook for managing TTS state and operations
 */
export function useTTS() {
  const [settings, setSettings] = useState<TTSSettings>(getTTSSettings);
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  // Check availability on mount and when settings change
  useEffect(() => {
    if (!settings.enabled) {
      setIsAvailable(false);
      setVoices([]);
      return;
    }

    checkTTSAvailable().then(setIsAvailable);

    // Load voices if available
    if (settings.enabled) {
      setIsLoadingVoices(true);
      getVoices().then(fetchedVoices => {
        setVoices(fetchedVoices);
        setIsLoadingVoices(false);

        // Set default voice if not set and voices available
        if (!settings.defaultVoice && fetchedVoices.length > 0) {
          updateTTSSettings({ defaultVoice: fetchedVoices[0].id });
        }
      }).catch(() => setIsLoadingVoices(false));
    }
  }, [settings.enabled, settings.apiUrl]);

  const updateSettings = useCallback((updates: Partial<TTSSettings>) => {
    const updated = updateTTSSettings(updates);
    setSettings(updated);
  }, []);

  return {
    settings,
    updateSettings,
    isAvailable,
    voices,
    isLoadingVoices,
  };
}

/**
 * Hook for managing audio state for a single clue
 */
export function useTTSClue(clueText: string, answerText: string) {
  const [audio, setAudio] = useState<TTSClueAudio>({
    clueAudioUrl: null,
    answerAudioUrl: null,
    isClueLoading: false,
    isAnswerLoading: false,
    clueError: null,
    answerError: null,
    isPlaying: false,
  });

  // Use LRU cache instead of unbounded Map
  const audioCacheRef = useRef<LRUCache<string, string>>(new LRUCache<string, string>(50));

  // Store the current audio element for cleanup and control
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Track pending play type for auto-play after synthesis
  const pendingPlayTypeRef = useRef<'clue' | 'answer' | null>(null);

  // Reset audio state when clue/answer changes
  useEffect(() => {
    // Stop any playing audio
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
    setAudio({
      clueAudioUrl: null,
      answerAudioUrl: null,
      isClueLoading: false,
      isAnswerLoading: false,
      clueError: null,
      answerError: null,
      isPlaying: false,
    });
    pendingPlayTypeRef.current = null;
  }, [clueText, answerText]);

  // Update isPlaying state when audio element events fire
  useEffect(() => {
    const element = audioElementRef.current;
    if (!element) return;

    const handlePlay = () => setAudio(prev => ({ ...prev, isPlaying: true }));
    const handleEnded = () => {
      setAudio(prev => ({ ...prev, isPlaying: false }));
      audioElementRef.current = null;
    };
    const handleError = () => {
      setAudio(prev => ({ ...prev, isPlaying: false }));
      audioElementRef.current = null;
    };

    element.addEventListener('play', handlePlay);
    element.addEventListener('ended', handleEnded);
    element.addEventListener('error', handleError);

    return () => {
      element.removeEventListener('play', handlePlay);
      element.removeEventListener('ended', handleEnded);
      element.removeEventListener('error', handleError);
    };
  }, [audio.clueAudioUrl, audio.answerAudioUrl]);

  const playAudioUrl = useCallback((url: string) => {
    // Stop any currently playing audio
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }

    const audioElement = new Audio(url);
    audioElementRef.current = audioElement;

    audioElement.play().catch(err => {
      console.error('[TTS] Failed to play:', err);
      setAudio(prev => ({ ...prev, isPlaying: false }));
      audioElementRef.current = null;
    });
  }, []);

  // Auto-play after synthesis completes if a play was requested
  useEffect(() => {
    console.log('[TTS] Auto-play check:', {
      pendingPlayType: pendingPlayTypeRef.current,
      clueUrl: audio.clueAudioUrl,
      answerUrl: audio.answerAudioUrl,
    });
    if (pendingPlayTypeRef.current === 'clue' && audio.clueAudioUrl) {
      console.log('[TTS] Auto-playing clue');
      pendingPlayTypeRef.current = null;
      playAudioUrl(audio.clueAudioUrl);
    } else if (pendingPlayTypeRef.current === 'answer' && audio.answerAudioUrl) {
      console.log('[TTS] Auto-playing answer');
      pendingPlayTypeRef.current = null;
      playAudioUrl(audio.answerAudioUrl);
    }
  }, [audio.clueAudioUrl, audio.answerAudioUrl, playAudioUrl]);

  const synthesizeAudio = useCallback(async (text: string, type: 'clue' | 'answer'): Promise<void> => {
    // Check cache first
    const cacheKey = `${type}:${text}`;
    const cachedUrl = audioCacheRef.current.get(cacheKey);
    if (cachedUrl) {
      setAudio(prev => ({
        ...prev,
        [type === 'clue' ? 'clueAudioUrl' : 'answerAudioUrl']: cachedUrl,
      }));
      return;
    }

    // Start loading
    setAudio(prev => ({
      ...prev,
      [type === 'clue' ? 'isClueLoading' : 'isAnswerLoading']: true,
      [type === 'clue' ? 'clueError' : 'answerError']: null,
    }));

    const result = await synthesize({ text });

    if (!result) {
      setAudio(prev => ({
        ...prev,
        [type === 'clue' ? 'isClueLoading' : 'isAnswerLoading']: false,
        [type === 'clue' ? 'clueError' : 'answerError']: 'Failed to generate audio',
      }));
      return;
    }

    const audioUrl = getAudioUrl(result);

    // Cache the result (LRU cache handles eviction)
    audioCacheRef.current.set(cacheKey, audioUrl);

    setAudio(prev => ({
      ...prev,
      [type === 'clue' ? 'clueAudioUrl' : 'answerAudioUrl']: audioUrl,
      [type === 'clue' ? 'isClueLoading' : 'isAnswerLoading']: false,
    }));
  }, []); // No dependencies needed - uses closure values

  const playClue = useCallback(() => {
    console.log('[TTS] playClue called:', {
      clueAudioUrl: audio.clueAudioUrl,
      clueText: clueText?.substring(0, 30),
    });
    if (audio.clueAudioUrl) {
      console.log('[TTS] Playing cached clue audio');
      playAudioUrl(audio.clueAudioUrl);
    } else if (clueText) {
      console.log('[TTS] Synthesizing clue audio, pending play');
      pendingPlayTypeRef.current = 'clue';
      synthesizeAudio(clueText, 'clue');
    }
  }, [audio.clueAudioUrl, clueText, synthesizeAudio, playAudioUrl]);

  const playAnswer = useCallback(() => {
    if (audio.answerAudioUrl) {
      playAudioUrl(audio.answerAudioUrl);
    } else if (answerText) {
      pendingPlayTypeRef.current = 'answer';
      synthesizeAudio(answerText, 'answer');
    }
  }, [audio.answerAudioUrl, answerText, synthesizeAudio, playAudioUrl]);

  const stopPlayback = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
    setAudio(prev => ({ ...prev, isPlaying: false }));
    pendingPlayTypeRef.current = null;
  }, []);

  const preloadAnswer = useCallback(() => {
    if (answerText && !audio.answerAudioUrl && !audio.isAnswerLoading) {
      synthesizeAudio(answerText, 'answer');
    }
  }, [answerText, audio.answerAudioUrl, audio.isAnswerLoading, synthesizeAudio]);

  return {
    audio,
    playClue,
    playAnswer,
    stopPlayback,
    preloadAnswer,
  };
}
