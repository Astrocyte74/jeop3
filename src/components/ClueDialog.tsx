import { useState, useEffect } from 'react';
import type { Team } from '@/lib/storage';
import { X, Eye, Check, X as XIcon } from 'lucide-react';
import { iconMatcher, type IconMatch } from '@/lib/iconMatcher';

interface ClueDialogProps {
  isOpen: boolean;
  categoryTitle: string;
  value: number;
  clue: string;
  response: string;
  teams: Team[];
  activeTeamId: string;
  onClose: () => void;
  onMarkCorrect: (teamId: string) => void;
  onMarkIncorrect: (teamId: string) => void;
  onSetActiveTeam: (teamId: string) => void;
}

export function ClueDialog({
  isOpen,
  categoryTitle,
  value,
  clue,
  response,
  teams,
  activeTeamId,
  onClose,
  onMarkCorrect,
  onMarkIncorrect,
  onSetActiveTeam,
}: ClueDialogProps) {
  const [showResponse, setShowResponse] = useState(false);
  const [matchedIcon, setMatchedIcon] = useState<IconMatch | null>(null);

  useEffect(() => {
    if (isOpen) {
      setShowResponse(false);
      // Find matching icon for this clue
      const match = iconMatcher.findMatch(clue, response, categoryTitle);
      setMatchedIcon(match);
    }
  }, [isOpen, clue, response, categoryTitle]);

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
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Matched Icon */}
        {matchedIcon && (
          <div className="flex items-center justify-center gap-4 py-3 px-4 bg-slate-700/50 rounded-xl">
            <div className="text-center">
              <img
                src={iconMatcher.buildIconUrl(matchedIcon) || undefined}
                alt={matchedIcon.icon.title}
                className="w-24 h-24 mx-auto object-contain drop-shadow-lg"
                loading="lazy"
              />
              <p className="text-xs text-slate-400 mt-2 capitalize">{matchedIcon.icon.title}</p>
            </div>
            {matchedIcon.matchedTokens.length > 0 && (
              <div className="text-left">
                <p className="text-xs text-slate-500 mb-1">Matched keywords:</p>
                <div className="flex flex-wrap gap-1">
                  {matchedIcon.matchedTokens.map(token => (
                    <span
                      key={token}
                      className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full"
                    >
                      {token}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clue */}
        <div className="clue-text">{clue}</div>

        {/* Response */}
        <div className="clue-response">{response}</div>

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
