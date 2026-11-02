import type { GenerationProgress, GenerationStage } from './types';

export interface GenerationOptions {
  signal?: AbortSignal;
  onProgress?: (event: GenerationProgress) => void;
  /** Capture the model when a run starts, including its billing route. */
  model?: string;
}

export function checkAbort(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

export function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted || (error instanceof Error && error.name === 'AbortError');
}

export function timedSignal(signal: AbortSignal | undefined, ms: number): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
}

export function progress(options: GenerationOptions, stage: GenerationStage, message: string, detail: Omit<GenerationProgress, 'stage' | 'message'> = {}) {
  checkAbort(options.signal);
  options.onProgress?.({ stage, message, ...detail });
}
