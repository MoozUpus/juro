/**
 * Bounded, deterministic document chunking for long analyses. Chunks overlap
 * on a small boundary so a clause split by an extractor line/page break is not
 * silently lost. The original text remains the evidence checked by the
 * excerpt boundary; this utility never persists an extra copy.
 */
export const DOCUMENT_ANALYSIS_CHUNK_SIZE = 72_000;
export const DOCUMENT_ANALYSIS_CHUNK_OVERLAP = 2_000;
export const DOCUMENT_ANALYSIS_MAX_CHUNKS = 8;
// Production recovery evidence showed that even a 12k representative sample,
// once combined with official-source context and the complete structured
// contract, could repeatedly exhaust the useful quick-analysis window. Keep
// beginning/middle/end coverage, but bound untrusted text to roughly 1.2k
// input tokens so quick mode remains a genuinely compact first pass.
export const QUICK_DOCUMENT_ANALYSIS_INPUT_SIZE = 4_800;
const QUICK_DOCUMENT_ANALYSIS_SAMPLE_PARTS = 3;
const QUICK_DOCUMENT_ANALYSIS_SAMPLE_BOUNDARY = "\n\n[JURO_REPRESENTATIVE_SAMPLE_BOUNDARY]\n\n";

export type DocumentAnalysisChunk = {
  index: number;
  total: number;
  text: string;
};

export type DocumentAnalysisPlan = {
  chunks: DocumentAnalysisChunk[];
  representativeSample: boolean;
};

/**
 * Quick analysis is a compact first pass, so a large document must not become
 * one oversized structured-output request. Select deterministic beginning,
 * middle, and ending windows in a single bounded request. This preserves broad
 * document coverage while keeping the provider call below the asynchronous job
 * budget. The explicit boundary marker is untrusted document data and cannot
 * pass the later exact-excerpt check as evidence.
 */
export function planDocumentAnalysis(
  text: string,
  mode: "quick" | "full" | "expert",
): DocumentAnalysisPlan {
  if (mode !== "quick" || text.length <= QUICK_DOCUMENT_ANALYSIS_INPUT_SIZE) {
    return {
      chunks: chunkDocumentForAnalysis(text),
      representativeSample: false,
    };
  }

  const boundaryBudget = QUICK_DOCUMENT_ANALYSIS_SAMPLE_BOUNDARY.length
    * (QUICK_DOCUMENT_ANALYSIS_SAMPLE_PARTS - 1);
  const windowSize = Math.floor(
    (QUICK_DOCUMENT_ANALYSIS_INPUT_SIZE - boundaryBudget)
      / QUICK_DOCUMENT_ANALYSIS_SAMPLE_PARTS,
  );
  const starts = [
    0,
    Math.floor((text.length - windowSize) / 2),
    text.length - windowSize,
  ];
  const sampledText = starts
    .map((start) => text.slice(start, start + windowSize))
    .join(QUICK_DOCUMENT_ANALYSIS_SAMPLE_BOUNDARY);

  return {
    chunks: [{ index: 1, total: 1, text: sampledText }],
    representativeSample: true,
  };
}

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
