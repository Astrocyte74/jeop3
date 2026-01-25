import { useState, useEffect, useRef } from 'react';
import type { Team } from '@/lib/storage';
import { X, Eye, Check, X as XIcon, Info, Trophy, XCircle, Volume2, Loader2, Square, AlertCircle } from 'lucide-react';
import { iconMatcher, type IconMatch } from '@/lib/iconMatcher';
import { getIconSize } from '@/lib/themes';
import { GameModeMenu, type GameMode } from '@/components/GameModeMenu';
import { useTTSClue, useTTS } from '@/lib/tts/hooks';
import { getTTSSettings } from '@/lib/tts';

interface ClueDialogProps {
  isOpen: boolean;
  categoryTitle: string;
  value: number;
  clue: string;
  response: string;
  teams: Team[];
  activeTeamId: string;
  globalGameMode?: GameMode;
  onClose: () => void;
  onMarkCorrect: (teamId: string) => void;
  onMarkIncorrect: (teamId: string) => void;
  onSetActiveTeam: (teamId: string) => void;
  onSwitchToSnake?: () => void;
  snakeGameResult?: { wasCorrect: boolean | null; teamId: string | null } | null;
}

export function ClueDialog({
  isOpen,
  categoryTitle,
  value,
  clue,
  response,
  teams,
  activeTeamId,
  globalGameMode,
  onClose,
  onMarkCorrect,
  onMarkIncorrect,
  onSetActiveTeam,
  onSwitchToSnake,
  snakeGameResult,
}: ClueDialogProps) {
  const [showResponse, setShowResponse] = useState(false);
  const ttsSettings = getTTSSettings();
  const { isAvailable } = useTTS();
  const { audio, playClue, playAnswer, stopPlayback, preloadAnswer } = useTTSClue(clue, response);

  // Only show TTS controls if enabled AND available
  const ttsEnabled = ttsSettings.enabled && isAvailable;

  // Auto-show response and set active team when coming from snake game
  useEffect(() => {
    if (isOpen && snakeGameResult && snakeGameResult.wasCorrect !== null && snakeGameResult.teamId) {
      setShowResponse(true);
      onSetActiveTeam(snakeGameResult.teamId);
    }
  }, [isOpen, snakeGameResult, onSetActiveTeam]);

  // Auto-read clue when dialog opens if enabled
  const hasTriggeredAutoReadRef = useRef(false);

  useEffect(() => {
    // Reset flag when dialog closes
    if (!isOpen) {
      hasTriggeredAutoReadRef.current = false;
      return;
    }

    if (isOpen && ttsEnabled && ttsSettings.autoRead && !snakeGameResult && !hasTriggeredAutoReadRef.current) {
      console.log('[ClueDialog] Triggering auto-read');
      hasTriggeredAutoReadRef.current = true;
      // Small delay to ensure the dialog is fully rendered
      const timer = setTimeout(() => {
        playClue();
        // Preload the answer while reading the clue
        preloadAnswer();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, ttsEnabled, ttsSettings.autoRead, snakeGameResult, playClue, preloadAnswer]);

  // Preload answer when response is shown (if not already loaded)
  useEffect(() => {
    if (showResponse && ttsEnabled && !audio.answerAudioUrl && !audio.isAnswerLoading) {
      preloadAnswer();
    }
  }, [showResponse, ttsEnabled, audio.answerAudioUrl, audio.isAnswerLoading, preloadAnswer]);

  const [showMatchedKeywords, setShowMatchedKeywords] = useState(false);
  const [clueIcons, setClueIcons] = useState<IconMatch[]>([]);
  const [answerIcons, setAnswerIcons] = useState<IconMatch[]>([]);
  const [currentClueIconIndex, setCurrentClueIconIndex] = useState(0);
  const [currentAnswerIconIndex, setCurrentAnswerIconIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      // Only reset showResponse if NOT coming from snake game
      if (!snakeGameResult || snakeGameResult.wasCorrect === null) {
        setShowResponse(false);
      }
      setShowMatchedKeywords(false);
      setCurrentClueIconIndex(0);
      setCurrentAnswerIconIndex(0);

      // Find matching icons for clue only (doesn't give away answer)
      const clueMatches = iconMatcher.findMatches(clue, undefined, categoryTitle, 5);
      setClueIcons(clueMatches);

      // Find matching icons for clue + answer (shown after reveal)
      const answerMatches = iconMatcher.findMatches(clue, response, categoryTitle, 5);
      setAnswerIcons(answerMatches);
    }
  }, [isOpen, clue, response, categoryTitle, snakeGameResult]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Press 'i' to toggle matched keywords
      if (e.key === 'i' || e.key === 'I') {
        setShowMatchedKeywords(prev => !prev);
        return;
      }

      // Arrow keys to navigate icons
      const icons = showResponse ? answerIcons : clueIcons;
      const currentIndex = showResponse ? currentAnswerIconIndex : currentClueIconIndex;
      const setCurrentIndex = showResponse ? setCurrentAnswerIconIndex : setCurrentClueIconIndex;

      if (icons.length > 1) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setCurrentIndex((currentIndex - 1 + icons.length) % icons.length);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setCurrentIndex((currentIndex + 1) % icons.length);
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, showResponse, clueIcons, answerIcons, currentClueIconIndex, currentAnswerIconIndex]);

  // Get icon display size based on setting
  const getIconDisplaySize = () => {
    const size = getIconSize();
    const sizeNum = parseInt(size);
    // Scale the display size based on the actual icon size
    // 128 -> 96px, 256 -> 128px, 512 -> 160px, 1024 -> 200px
    if (sizeNum <= 128) return 'w-24 h-24';
    if (sizeNum <= 256) return 'w-32 h-32';
    if (sizeNum <= 512) return 'w-40 h-40';
    return 'w-48 h-48';
  };

  if (!isOpen) return null;

  return (
    <div className="clue-dialog-backdrop" onClick={onClose}>
      <div
        className={`clue-dialog-card ${showResponse ? 'showing-answer' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold text-yellow-500">${value}</div>
            <h2 className="text-lg font-semibold text-slate-300">{categoryTitle}</h2>
          </div>
          <div className="flex items-center gap-2">
            {onSwitchToSnake && (
              <GameModeMenu
                currentMode={globalGameMode}
                onModeChange={(mode) => {
                  if (mode === 'snake') {
                    onClose();
                    onSwitchToSnake();
                  }
                  // If regular is selected, just stay in ClueDialog (already there)
                }}
              />
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Matched Icon */}
        {clueIcons.length > 0 && (
          <div className="flex items-center justify-center gap-4 py-3 px-4 rounded-xl relative">
            <button
              onClick={() => setShowMatchedKeywords(!showMatchedKeywords)}
              className="absolute top-2 right-2 text-slate-500 hover:text-slate-300 transition-colors p-1"
              title="Show icon details (press 'i')"
            >
              <Info className="w-4 h-4" />
            </button>

            <div className="text-center">
              <img
                src={iconMatcher.buildIconUrl(
                  (showResponse ? answerIcons : clueIcons)[showResponse ? currentAnswerIconIndex : currentClueIconIndex] || null
                ) || undefined}
                alt={((showResponse ? answerIcons : clueIcons)[showResponse ? currentAnswerIconIndex : currentClueIconIndex]).icon.title}
                className={`${getIconDisplaySize()} mx-auto object-contain drop-shadow-lg transition-all duration-300`}
                loading="lazy"
              />

              {/* Dot indicators */}
              {((showResponse ? answerIcons : clueIcons).length > 1) && (
                <div className="flex justify-center gap-1 mt-2">
                  {((showResponse ? answerIcons : clueIcons).length > 1) &&
                    ((showResponse ? answerIcons : clueIcons).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          const setCurrentIndex = showResponse ? setCurrentAnswerIconIndex : setCurrentClueIconIndex;
                          setCurrentIndex(idx);
                        }}
                        className={`w-2 h-2 rounded-full transition-all ${
                          idx === (showResponse ? currentAnswerIconIndex : currentClueIconIndex)
                            ? 'bg-yellow-500 scale-125'
                            : 'bg-slate-600 hover:bg-slate-500'
                        }`}
                        aria-label={`Go to icon ${idx + 1}`}
                      />
                    )))}
                </div>
              )}
            </div>

            {showMatchedKeywords && (
              <div className="text-left">
                <p className="text-xs text-slate-400 mb-1 capitalize font-semibold">
                  {((showResponse ? answerIcons : clueIcons)[showResponse ? currentAnswerIconIndex : currentClueIconIndex]).icon.title}
                </p>
                {((showResponse ? answerIcons : clueIcons)[showResponse ? currentAnswerIconIndex : currentClueIconIndex]).matchedTokens.length > 0 && (
                  <>
                    <p className="text-xs text-slate-500 mb-1">Matched keywords:</p>
                    <div className="flex flex-wrap gap-1">
                      {((showResponse ? answerIcons : clueIcons)[showResponse ? currentAnswerIconIndex : currentClueIconIndex]).matchedTokens.map(token => (
                        <span
                          key={token}
                          className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full"
                        >
                          {token}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Clue */}
        <div className="flex items-start gap-3">
          <div className="flex-1 clue-text">{clue}</div>
          {ttsEnabled && (
            <div className="flex items-center gap-1">
              <button
                onClick={stopPlayback}
                className={`flex-shrink-0 p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors ${audio.isPlaying ? 'visible' : 'invisible'}`}
                title="Stop playback"
              >
                <Square className="w-5 h-5" />
              </button>
              <button
                onClick={playClue}
                disabled={audio.isClueLoading}
                className="flex-shrink-0 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50"
                title="Read clue"
              >
                {audio.isClueLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
            </div>
          )}
          {audio.clueError && (
            <div className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span>Audio failed</span>
            </div>
          )}
        </div>

        {/* Response */}
        {showResponse && (
          <div className="flex items-start gap-3">
            <div className="flex-1 clue-response">{response}</div>
            {ttsEnabled && (
              <div className="flex items-center gap-1">
                <button
                  onClick={stopPlayback}
                  className={`flex-shrink-0 p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors ${audio.isPlaying ? 'visible' : 'invisible'}`}
                  title="Stop playback"
                >
                  <Square className="w-5 h-5" />
                </button>
                <button
                  onClick={playAnswer}
                  disabled={audio.isAnswerLoading}
                  className="flex-shrink-0 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50"
                  title="Read answer"
                >
                  {audio.isAnswerLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
              </div>
            )}
            {audio.answerError && (
              <div className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>Audio failed</span>
              </div>
            )}
          </div>
        )}

        {/* Snake Game Result Indicator */}
        {showResponse && snakeGameResult && snakeGameResult.wasCorrect !== null && (
          <div className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg ${
            snakeGameResult.wasCorrect
              ? 'bg-green-500/20 border-2 border-green-500 text-green-300'
              : 'bg-red-500/20 border-2 border-red-500 text-red-300'
          }`}>
            {snakeGameResult.wasCorrect ? (
              <>
                <Trophy className="w-5 h-5" />
                <span className="font-semibold">Snake Game: Correct!</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5" />
                <span className="font-semibold">Snake Game: Incorrect</span>
              </>
            )}
          </div>
        )}

        {/* Show/Hide button */}
        {!showResponse && (
          <button
            onClick={() => setShowResponse(true)}
            className="px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xl rounded-lg transition-all mx-auto"
          >
            <Eye className="w-5 h-5 mr-2 inline" />
            Show Answer
          </button>
        )}

        {/* Team selection */}
        {showResponse && (
          <div className="scoring-panel">
            <p className="text-sm text-slate-400 text-center mb-3 uppercase tracking-wide">Answering Team</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => onSetActiveTeam(team.id)}
                  className={`team-chip ${activeTeamId === team.id ? 'selected' : ''}`}
                >
                  <div className="font-medium">{team.name}</div>
                  <div className="text-sm text-slate-400">${team.score}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Correct/Incorrect buttons */}
        {showResponse && (
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => onMarkCorrect(activeTeamId)}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold text-lg rounded-lg transition-all"
            >
              <Check className="w-5 h-5 mr-2 inline" />
              Correct (+${value})
            </button>
            <button
              onClick={() => onMarkIncorrect(activeTeamId)}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-lg rounded-lg transition-all"
            >
              <XIcon className="w-5 h-5 mr-2 inline" />
              Incorrect (-${value})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
