import { useState, useEffect } from 'react';
import type { Team } from '@/lib/storage';
import { X, Eye, Check, X as XIcon } from 'lucide-react';

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

  useEffect(() => {
    if (isOpen) {
      setShowResponse(false);
    }
  }, [isOpen]);

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
