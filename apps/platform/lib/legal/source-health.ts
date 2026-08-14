import {
  legalDatabaseFreshnessFromCorpusRuns,
  type LegalDatabaseFreshness,
} from "./verified-retrieval";

type CorpusRun = {
  sourceKind: string;
  status: string;
  finishedAt: string | null;
  discoveredCount: number;
  fetchedCount: number;
  changedCount: number;
  verifiedCount: number;
  errorCount: number;
};
type Count = { total: number };

export type LegalSourceHealth = {
  freshness: LegalDatabaseFreshness;
  latestRuns: Array<{ sourceKind: "lex"; status: string; finishedAt: string | null; errorCount: number }>;
  pendingReviewCount: number;
  approvedPendingPublicationCount: number;
  pendingFetchCount: number;
};

export async function legalSourceHealth(
  db: D1Database,
  now = new Date(),
): Promise<LegalSourceHealth> {
  const [runs, review, approved, fetches] = await Promise.all([
    db.prepare(`
      SELECT source_kind AS sourceKind,status,finished_at AS finishedAt,
        discovered_count AS discoveredCount,fetched_count AS fetchedCount,
        changed_count AS changedCount,verified_count AS verifiedCount,
        error_count AS errorCount
      FROM source_sync_runs
      WHERE run_type IN ('scheduled_corpus','manual_corpus')
        AND source_kind='lex'
      ORDER BY started_at DESC LIMIT 24
    `).all<CorpusRun>(),
    db.prepare("SELECT count(*) AS total FROM legal_review_queue WHERE status IN ('pending','in_review')")
      .first<Count>(),
    db.prepare("SELECT count(*) AS total FROM legal_review_queue WHERE status='approved'")
      .first<Count>(),
    db.prepare("SELECT count(*) AS total FROM legal_source_fetch_requests WHERE status IN ('queued','retrying','running')")
      .first<Count>(),
  ]);
  const latest = new Map<"lex", CorpusRun>();
  for (const run of runs.results) {
    if (run.sourceKind !== "lex" || latest.has(run.sourceKind)) continue;
    latest.set(run.sourceKind, run);
  }
  const latestRuns = (["lex"] as const).flatMap((sourceKind) => {
    const run = latest.get(sourceKind);
    return run ? [{ sourceKind, status: run.status, finishedAt: run.finishedAt, errorCount: Number(run.errorCount ?? 0) }] : [];
  });
  const successful = runs.results
    .filter((run) => run.status === "success"
      && Number(run.discoveredCount) > 0
      && Number(run.fetchedCount) === Number(run.discoveredCount)
      && Number(run.verifiedCount) === Number(run.discoveredCount)
      && Number(run.changedCount) === 0
      && Number(run.errorCount) === 0)
    .map((run) => ({ sourceKind: run.sourceKind, finishedAt: run.finishedAt }));
  return {
    freshness: legalDatabaseFreshnessFromCorpusRuns(successful, now),
    latestRuns,
    pendingReviewCount: Number(review?.total ?? 0),
    approvedPendingPublicationCount: Number(approved?.total ?? 0),
    pendingFetchCount: Number(fetches?.total ?? 0),
  };
}
