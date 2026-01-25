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
  });

  const audioCacheRef = useRef<Map<string, string>>(new Map());

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

    // Cache the result
    audioCacheRef.current.set(cacheKey, audioUrl);

    setAudio(prev => ({
      ...prev,
      [type === 'clue' ? 'clueAudioUrl' : 'answerAudioUrl']: audioUrl,
      [type === 'clue' ? 'isClueLoading' : 'isAnswerLoading']: false,
    }));
  }, [clueText, answerText]);

  const playClue = useCallback(() => {
    if (audio.clueAudioUrl) {
      const audioElement = new Audio(audio.clueAudioUrl);
      audioElement.play().catch(err => console.error('[TTS] Failed to play:', err));
    } else if (clueText) {
      synthesizeAudio(clueText, 'clue').then(() => {
        // Will play when audio URL is set
      });
    }
  }, [audio.clueAudioUrl, clueText, synthesizeAudio]);

  const playAnswer = useCallback(() => {
    if (audio.answerAudioUrl) {
      const audioElement = new Audio(audio.answerAudioUrl);
      audioElement.play().catch(err => console.error('[TTS] Failed to play:', err));
    } else if (answerText) {
      synthesizeAudio(answerText, 'answer').then(() => {
        // Will play when audio URL is set
      });
    }
  }, [audio.answerAudioUrl, answerText, synthesizeAudio]);

  const preloadAnswer = useCallback(() => {
    if (answerText && !audio.answerAudioUrl && !audio.isAnswerLoading) {
      synthesizeAudio(answerText, 'answer');
    }
  }, [answerText, audio.answerAudioUrl, audio.isAnswerLoading, synthesizeAudio]);

  return {
    audio,
    playClue,
    playAnswer,
    preloadAnswer,
  };
}
