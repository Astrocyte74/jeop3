import type { FinalJeopardyClue } from '../storage';
import type { AICategory, BoardReview, BoardReviewIssue } from './types';
import type { Generate } from './board';
import { checkAbort, isAbort, progress, type GenerationOptions } from './progress';
import { verifyCategories, type Verifier } from './verification';
import { nearDupKey } from './answers';

export function boardItems(categories: AICategory[], final?: FinalJeopardyClue) {
  return [
    ...categories.flatMap((c, i) => c.clues.map((q, j) => ({ id: `${i}:${j}`, category: c.title, clue: q.clue, response: q.response, value: q.value }))),
    ...(final ? [{ id: 'final', category: final.category, clue: final.clue, response: final.response, value: 0 }] : []),
  ];
}
export const boardSnapshot = (categories: AICategory[], final?: FinalJeopardyClue) => JSON.stringify(boardItems(categories, final));
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Literal leaks are deterministic; the model adds semantic/editorial findings. */
export function literalBoardIssues(items: ReturnType<typeof boardItems>): BoardReviewIssue[] {
  const issues: BoardReviewIssue[] = [];
  for (const answer of items) {
    const key = words(answer.response).replace(/^(the|a|an) /, '');
    if (key.length < 3) continue;
    for (const clue of items) {
      if (` ${words(clue.category + ' ' + clue.clue)} `.includes(` ${key} `)) {
        issues.push({ kind: 'answer-leak', ids: [...new Set([answer.id, clue.id])], reason: `${clue.id} explicitly contains the answer to ${answer.id}: ${answer.response}.` });
      }
    }
  }
  return issues;
}

export async function reviewWholeBoard(generate: Generate, categories: AICategory[], final: FinalJeopardyClue | undefined, options: GenerationOptions = {}): Promise<BoardReview> {
  progress(options, 'judging', 'Reviewing the whole board for leaks and repeated facts…');
  const items = boardItems(categories, final);
  const issues = literalBoardIssues(items);
  let warning: string | undefined;
  try {
    const result = await generate('review-board', { reviewItems: items }, 'normal', options);
    checkAbort(options.signal);
    if (!Array.isArray(result?.issues)) throw new Error('Incomplete board review');
    const ids = new Set(items.map(i => i.id));
    for (const issue of result.issues) {
      if (!['answer-leak', 'repeated-fact', 'ambiguous', 'difficulty'].includes(issue.kind) || !Array.isArray(issue.ids) || !issue.ids.length || issue.ids.some((id: string) => !ids.has(id)) || typeof issue.reason !== 'string' || !issue.reason.trim()) throw new Error('Invalid board review');
    }
    for (const issue of result.issues as BoardReviewIssue[]) {
      if (!issues.some(i => i.kind === issue.kind && [...i.ids].sort().join() === [...issue.ids].sort().join())) issues.push(issue);
    }
  } catch (error) {
    if (isAbort(error, options.signal)) throw error;
    warning = 'AI board review unavailable; only literal answer leaks were checked.';
  }
  return { issues, warning, snapshot: JSON.stringify(items), checkedAt: new Date().toISOString() };
}

/** One attempt. A Final that cannot pass the independent gate is omitted. */
export async function generateFinalJeopardy(generate: Generate, categories: AICategory[], theme: string, options: GenerationOptions & { verify?: Verifier } = {}): Promise<{ final?: FinalJeopardyClue; warning?: string }> {
  progress(options, 'final', 'Writing Final Jeopardy…', { completed: 0, total: 1 });
  // A recalled fact sheet is not evidence for a verified Final.
  const sources = categories.filter(c => c.sourceType !== 'ai_synthesized' && c.sourceMaterial?.trim());
  try {
    if (!sources.length) throw new Error('No independent source material for Final Jeopardy');
    const candidate = await generate('final-jeopardy', {
      theme, reviewItems: boardItems(categories),
      finalSources: sources.map(c => ({ title: c.title, text: c.sourceMaterial!.slice(0, 8000), sourceUrl: c.sourceUrl })),
    }, 'hard', options);
    checkAbort(options.signal);
    if (!candidate || !['category', 'clue', 'response'].every(k => typeof candidate[k] === 'string' && candidate[k].trim()) || !Number.isInteger(candidate.sourceIndex) || !sources[candidate.sourceIndex]) throw new Error('Invalid Final Jeopardy response');
    if (categories.some(c => c.clues.some(q => nearDupKey(q.response) === nearDupKey(candidate.response)))) throw new Error('Final Jeopardy repeats a board answer');
    const source = sources[candidate.sourceIndex];
    const provisional: FinalJeopardyClue = { category: candidate.category, clue: candidate.clue, response: candidate.response };
    if (literalBoardIssues(boardItems(categories, provisional)).some(i => i.ids.includes('final'))) throw new Error('Final Jeopardy reveals or repeats an answer elsewhere on the board');
    const checked = await verifyCategories([{ title: candidate.category, sourceMaterial: source.sourceMaterial, sourceUrl: source.sourceUrl, clues: [{ value: 0, clue: candidate.clue, response: candidate.response, provenance: 'final_generated' }] }], theme, options.verify, {
      ...options, onProgress: event => options.onProgress?.({ ...event, stage: 'final', message: 'Checking Final Jeopardy independently…' }),
    });
    checkAbort(options.signal);
    const clue = checked.categories[0]?.clues[0];
    if (!clue?.verification) throw new Error('Final Jeopardy did not pass independent verification');
    progress(options, 'final', 'Final Jeopardy checked', { completed: 1, total: 1, status: 'complete' });
    return { final: { category: candidate.category, clue: clue.clue, response: clue.response, provenance: clue.provenance, verification: clue.verification, sourceMaterial: source.sourceMaterial, sourceUrl: source.sourceUrl } };
  } catch (error) {
    if (isAbort(error, options.signal)) throw error;
    progress(options, 'final', 'Final Jeopardy omitted', { completed: 1, total: 1, status: 'failed' });
    return { warning: `Final Jeopardy omitted: ${error instanceof Error ? error.message : 'verification unavailable'}.` };
  }
}
