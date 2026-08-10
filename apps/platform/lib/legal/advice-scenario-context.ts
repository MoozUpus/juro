/**
 * Reviewed Advice.uz scenarios are private planning context only. They never
 * become a citation, a sourceId, or a URL in a JURO answer. Legal conclusions
 * still require a query-scoped official Lex.uz source.
 */
export type AdviceScenarioContext = {
  title: string;
  summary: string;
};

type AdviceScenarioRow = AdviceScenarioContext;

const STOPWORDS = new Set([
  "какие", "какой", "когда", "права", "право", "нужен", "нужно", "чтобы", "почему", "после",
  "qanday", "qachon", "uchun", "kerak", "huquq", "qonun", "javob", "bilan", "keyin",
]);

function queryTerms(question: string): string[] {
  return [...new Set(
    (question.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
      .filter((term) => !STOPWORDS.has(term)),
  )].slice(0, 12);
}

/**
 * Select only scenarios whose underlying Advice source has completed the
 * existing review → publication → current-activation lifecycle. A pending or
 * manually uploaded scenario is never sent to the provider.
 */
export async function findReviewedAdviceScenarioContext(input: {
  db: D1Database;
  question: string;
  locale: "ru" | "uz";
  limit?: number;
}): Promise<AdviceScenarioContext[]> {
  const terms = queryTerms(input.question);
  if (terms.length === 0) return [];
  let rows: { results: AdviceScenarioRow[] };
  try {
    rows = await input.db.prepare(`
    SELECT scenario.title,version.summary_text AS summary
    FROM advice_scenarios scenario
    INNER JOIN legal_source_current_activations activation
      ON activation.source_id=scenario.source_id
    INNER JOIN legal_sources source
      ON source.id=activation.source_id
    INNER JOIN legal_source_versions legal_version
      ON legal_version.id=activation.version_id AND legal_version.source_id=source.id
    INNER JOIN scenario_versions version
      ON version.scenario_id=scenario.id AND version.legal_source_version_id=legal_version.id
    WHERE scenario.locale=?
      AND source.source_type='advice'
      AND source.status='verified' AND source.verification_state='verified'
      AND legal_version.status='verified'
    ORDER BY scenario.updated_at DESC,scenario.id DESC
    LIMIT 48
    `).bind(input.locale).all<AdviceScenarioRow>();
  } catch {
    // Scenario guidance is optional. It must never block the direct Lex.uz
    // verification path or turn a source-pipeline outage into a chat outage.
    return [];
  }
  const ranked = rows.results.map((row) => {
    const haystack = `${row.title}\n${row.summary}`.toLocaleLowerCase();
    return { row, score: terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0) };
  }).filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(input.limit ?? 2, 3)));
  return ranked.map(({ row }) => ({
    title: row.title.slice(0, 500),
    summary: row.summary.slice(0, 4_000),
  }));
}
