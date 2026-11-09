/** Regular-clue attempts. Revealing the answer permanently ends the opportunity to steal. */
export interface ClueAttempts {
  misses: { teamId: string; penalty: boolean }[];
  winnerId: string | null;
  judging: boolean;
  revealed: boolean;
  finished: boolean;
}

export const emptyClueAttempts: ClueAttempts = { misses: [], winnerId: null, judging: false, revealed: false, finished: false };

type Action =
  | { type: 'reset' }
  | { type: 'reveal' }
  | { type: 'advance'; allowSteal: boolean }
  | { type: 'correct'; teamId: string }
  | { type: 'wrong'; teamId: string; penalty: boolean; allowSteal: boolean; teamCount: number }
  | { type: 'undoMiss'; teamId: string }
  | { type: 'nobody' };

export function clueAttemptsReducer(state: ClueAttempts, action: Action): ClueAttempts {
  if (action.type === 'reset') return emptyClueAttempts;
  if (state.finished) return state;
  switch (action.type) {
    case 'advance':
      if (action.allowSteal && !state.judging && !state.revealed) return { ...state, judging: true };
      return { ...state, revealed: true, finished: state.misses.length > 0 };
    case 'reveal':
      // With no recorded attempts, the host may still record the final result after reveal.
      return { ...state, revealed: true, finished: state.misses.length > 0 };
    case 'correct':
      if (!state.judging && !state.revealed) return state;
      if (state.misses.some((m) => m.teamId === action.teamId)) return state;
      return { ...state, winnerId: action.teamId, revealed: true, finished: true };
    case 'wrong': {
      if (!state.judging && !state.revealed) return state;
      if (state.misses.some((m) => m.teamId === action.teamId)) return state;
      const misses = [...state.misses, { teamId: action.teamId, penalty: action.penalty }];
      const finished = state.revealed || !action.allowSteal || misses.length >= action.teamCount;
      return { ...state, misses, finished, revealed: state.revealed || finished };
    }
    case 'undoMiss':
      if (state.revealed) return state;
      return { ...state, misses: state.misses.filter((m) => m.teamId !== action.teamId) };
    case 'nobody':
      return { ...state, revealed: true, finished: true };
  }
}
