export type SparseTermEntry = {
  term: string;
  termFrequency: number;
  titleFrequency: number;
  articleFrequency: number;
};

function countSparseTerms(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  const normalized = value.toLocaleLowerCase("und").normalize("NFKC");
  for (const token of normalized.match(/[\p{L}\p{N}][\p{L}\p{N}._-]{0,80}/gu) ?? []) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function buildSparseTermEntries(input: {
  text: string;
  articleNumber: string | null;
  title: string | null;
}): SparseTermEntry[] {
  const body = countSparseTerms(input.text);
  const title = countSparseTerms(input.title ?? "");
  const article = countSparseTerms(input.articleNumber ?? "");
  return [...new Set([...body.keys(), ...title.keys(), ...article.keys()])]
    .map((term) => ({
      term,
      termFrequency: body.get(term) ?? 0,
      titleFrequency: title.get(term) ?? 0,
      articleFrequency: article.get(term) ?? 0,
    }))
    .sort((left, right) => {
      const leftWeight = left.termFrequency + left.titleFrequency * 4 + left.articleFrequency * 8;
      const rightWeight = right.termFrequency + right.titleFrequency * 4 + right.articleFrequency * 8;
      return rightWeight - leftWeight || left.term.localeCompare(right.term);
    })
    .slice(0, 512);
}

export function sparseTermsJson(entries: readonly SparseTermEntry[]): string {
  return JSON.stringify(entries);
}
