/**
 * Bounded, deterministic document chunking for long analyses. Chunks overlap
 * on a small boundary so a clause split by an extractor line/page break is not
 * silently lost. The original text remains the evidence checked by the
 * excerpt boundary; this utility never persists an extra copy.
 */
export const DOCUMENT_ANALYSIS_CHUNK_SIZE = 72_000;
export const DOCUMENT_ANALYSIS_CHUNK_OVERLAP = 2_000;
export const DOCUMENT_ANALYSIS_MAX_CHUNKS = 8;

export type DocumentAnalysisChunk = {
  index: number;
  total: number;
  text: string;
};

export function chunkDocumentForAnalysis(
  text: string,
  options: {
    chunkSize?: number;
    overlap?: number;
    maxChunks?: number;
  } = {},
): DocumentAnalysisChunk[] {
  const chunkSize = options.chunkSize ?? DOCUMENT_ANALYSIS_CHUNK_SIZE;
  const overlap = options.overlap ?? DOCUMENT_ANALYSIS_CHUNK_OVERLAP;
  const maxChunks = options.maxChunks ?? DOCUMENT_ANALYSIS_MAX_CHUNKS;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 4_000
    || !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= chunkSize
    || !Number.isSafeInteger(maxChunks) || maxChunks < 1) {
    throw new TypeError("Invalid document analysis chunk limits.");
  }
  if (text.length <= chunkSize) return [{ index: 1, total: 1, text }];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < maxChunks) {
    let end = Math.min(text.length, start + chunkSize);
    if (end < text.length) {
      const paragraph = text.lastIndexOf("\n\n", end);
      const sentence = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf("。", end));
      const boundary = Math.max(paragraph, sentence);
      if (boundary > start + Math.floor(chunkSize * 0.55)) end = boundary + 1;
    }
    const value = text.slice(start, end).trim();
    if (value) chunks.push(value);
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.map((value, index, all) => ({ index: index + 1, total: all.length, text: value }));
}
