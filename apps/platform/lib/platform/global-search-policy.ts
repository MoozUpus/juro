export type GlobalSearchRow = Record<string, unknown> & {
  title?: unknown;
  subtitle?: unknown;
  searchScore?: unknown;
};

const SEARCH_STOP_WORDS = new Set([
  "как", "или", "для", "при", "это", "что", "можно", "нужно", "билан",
  "uchun", "qanday", "mumkin", "kerak", "nima",
]);

const SEARCH_SUFFIXES = [
  "иями", "ями", "ами", "ение", "ения", "ений", "ировать", "аться", "яться",
  "иться", "ать", "ять", "ить", "еть", "уть", "ого", "ему", "ому", "ыми", "ими",
  "lar", "ning", "dan", "ga", "ni", "da", "lik", "chi", "uvchi",
  "ая", "яя", "ое", "ее", "ые", "ие", "ый", "ий", "ой", "ов", "ев", "ам", "ям",
] as const;

export function normalizeGlobalSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function searchTokens(value: string) {
  return normalizeGlobalSearchText(value).split(" ").filter((token) => token.length >= 2);
}

function searchStem(token: string) {
  const normalized = normalizeGlobalSearchText(token);
  const suffix = SEARCH_SUFFIXES.find((candidate) => normalized.length - candidate.length >= 4
    && normalized.endsWith(candidate));
  return (suffix ? normalized.slice(0, -suffix.length) : normalized).replace(/[ьъ]/gu, "");
}

export function globalSearchQueryMode(value: string): "recent" | "incomplete" | "search" {
  if (!value.trim()) return "recent";
  return normalizeGlobalSearchText(value).length >= 2 ? "search" : "incomplete";
}

export function globalSearchFuzzyNeedle(value: string) {
  const stems = searchTokens(value)
    .filter((token) => !SEARCH_STOP_WORDS.has(token))
    .map(searchStem)
    .filter((token) => token.length >= 4);
  return (stems[0] ?? normalizeGlobalSearchText(value)).slice(0, 4);
}

function tokenSimilarity(left: string, right: string) {
  const leftStem = searchStem(left);
  const rightStem = searchStem(right);
  if (leftStem === rightStem) return 72;
  if (Math.min(leftStem.length, rightStem.length) >= 4
    && (leftStem.startsWith(rightStem) || rightStem.startsWith(leftStem))) return 64;
  return 0;
}

function globalSearchScore(row: GlobalSearchRow, query: string) {
  if (!query) return 1;
  const title = normalizeGlobalSearchText(String(row.title ?? ""));
  const subtitle = normalizeGlobalSearchText(String(row.subtitle ?? ""));
  const needle = normalizeGlobalSearchText(query);
  if (title === needle) return 120;
  if (title.startsWith(needle)) return 108;
  if (title.includes(needle)) return 96;
  if (subtitle.includes(needle)) return 88;
  const queryTokens = searchTokens(needle).filter((token) => !SEARCH_STOP_WORDS.has(token));
  const candidateTokens = searchTokens(`${title} ${subtitle}`);
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const matched = queryTokens.map((token) => Math.max(
    0,
    ...candidateTokens.map((candidate) => tokenSimilarity(token, candidate)),
  ));
  if (matched.some((score) => score === 0)) return 0;
  return Math.round(matched.reduce((sum, score) => sum + score, 0) / matched.length);
}

export function rankGlobalSearchRows<Row extends GlobalSearchRow>(
  rows: readonly Row[],
  query: string,
  limit?: number,
): Array<Row & { searchScore: number }>;
export function rankGlobalSearchRows(
  rows: readonly unknown[],
  query: string,
  limit?: number,
): Array<GlobalSearchRow & { searchScore: number }>;
export function rankGlobalSearchRows(
  rows: readonly unknown[],
  query: string,
  limit = 6,
): Array<GlobalSearchRow & { searchScore: number }> {
  return rows
    .map((item, index) => {
      const row = item as GlobalSearchRow;
      return { item: row, score: globalSearchScore(row, query), index };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ item, score }) => ({ ...item, searchScore: score }));
}

export function semanticGlobalSearchScore(score: number) {
  const normalized = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  return 40 + Math.round(normalized * 19);
}

export function globalSearchGroupScore(rows: readonly GlobalSearchRow[]) {
  return Math.max(0, ...rows.map((row) => Number(row.searchScore) || 0));
}
