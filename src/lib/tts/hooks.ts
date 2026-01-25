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

  // Track ALL audio elements for cleanup
  const allAudioElementsRef = useRef<Set<HTMLAudioElement>>(new Set());

  // Track pending play type for auto-play after synthesis
  const pendingPlayTypeRef = useRef<'clue' | 'answer' | null>(null);

  // Track when clue synthesis is complete to avoid concurrent requests
  const clueSynthesisCompleteRef = useRef(true);

  // Reset audio state when clue/answer changes
  useEffect(() => {
    console.log('[TTS] Resetting audio state for new clue/answer');
    // Stop any playing audio
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
    // Clear ALL tracked audio elements
    allAudioElementsRef.current.forEach(element => {
      element.pause();
      element.currentTime = 0;
    });
    allAudioElementsRef.current.clear();

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
    clueSynthesisCompleteRef.current = true;
  }, [clueText, answerText]);

  // Update isPlaying state when audio element events fire
  useEffect(() => {
    const element = audioElementRef.current;
    if (!element) return;

    const handlePlay = () => setAudio(prev => ({ ...prev, isPlaying: true }));
    const handleEnded = () => {
      console.log('[TTS] Audio ended, removing from tracking');
      setAudio(prev => ({ ...prev, isPlaying: false }));
      audioElementRef.current = null;
      allAudioElementsRef.current.delete(element);
    };
    const handleError = () => {
      console.log('[TTS] Audio error, removing from tracking');
      setAudio(prev => ({ ...prev, isPlaying: false }));
      audioElementRef.current = null;
      allAudioElementsRef.current.delete(element);
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
    // Stop ALL audio elements to prevent any mixing
    console.log('[TTS] Stopping all audio elements, count:', allAudioElementsRef.current.size);
    allAudioElementsRef.current.forEach(element => {
      element.pause();
      element.currentTime = 0;
    });
    allAudioElementsRef.current.clear();

    const audioElement = new Audio(url);
    audioElementRef.current = audioElement;
    allAudioElementsRef.current.add(audioElement);

    console.log('[TTS] Playing audio URL:', url.substring(0, 80));
    audioElement.play().catch(err => {
      console.error('[TTS] Failed to play:', err);
      setAudio(prev => ({ ...prev, isPlaying: false }));
      audioElementRef.current = null;
      allAudioElementsRef.current.delete(audioElement);
    });
  }, []);

  // Auto-play after synthesis completes if a play was requested
  useEffect(() => {
    if (pendingPlayTypeRef.current === 'clue' && audio.clueAudioUrl) {
      console.log('[TTS] Auto-playing clue, URL:', audio.clueAudioUrl.substring(0, 50));
      pendingPlayTypeRef.current = null;
      playAudioUrl(audio.clueAudioUrl);
    } else if (pendingPlayTypeRef.current === 'answer' && audio.answerAudioUrl) {
      console.log('[TTS] Auto-playing answer, URL:', audio.answerAudioUrl.substring(0, 50));
      pendingPlayTypeRef.current = null;
      playAudioUrl(audio.answerAudioUrl);
    } else if (pendingPlayTypeRef.current) {
      console.log('[TTS] Pending play but no URL yet, waiting... Type:', pendingPlayTypeRef.current);
    }
  }, [audio.clueAudioUrl, audio.answerAudioUrl, playAudioUrl]);

  const synthesizeAudio = useCallback(async (text: string, type: 'clue' | 'answer'): Promise<void> => {
    // Check cache first
    const cacheKey = `${type}:${text}`;
    console.log('[TTS] Cache key for', type, ':', cacheKey.substring(0, 100));
    const cachedUrl = audioCacheRef.current.get(cacheKey);
    if (cachedUrl) {
      console.log('[TTS] CACHE HIT for', type, '- returning cached URL:', cachedUrl.substring(0, 80));
      setAudio(prev => ({
        ...prev,
        [type === 'clue' ? 'clueAudioUrl' : 'answerAudioUrl']: cachedUrl,
      }));
      return;
    }

    // Start loading
    console.log('[TTS] Synthesizing', type, 'FULL TEXT:', text);
    setAudio(prev => ({
      ...prev,
      [type === 'clue' ? 'isClueLoading' : 'isAnswerLoading']: true,
      [type === 'clue' ? 'clueError' : 'answerError']: null,
    }));

    // Mark clue synthesis as in progress
    if (type === 'clue') {
      clueSynthesisCompleteRef.current = false;
    }

    const result = await synthesize({ text });

    // Mark clue synthesis as complete
    if (type === 'clue') {
      clueSynthesisCompleteRef.current = true;
      console.log('[TTS] Clue synthesis complete, preloading answer now');
    }

    console.log('[TTS] Synthesis result for', type, ':', result);

    if (!result) {
      console.error('[TTS] Failed to synthesize', type, '- text was:', text.substring(0, 100));
      setAudio(prev => ({
        ...prev,
        [type === 'clue' ? 'isClueLoading' : 'isAnswerLoading']: false,
        [type === 'clue' ? 'clueError' : 'answerError']: 'Failed to generate audio',
      }));
      // Mark as complete even on failure so answer can preload
      if (type === 'clue') {
        clueSynthesisCompleteRef.current = true;
      }
      return;
    }

    const audioUrl = getAudioUrl(result);
    console.log('[TTS] Generated audio URL for', type, ':', audioUrl.substring(0, 80));

    // Cache the result (LRU cache handles eviction)
    audioCacheRef.current.set(cacheKey, audioUrl);
    console.log('[TTS] Cached with key:', cacheKey.substring(0, 100));

    setAudio(prev => ({
      ...prev,
      [type === 'clue' ? 'clueAudioUrl' : 'answerAudioUrl']: audioUrl,
      [type === 'clue' ? 'isClueLoading' : 'isAnswerLoading']: false,
    }));
  }, []); // No dependencies needed - uses closure values

  const playClue = useCallback(() => {
    console.log('[TTS] playClue called, has URL:', !!audio.clueAudioUrl);
    if (audio.clueAudioUrl) {
      playAudioUrl(audio.clueAudioUrl);
    } else if (clueText) {
      console.log('[TTS] playClue: Setting pending play to "clue" and synthesizing');
      pendingPlayTypeRef.current = 'clue';
      synthesizeAudio(clueText, 'clue');
    }
  }, [audio.clueAudioUrl, clueText, synthesizeAudio, playAudioUrl]);

  const playAnswer = useCallback(() => {
    console.log('[TTS] playAnswer called, has URL:', !!audio.answerAudioUrl);
    if (audio.answerAudioUrl) {
      playAudioUrl(audio.answerAudioUrl);
    } else if (answerText) {
      console.log('[TTS] playAnswer: Setting pending play to "answer" and synthesizing');
      pendingPlayTypeRef.current = 'answer';
      synthesizeAudio(answerText, 'answer');
    }
  }, [audio.answerAudioUrl, answerText, synthesizeAudio, playAudioUrl]);

  const stopPlayback = useCallback(() => {
    console.log('[TTS] Stopping playback, clearing all audio');
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
    // Stop ALL tracked audio elements
    allAudioElementsRef.current.forEach(element => {
      element.pause();
      element.currentTime = 0;
    });
    allAudioElementsRef.current.clear();

    setAudio(prev => ({ ...prev, isPlaying: false }));
    pendingPlayTypeRef.current = null;
  }, []);

  const preloadAnswer = useCallback(() => {
    // Only preload if clue synthesis is complete and answer not already loaded
    if (answerText && !audio.answerAudioUrl && !audio.isAnswerLoading && clueSynthesisCompleteRef.current) {
      console.log('[TTS] Preloading answer (clue synthesis complete)');
      synthesizeAudio(answerText, 'answer');
    }
  }, [answerText, audio.answerAudioUrl, audio.isAnswerLoading, synthesizeAudio]);

  // Auto-preload answer when clue synthesis completes
  useEffect(() => {
    if (clueSynthesisCompleteRef.current && answerText && !audio.answerAudioUrl && !audio.isAnswerLoading) {
      console.log('[TTS] Clue synthesis detected complete, triggering preload');
      preloadAnswer();
    }
  }, [audio.isClueLoading, answerText, audio.answerAudioUrl, audio.isAnswerLoading, preloadAnswer]);

  return {
    audio,
    playClue,
    playAnswer,
    stopPlayback,
    preloadAnswer,
  };
}
