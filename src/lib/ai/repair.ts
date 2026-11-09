import type { Generate } from './board';
import type { AICategory, SourceDocument, VerificationFailure } from './types';
import type { AIDifficulty } from './types';
import { checkAbort, progress, type GenerationOptions } from './progress';
import { nearDupKey, isGenericAnswer } from './answers';
import { categoryDocuments, materialFor } from './evidence';
import { verifyCategories, type Verifier } from './verification';

export interface RepairOptions extends GenerationOptions {
  theme?: string;
  difficulty: AIDifficulty;
  existingAnswers?: string[];
  verify?: Verifier;
  refreshSources?: (category: AICategory, rejected: VerificationFailure['clues']) => Promise<SourceDocument[]>;
}
/** Exactly one bounded pass, over deficient categories only. Originals are immutable. */
export async function repairCategories(generate: Generate, input: AICategory[], rejected: VerificationFailure['clues'], opts: RepairOptions) {
  const categories = input.map(c => ({ ...c, clues: [...c.clues] }));
  const failures = [...rejected];
  const used = new Set([...(opts.existingAnswers || []), ...categories.flatMap(c => c.clues.map(q => q.response))].map(nearDupKey));
  for (let ci = 0; ci < categories.length; ci++) {
    checkAbort(opts.signal);
    let cat = categories[ci];
    const missing = 5 - cat.clues.length;
    if (missing <= 0) continue;
    const prior = rejected.filter(r => r.categoryIndex === ci);
    progress(opts, 'retrieval', `Finding evidence for ${missing} missing clue${missing === 1 ? '' : 's'} in ${cat.title}…`, { categoryIndex: ci, categoryTitle: cat.title, attempt: 1, missing });
    if (opts.refreshSources) {
      const extra = await opts.refreshSources(cat, prior);
      checkAbort(opts.signal);
      // Retain the original evidence so a retry can correct a qualifier or date
      // instead of losing the very passage needed to repair the rejected pair.
      const docs = [...categoryDocuments(cat), ...extra].filter((d, i, all) => all.findIndex(x => x.id === d.id) === i).slice(0, 6);
      cat = { ...cat, sources: docs, sourceMaterial: materialFor(docs), sourceUrl: docs[0]?.url };
      categories[ci] = cat;
    }
    progress(opts, 'clues', `Replacing ${missing} missing clue${missing === 1 ? '' : 's'} in ${cat.title}…`, { categoryIndex: ci, categoryTitle: cat.title, attempt: 1, missing });
    const result = await generate('categories-generate-from-content', {
      theme: opts.theme || 'random', count: 1, missing, suggestedCategoryTitles: [cat.title],
      referenceMaterial: materialFor(categoryDocuments(cat)), reviewMode: cat.reviewMode, sourcePolicy: cat.sourcePolicy,
      existingAnswers: [...(opts.existingAnswers || []), ...categories.flatMap(c => c.clues.map(q => q.response))], rejectedClues: prior,
    }, opts.difficulty, opts);
    checkAbort(opts.signal);
    const raw = result?.categories?.find((c: AICategory) => c.title === cat.title)?.clues;
    const local = new Set<string>();
    const candidates = (Array.isArray(raw) ? raw : []).slice(0, 7).filter(q => {
      if (typeof q?.clue !== 'string' || !q.clue.trim() || typeof q?.response !== 'string' || isGenericAnswer(q.response)) return false;
      const key = nearDupKey(q.response);
      if (used.has(key) || local.has(key) || prior.some(r => nearDupKey(r.response) === key && r.clue.trim() === q.clue.trim())) return false;
      local.add(key); return true;
    }).map(q => ({ clue: q.clue, response: q.response, value: 0, provenance: 'repair' }));
    if (!candidates.length) continue;
    // Same independent evidence gate as the initial board. Outages propagate;
    // they do not consume another generation attempt or become fact rejections.
    const checked = await verifyCategories([{ ...cat, clues: candidates }], opts.theme || 'random', opts.verify, {
      ...opts, requireEvidence: true, onProgress: event => opts.onProgress?.({ ...event, categoryIndex: ci, categoryTitle: cat.title, attempt: 1 }),
    });
    failures.push(...checked.rejected.map(r => ({ ...r, id: `${ci}:retry:${r.clueIndex}`, categoryIndex: ci, attempt: 1 })));
    const occupied = new Set(cat.clues.map(q => q.value));
    const slots = [200, 400, 600, 800, 1000].filter(v => !occupied.has(v));
    for (const clue of checked.categories[0].clues) {
      if (cat.clues.length >= 5) break;
      const key = nearDupKey(clue.response);
      if (used.has(key)) continue;
      used.add(key);
      cat.clues.push({ ...clue, value: slots.shift()! });
    }
    cat.clues.sort((a, b) => a.value - b.value);
    progress(opts, 'verifying', `Checked replacements for ${cat.title}`, { categoryIndex: ci, categoryTitle: cat.title, attempt: 1, completed: cat.clues.length, total: 5, status: cat.clues.length === 5 ? 'complete' : 'failed' });
  }
  return { categories, rejected: failures };
}
