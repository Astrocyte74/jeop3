/**
 * Final Jeopardy section of the Game editor, plus the pure helpers the editor
 * uses to turn its (possibly half-typed) draft into a saveable value.
 *
 * The draft lives on `game.finalJeopardy` while editing. Nothing is dropped on
 * the way: empty fields are legal while typing, and only `normalizeFinal`
 * decides what is persisted (all empty = no final round, all filled = saved,
 * partly filled = blocks Save with inline messages).
 */
import { forwardRef } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { FinalJeopardyClue } from '@/lib/storage';
import { classifyFinal, type FinalField } from './finalDraft';
import { ClueSources } from '@/components/ai/SourceChips';

const FIELD_NOUN: Record<FinalField, string> = { category: 'a category', clue: 'a clue', response: 'an answer' };

interface FinalJeopardyPanelProps {
  value: FinalJeopardyClue | undefined;
  /** Show the "still missing" messages (after a blocked Save, or once touched). */
  showErrors: boolean;
  onChange: (next: FinalJeopardyClue | undefined) => void;
}

const EMPTY: FinalJeopardyClue = { category: '', clue: '', response: '' };

export const FinalJeopardyPanel = forwardRef<HTMLElement, FinalJeopardyPanelProps>(function FinalJeopardyPanel(
  { value, showErrors, onChange },
  ref,
) {
  const state = classifyFinal(value);
  const current = value ?? EMPTY;
  const missing = state.kind === 'partial' ? state.missing : [];
  const hasAny = state.kind !== 'none';
  const set = (field: FinalField, text: string) => onChange({ ...current, [field]: text });
  const err = (field: FinalField) => showErrors && missing.includes(field);

  const fieldClass = (field: FinalField) =>
    `bg-slate-800/70 ${err(field) ? 'border-red-400/70' : 'border-slate-700'}`;

  return (
    <section
      ref={ref}
      aria-labelledby="final-jeopardy-heading"
      className="mt-6 scroll-mt-24 rounded-2xl border border-white/10 p-4"
      style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03), transparent 40%), rgb(11, 18, 40)' }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="final-jeopardy-heading"
            className="text-2xl leading-none text-yellow-400"
            style={{ fontFamily: 'var(--font-board)', letterSpacing: '0.02em' }}
          >
            Final Jeopardy
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-slate-400">
            {state.kind === 'complete'
              ? 'Teams wager after the last clue, then answer this one.'
              : 'Optional closing round. Leave every field empty to end the game after the last clue.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {state.kind === 'complete' && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-300">
              <Check className="h-4 w-4" aria-hidden /> Ready
            </span>
          )}
          {state.kind === 'partial' && (
            <span className="text-sm text-amber-300" role="status">
              Needs {missing.map((m) => FIELD_NOUN[m]).join(' and ')} to save
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasAny}
            onClick={() => onChange(undefined)}
            aria-label="Remove Final Jeopardy"
            className="border-slate-600 bg-transparent text-slate-200"
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Remove
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,18rem)]">
        <div>
          <label htmlFor="final-category" className="mb-1 block text-sm font-medium text-slate-300">Category</label>
          <Input
            id="final-category"
            aria-label="Final Jeopardy category"
            aria-invalid={err('category') || undefined}
            value={current.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="e.g. World Capitals"
            className={fieldClass('category')}
          />
          {err('category') && <p className="mt-1 text-xs text-red-300">Add a category for the final round.</p>}
        </div>
        <div>
          <label htmlFor="final-clue" className="mb-1 block text-sm font-medium text-slate-300">Clue</label>
          <Textarea
            id="final-clue"
            aria-label="Final Jeopardy clue"
            aria-invalid={err('clue') || undefined}
            value={current.clue}
            onChange={(e) => set('clue', e.target.value)}
            placeholder="The clue read to all teams"
            className={`min-h-[84px] ${fieldClass('clue')}`}
          />
          {err('clue') && <p className="mt-1 text-xs text-red-300">Add the clue teams will read.</p>}
        </div>
        <div>
          <label htmlFor="final-response" className="mb-1 block text-sm font-medium text-slate-300">Answer</label>
          <Textarea
            id="final-response"
            aria-label="Final Jeopardy answer"
            aria-invalid={err('response') || undefined}
            value={current.response}
            onChange={(e) => set('response', e.target.value)}
            placeholder="The correct response"
            className={`min-h-[84px] ${fieldClass('response')}`}
          />
          {err('response') && <p className="mt-1 text-xs text-red-300">Add the correct answer.</p>}
        </div>
        {/* Quoted evidence for the saved wording; hidden (with a note) once the text is edited. */}
        <ClueSources clue={current} category={current.category} />
      </div>
    </section>
  );
});
