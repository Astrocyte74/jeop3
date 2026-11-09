import type { AICategory, ClueEvidence, SourceDocument } from './types';

export const normalizedQuote = (text: string) => text.replace(/\s+/g, ' ').trim();
export function categoryDocuments(cat: AICategory): SourceDocument[] {
  if (cat.sourceType === 'ai_synthesized') return [];
  if (cat.sources) return cat.sources;
  if (!cat.sourceMaterial?.trim()) return [];
  // Keep bounded chunks so long pasted material has the same evidence window
  // during generation and verification. The wire layer rejects ID collisions.
  const capturedAt = new Date().toISOString();
  const text = cat.sourceMaterial.slice(0, 72000);
  const documents: SourceDocument[] = [];
  for (let start = 0; start < text.length; start += 24000) {
    const chunk = text.slice(start, start + 24000);
    let hash = 2166136261;
    for (let i = 0; i < chunk.length; i++) hash = Math.imul(hash ^ chunk.charCodeAt(i), 16777619);
    documents.push({ id: `provided-${start}-${(hash >>> 0).toString(16)}`, title: cat.sourceUrl ? 'Provided webpage' : 'Pasted material',
      text: chunk, url: cat.sourceUrl, kind: cat.sourceUrl ? 'web' : 'user', retrievedAt: capturedAt });
  }
  return documents;
}
export function materialFor(sources: SourceDocument[]) {
  return sources.map(s => `[Source ${s.id}: ${s.title}${s.url ? ` (${s.url})` : ''}]\n${s.text}`).join('\n\n');
}
export function resolveEvidence(raw: unknown, sources: SourceDocument[]): ClueEvidence[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 3) throw new Error('Missing independent source evidence');
  return raw.map(row => {
    const source = sources.find(s => s.id === row?.sourceId);
    if (!source || typeof row.quote !== 'string' || normalizedQuote(row.quote).length < 20 || row.quote.length > 2000 || !normalizedQuote(source.text).includes(normalizedQuote(row.quote))) throw new Error('Verifier cited a missing source or non-matching passage');
    return { sourceId: source.id, title: source.title, url: source.url, quote: row.quote, retrievedAt: source.retrievedAt, kind: source.kind };
  });
}
