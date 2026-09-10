import { detectArticleNumbers } from "../legal/legal-language";
import { sameInstrumentArticleReferences } from "../legal/referenced-article-context";
type ReferenceCandidate = {
  citationLabel: string;
  provisionText: string;
  candidate: {textRevisionId: string; languageFamily: string; candidate: {itemKey: string}};
};

/** Keep explicitly connected provisions together so a batch can assess a
 * rule and its incorporated grounds without requesting another search. Every
 * candidate is assessed once; ranking and publication selection are unchanged. */
export function selectionAssessmentBatches<T extends ReferenceCandidate>(candidates: readonly T[], batchSize: number): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new TypeError("Invalid assessment batch size");
  const articles = candidates.map(candidate => detectArticleNumbers(candidate.citationLabel)[0]);
  const references = candidates.map(candidate => new Set(sameInstrumentArticleReferences(candidate.provisionText)));
  const neighbors = candidates.map((source, index) => candidates.flatMap((target, targetIndex) =>
    index !== targetIndex && source.candidate.textRevisionId === target.candidate.textRevisionId
      && source.candidate.languageFamily === target.candidate.languageFamily
      && ((articles[targetIndex] && references[index]!.has(articles[targetIndex]!))
        || (articles[index] && references[targetIndex]!.has(articles[index]!))) ? [targetIndex] : []));
  const remaining = new Set(candidates.map((_, index) => index));
  const batches: T[][] = [];
  while (remaining.size) {
    const batch: T[] = [];
    const related = new Set<number>();
    while (batch.length < batchSize && remaining.size) {
      const next = [...related].find(index => remaining.has(index)) ?? remaining.values().next().value!;
      remaining.delete(next);
      related.delete(next);
      batch.push(candidates[next]!);
      for (const neighbor of neighbors[next]!) if (remaining.has(neighbor)) related.add(neighbor);
    }
    batches.push(batch);
  }
  return batches;
}

/** Supply both ends of already-verified same-revision references to each small
 * assessment batch. The referring rule establishes the scope in which generic
 * referenced grounds apply. A reference outside the batch is not missing evidence. Context does
 * not create a support mapping: every candidate is still assessed in its own
 * batch, and each resulting claim still requires evidence validation. */
export function selectionReferenceContext(
  batch: readonly ReferenceCandidate[],
  candidates: readonly ReferenceCandidate[],
): Array<{citationLabel: string; provisionText: string}> {
  const batchKeys = new Set(batch.map(item => item.candidate.candidate.itemKey));
  const context = new Map<string, ReferenceCandidate>();
  for (const source of batch) {
    const references = new Set(sameInstrumentArticleReferences(source.provisionText));
    for (const candidate of candidates) {
      const key = candidate.candidate.candidate.itemKey;
      if (batchKeys.has(key) || context.has(key)
        || candidate.candidate.textRevisionId !== source.candidate.textRevisionId
        || candidate.candidate.languageFamily !== source.candidate.languageFamily) continue;
      const article = detectArticleNumbers(candidate.citationLabel)[0];
      if (article && references.has(article)) context.set(key, candidate);
      if (context.size >= 4) break;
    }
    if (context.size >= 4) break;
  }
  // Outgoing operative text has priority. With the remaining bounded context,
  // let a grounds provision see which supplied rule expressly incorporates it.
  // This supplies scope for assessment, never an automatic support mapping.
  for (const target of batch) {
    if (context.size >= 4) break;
    const article = detectArticleNumbers(target.citationLabel)[0];
    if (!article) continue;
    for (const referring of candidates) {
      const key = referring.candidate.candidate.itemKey;
      if (batchKeys.has(key) || context.has(key)
        || referring.candidate.textRevisionId !== target.candidate.textRevisionId
        || referring.candidate.languageFamily !== target.candidate.languageFamily) continue;
      if (sameInstrumentArticleReferences(referring.provisionText).includes(article)) context.set(key, referring);
      if (context.size >= 4) break;
    }
  }
  return [...context.values()].map(({citationLabel, provisionText}) => ({citationLabel, provisionText}));
}
