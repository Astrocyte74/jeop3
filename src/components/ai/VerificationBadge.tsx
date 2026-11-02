import type { Clue } from '@/lib/ai/types';
import { currentVerification } from '@/lib/ai/verification';
import { Badge } from '@/components/ui/badge';

export function VerificationBadge({ clue, category }: { clue: Clue; category: string }) {
  const check = currentVerification(clue, category);
  return <Badge variant="outline" className={`text-[10px] shrink-0 ${check ? 'text-emerald-300 border-emerald-500/40' : 'text-amber-300 border-amber-500/40'}`}
    title={check ? `AI review by ${check.model}: ${check.reason}. This is a model assessment, not independent proof.` : 'This wording and answer have not passed the independent AI fact check.'}>
    {check ? 'AI checked' : 'Unverified'}
  </Badge>;
}
