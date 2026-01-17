/**
 * AI Content Chunking Module
 *
 * Smart chunking for large reference material.
 * Inspired by quizzernator's approach with improvements.
 */

export interface ChunkedContent {
  chunks: string[];
  totalChunks: number;
  approxChunkSize: number;
  originalLength: number;
}

export interface ChunkQuestionGoal {
  chunkIndex: number;
  goal: number;
}

/**
 * Split reference text into chunks by paragraphs
 * This preserves content coherence better than character-based splitting
 *
 * @param text - The full reference text to chunk
 * @param approxChunkSize - Target size for each chunk in characters (default: 8000)
 * @returns ChunkedContent with chunks and metadata
 */
export function chunkReferenceText(
  text: string,
  approxChunkSize: number = 8000
): ChunkedContent {
  // Split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  if (paragraphs.length === 0) {
    return {
      chunks: [text],
      totalChunks: 1,
      approxChunkSize,
      originalLength: text.length,
    };
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let currentSize = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current.join('\n\n'));
    current = [];
    currentSize = 0;
  };

  // Build chunks by grouping paragraphs
  paragraphs.forEach((paragraph) => {
    const paragraphLength = paragraph.length;

    // If adding this paragraph would exceed chunk size, flush current chunk
    if (currentSize > 0 && (currentSize + paragraphLength) > approxChunkSize) {
      flush();
    }

    current.push(paragraph);
    currentSize += paragraphLength;
  });

  // Flush remaining content
  flush();

  return {
    chunks,
    totalChunks: chunks.length,
    approxChunkSize,
    originalLength: text.length,
  };
}

/**
 * Calculate question goals for each chunk
 * Distributes desired total proportionally across chunks based on their sizes
 *
 * @param chunked - The chunked content
 * @param desiredTotal - Total number of questions desired across all chunks
 * @returns Array of question goals for each chunk
 */
export function calculateChunkQuestionGoals(
  chunked: ChunkedContent,
  desiredTotal: number
): number[] {
  if (chunked.totalChunks === 0) return [];

  // Base number of questions per chunk
  const base = Math.floor(desiredTotal / chunked.totalChunks);
  const remainder = desiredTotal % chunked.totalChunks;

  return chunked.chunks.map((chunk, index) => {
    // Earlier chunks get the remainder
    const goal = Math.max(1, base + (index < remainder ? 1 : 0));

    // Adjust based on chunk size relative to average
    const avgChunkSize = chunked.originalLength / chunked.totalChunks;
    const sizeRatio = chunk.length / avgChunkSize;

    return Math.round(goal * sizeRatio);
  });
}

/**
 * Build prompt instruction for a specific chunk
 *
 * @param chunkIndex - Current chunk index (1-based)
 * @param totalChunks - Total number of chunks
 * @param questionGoal - Number of questions to generate from this chunk
 * @returns Instruction string for the AI
 */
export function buildChunkInstruction(
  chunkIndex: number,
  totalChunks: number,
  questionGoal: number
): string {
  if (totalChunks === 1) {
    return `Generate ${questionGoal} categories based on the reference material.`;
  }

  return `You are helping build a multi-part quiz game.

This is chunk ${chunkIndex} of ${totalChunks} of the reference material.

IMPORTANT: Focus ONLY on this chunk. Generate approximately ${questionGoal} categor${questionGoal > 1 ? 'ies' : 'y'} from this specific chunk.

The chunks will be combined to create the final game, so each chunk should produce distinct, non-overlapping categories and questions.`;
}

/**
 * Get recommended chunk size based on content length
 *
 * @param contentLength - Length of the reference material
 * @returns Recommended chunk size
 */
export function getRecommendedChunkSize(contentLength: number): number {
  if (contentLength < 10000) return contentLength; // No chunking needed
  if (contentLength < 50000) return 10000;
  if (contentLength < 100000) return 15000;
  if (contentLength < 200000) return 20000;
  return 25000; // For very large content
}
