/**
 * Deterministic sparse BM25 and reciprocal-rank fusion for legal candidates.
 *
 * This is a JURO reimplementation of retrieval concepts audited in Huquq AI:
 * no upstream corpus, model, Qdrant dependency or source code is included.
 */

import { detectArticleNumbers, normalizeLegalSearchQuery } from "./legal-language";

export type SparseLegalDocument<T> = {
  id: string;
  value: T;
  title?: string | null;
  body: string;
  identifiers?: string | null;
};

export type RankedLegalCandidate<T> = {
  id: string;
  value: T;
  score: number;
};

export type FusedLegalCandidate<T> = RankedLegalCandidate<T> & {
  ranks: readonly number[];
};

const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;
const TITLE_WEIGHT = 2.5;
const IDENTIFIER_WEIGHT = 4;
const ARTICLE_EXACT_BOOST = 8;

function tokens(value: string): string[] {
  return normalizeLegalSearchQuery(value, "uz").match(/[\p{L}\p{N}]{2,}/gu) ?? [];
}

function weightedTokens(document: Pick<SparseLegalDocument<unknown>, "title" | "body" | "identifiers">) {
  const body = tokens(document.body);
  const weighted = new Map<string, number>();
  for (const token of body) weighted.set(token, (weighted.get(token) ?? 0) + 1);
  for (const token of tokens(document.title ?? "")) {
    weighted.set(token, (weighted.get(token) ?? 0) + TITLE_WEIGHT);
  }
  for (const token of tokens(document.identifiers ?? "")) {
    weighted.set(token, (weighted.get(token) ?? 0) + IDENTIFIER_WEIGHT);
  }
  return { weighted, length: Math.max(1, body.length) };
}

/** BM25 ranks only the supplied, bounded candidate set; it never creates a source. */
export function rankSparseBm25<T>(
  query: string,
  documents: readonly SparseLegalDocument<T>[],
  options: { k1?: number; b?: number; limit?: number } = {},
): RankedLegalCandidate<T>[] {
  if (documents.length === 0) return [];
  const queryTokens = [...new Set(tokens(query))];
  if (queryTokens.length === 0) return [];
  const k1 = options.k1 ?? DEFAULT_K1;
  const b = options.b ?? DEFAULT_B;
  if (!(k1 > 0) || !(b >= 0 && b <= 1)) throw new TypeError("Invalid BM25 parameters.");

  const prepared = documents.map((document, order) => ({
    document,
    order,
    ...weightedTokens(document),
  }));
  const averageLength = prepared.reduce((total, item) => total + item.length, 0) / prepared.length;
  const documentFrequency = new Map<string, number>();
  for (const token of queryTokens) {
    documentFrequency.set(token, prepared.reduce(
      (total, item) => total + (item.weighted.has(token) ? 1 : 0),
      0,
    ));
  }
  const articleNumbers = detectArticleNumbers(query);
  const scored = prepared.map((item) => {
    let score = 0;
    for (const token of queryTokens) {
      const frequency = item.weighted.get(token) ?? 0;
      if (frequency === 0) continue;
      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (prepared.length - df + 0.5) / (df + 0.5));
      score += idf * (frequency * (k1 + 1)) / (
        frequency + k1 * (1 - b + b * (item.length / averageLength))
      );
    }
    const title = item.document.title ?? "";
    if (articleNumbers.some((number) =>
      new RegExp("(?:статья|модда|modda)\\s*" + number + "\\b", "iu").test(title)
    )) score += ARTICLE_EXACT_BOOST;
    return { id: item.document.id, value: item.document.value, score, order: item.order };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, options.limit ?? documents.length)
    .map(({ id, value, score }) => ({ id, value, score }));
}

/**
 * Reciprocal Rank Fusion preserves first-seen metadata and is stable for ties.
 * Empty rankings are valid, so semantic and sparse outages degrade independently.
 */
export function reciprocalRankFusion<T>(
  rankings: readonly (readonly RankedLegalCandidate<T>[])[],
  options: { k?: number; limit?: number } = {},
): FusedLegalCandidate<T>[] {
  const k = options.k ?? 60;
  if (!Number.isFinite(k) || k < 0) throw new TypeError("Invalid RRF k.");
  const fused = new Map<string, {
    value: T;
    score: number;
    firstSeen: number;
    ranks: number[];
  }>();
  let firstSeen = 0;
  for (const ranking of rankings) {
    for (const [index, candidate] of ranking.entries()) {
      if (!candidate.id) throw new TypeError("RRF candidates need a stable id.");
      const current = fused.get(candidate.id) ?? {
        value: candidate.value,
        score: 0,
        firstSeen: firstSeen++,
        ranks: [],
      };
      current.score += 1 / (k + index + 1);
      current.ranks.push(index + 1);
      fused.set(candidate.id, current);
    }
  }
  return [...fused.entries()]
    .map(([id, item]) => ({ id, value: item.value, score: item.score, ranks: item.ranks }))
    .sort((left, right) => right.score - left.score || (
      fused.get(left.id)!.firstSeen - fused.get(right.id)!.firstSeen
    ))
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
}
