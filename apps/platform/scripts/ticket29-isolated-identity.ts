import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { stableSourceSnapshotJson } from "../lib/legal-corpus/source-snapshot";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function publisherTokensMatch(input: {
  sourceVersionId: string;
  sourceRevisionSha256: string;
  publisherRevisionToken: string;
  sourcePublisherRevisionToken: string;
  legacyTargetPublisherRevisionToken: string;
}): boolean {
  const legacy = /^(\d+):([a-f0-9]{64})$/u.exec(input.legacyTargetPublisherRevisionToken);
  if (!legacy || legacy[2] !== input.sourceRevisionSha256
    || input.publisherRevisionToken !== input.sourcePublisherRevisionToken) return false;
  try {
    const parsed = JSON.parse(input.publisherRevisionToken) as Record<string, unknown>;
    return stableSourceSnapshotJson(parsed) === input.publisherRevisionToken
      && parsed.sourceVersionId === input.sourceVersionId
      && parsed.versionNumber === Number(legacy[1])
      && Number.isSafeInteger(parsed.versionNumber)
      && (parsed.versionDate === null || typeof parsed.versionDate === "string");
  } catch {
    return false;
  }
}

type Ticket29IdentityRow = {
  sourceId: string;
  sourceDocumentId: string;
  sourceVersionId: string;
  sourceRevisionSha256: string;
  language: string;
  script: string;
  textualAuthority: string;
  validFrom: string | null;
  validTo: string | null;
  instrumentId: string;
  officialExpressionId: string;
  textRevisionId: string;
  provisionConceptId: string;
  provisionRenditionId: string;
  legacyCurrentRenditionId: string;
  publisherRevisionToken: string;
  legacyTargetPublisherRevisionToken: string;
  sourcePublisherRevisionToken: string;
  publisherProvisionToken: string;
  applicabilityIdentity: string;
};

export function countTicket29IdentityMismatches(
  database: DatabaseSync,
  runId: string,
): number {
  let identityMismatches = 0;
  const identityRows = database.prepare(`SELECT source_id AS sourceId,
      source_document_id AS sourceDocumentId,source_version_id AS sourceVersionId,
      source_revision_sha256 AS sourceRevisionSha256,language,script,
      textual_authority AS textualAuthority,valid_from AS validFrom,valid_to AS validTo,
      instrument_id AS instrumentId,official_expression_id AS officialExpressionId,
      text_revision_id AS textRevisionId,provision_concept_id AS provisionConceptId,
      provision_rendition_id AS provisionRenditionId,
      legacy_current_rendition_id AS legacyCurrentRenditionId,
      publisher_revision_token AS publisherRevisionToken,
      legacy_target_publisher_revision_token AS legacyTargetPublisherRevisionToken,
      source_publisher_revision_token AS sourcePublisherRevisionToken,
      publisher_provision_token AS publisherProvisionToken,
      applicability_identity AS applicabilityIdentity
    FROM legal_complete_corpus_records WHERE run_id=?`).iterate(runId) as Iterable<Ticket29IdentityRow>;
  for (const row of identityRows) {
    const instrumentId = `instrument:${sha256(row.sourceDocumentId)}`;
    const officialExpressionId = `expression:${sha256(
      `${instrumentId}\u0000${row.language}\u0000${row.script}\u0000${row.textualAuthority}`)}`;
    const textRevisionId = `revision:${sha256([row.sourceDocumentId, row.language, row.script,
      row.textualAuthority, row.sourcePublisherRevisionToken].join("|"))}`;
    const provisionConceptId = `concept:${sha256(`source-provision:${row.sourceId}`)}`;
    const applicabilityIdentity = `${row.validFrom ?? "gap"}/${row.validTo ?? ""}`;
    const provisionRenditionId = `rendition:${sha256([row.sourceDocumentId, provisionConceptId,
      row.publisherProvisionToken, textRevisionId, row.language, row.script,
      row.textualAuthority, applicabilityIdentity].join("|"))}`;
    const legacyRevisionId = `revision:${sha256(
      `${officialExpressionId}\u0000${row.sourceRevisionSha256}`)}`;
    // Independently reconstruct Ticket 28's natural-key preimage rather than
    // importing the production helper that this proof is meant to check.
    const legacyProvisionConceptId = `concept:${sha256(
      `${instrumentId}\u0000${row.publisherProvisionToken}`,
    )}`;
    const legacyCurrentRenditionId = `rendition:${sha256(
      `${legacyProvisionConceptId}\u0000${legacyRevisionId}`)}`;
    if (row.instrumentId !== instrumentId || row.officialExpressionId !== officialExpressionId
      || row.textRevisionId !== textRevisionId || row.provisionConceptId !== provisionConceptId
      || row.provisionRenditionId !== provisionRenditionId
      || row.legacyCurrentRenditionId !== legacyCurrentRenditionId
      || row.applicabilityIdentity !== applicabilityIdentity
      || !publisherTokensMatch({ sourceVersionId: row.sourceVersionId,
        sourceRevisionSha256: row.sourceRevisionSha256,
        publisherRevisionToken: row.publisherRevisionToken,
        sourcePublisherRevisionToken: row.sourcePublisherRevisionToken,
        legacyTargetPublisherRevisionToken: row.legacyTargetPublisherRevisionToken })) {
      identityMismatches += 1;
    }
  }
  return identityMismatches;
}
