import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { stableSourceSnapshotJson } from "../lib/legal-corpus/source-snapshot";

function manifestRoot(database: DatabaseSync, sql: string, runId: string): string {
  const hash = createHash("sha256");
  for (const row of database.prepare(sql).iterate(runId) as Iterable<Record<string, unknown>>) {
    hash.update(stableSourceSnapshotJson(row));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function reconstructTicket28Roots(database: DatabaseSync, runId: string): {
  inventorySha256: string;
  canonicalSha256: string;
  aliasSha256: string;
} {
  return {
    inventorySha256: manifestRoot(database, `SELECT source_id AS sourceId,
      legal_identity_sha256 AS legalIdentitySha256,material_sha256 AS materialSha256,
      content_sha256 AS contentSha256,raw_source_r2_key AS rawObjectKey,
      normalized_source_r2_key AS normalizedObjectKey,current_eligible AS currentEligible,
      historical_eligible AS historicalEligible,temporal_gap AS temporalGap
      FROM legal_complete_corpus_records WHERE run_id=? ORDER BY source_id`, runId),
    canonicalSha256: manifestRoot(database, `SELECT legal_identity_sha256 AS legalIdentitySha256,
      material_sha256 AS materialSha256,content_sha256 AS contentSha256,
      current_eligible AS currentEligible,historical_eligible AS historicalEligible,
      temporal_gap AS temporalGap FROM legal_complete_corpus_records
      WHERE run_id=? ORDER BY legal_identity_sha256`, runId),
    aliasSha256: manifestRoot(database, `SELECT source_id AS sourceId,
      normalized_source_r2_key AS normalizedObjectKey,
      source_revision_sha256 AS revisionVersionSha256,
      object_metadata_revision_sha256 AS objectMetadataVersionSha256
      FROM legal_complete_corpus_records WHERE run_id=?
        AND source_revision_sha256<>object_metadata_revision_sha256 ORDER BY source_id`, runId),
  };
}
