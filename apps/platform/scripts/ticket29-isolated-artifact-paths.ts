import { realpath, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

type Ticket29ArtifactPaths = {
  databasePath: string;
  checkpointPath: string;
  reportPath: string;
};

type PathIdentity = {
  label: keyof Ticket29ArtifactPaths;
  resolvedPath: string;
  canonicalPath: string;
  device: number | bigint | null;
  inode: number | bigint | null;
};

const TICKET29_BODY_FREE_SCHEMA: Readonly<Record<string, readonly string[]>> = {
  legal_complete_corpus_runs: ["id", "schema_version", "source_cutoff", "source_bookmark", "source_inventory_sha256", "source_canonical_sha256", "source_alias_sha256", "source_r2_object_manifest_sha256", "source_r2_alias_manifest_sha256", "source_empty_version_manifest_sha256", "plan_r2_key", "plan_sha256", "final_reconstruction_r2_key", "final_reconstruction_sha256", "status", "expected_record_count", "materialized_record_count", "created_at", "updated_at", "completed_at"],
  legal_complete_corpus_objects: ["run_id", "object_kind", "sha256", "r2_key", "byte_count", "materialization_disposition", "media_type", "schema_version", "normalization_version", "source_r2_key", "source_sha256", "source_normalized_sha256", "descriptor_sha256", "created_at"],
  legal_complete_corpus_records: ["run_id", "source_id", "source_document_id", "source_version_id", "instrument_id", "official_expression_id", "text_revision_id", "provision_concept_id", "provision_rendition_id", "legacy_current_rendition_id", "publisher_revision_token", "legacy_target_publisher_revision_token", "source_publisher_revision_token", "publisher_provision_token", "applicability_identity", "identity_stage", "textual_authority", "provision_source_url", "version_source_url", "previous_source_version_id", "source_change_type", "source_revision_sha256", "object_metadata_revision_sha256", "record_sha256", "legal_identity_sha256", "material_sha256", "content_sha256", "raw_source_r2_key", "raw_source_sha256", "normalized_source_r2_key", "normalized_source_sha256", "raw_object_r2_key", "normalized_object_r2_key", "provision_object_r2_key", "provision_object_sha256", "language", "script", "ordinal", "valid_from", "valid_to", "current_eligible", "historical_eligible", "temporal_gap", "quarantined", "created_at"],
  legal_complete_corpus_aliases: ["run_id", "owner_kind", "owner_id", "target_identity", "alias_kind", "alias_sha256", "alias_value", "row_sha256", "created_at"],
  legal_complete_corpus_lineage_refs: ["run_id", "source_version_id", "previous_source_version_id", "change_type", "row_sha256", "created_at"],
  legal_complete_corpus_quarantines: ["run_id", "source_version_id", "source_document_id", "instrument_id", "official_expression_id", "text_revision_id", "publisher_revision_token", "legacy_target_publisher_revision_token", "source_publisher_revision_token", "identity_stage", "language", "script", "version_source_url", "canonical_source_url", "previous_source_version_id", "source_change_type", "source_availability_status", "source_revision_sha256", "raw_source_r2_key", "raw_source_sha256", "normalized_source_r2_key", "normalized_source_sha256", "raw_object_r2_key", "normalized_object_r2_key", "reason", "row_sha256", "created_at"],
  legal_complete_corpus_quarantine_attempts: ["run_id", "attempt_id", "record_count", "created_object_count", "reused_object_count", "created_byte_count", "reused_byte_count", "root_sha256", "completed_at"],
  legal_complete_corpus_interruptions: ["run_id", "page_sha256", "checkpoint", "record_count", "created_object_count", "reused_object_count", "created_byte_count", "reused_byte_count", "recorded_at"],
  legal_complete_corpus_pages: ["run_id", "page_sha256", "plan_offset", "plan_length", "plan_r2_key", "record_count", "created_object_count", "reused_object_count", "created_byte_count", "reused_byte_count", "receipt_sha256", "completed_at"],
  legal_complete_corpus_attempt_pages: ["run_id", "attempt_id", "page_sha256", "record_count", "created_object_count", "reused_object_count", "created_byte_count", "reused_byte_count", "receipt_sha256", "completed_at"],
  legal_complete_corpus_manifests: ["run_id", "membership", "record_count", "root_sha256", "r2_key", "manifest_sha256", "created_at"],
  legal_complete_corpus_lane_reports: ["run_id", "report_kind", "lane", "record_count", "current_count", "history_count", "gap_count", "verified_object_count", "root_sha256", "r2_key", "report_sha256", "created_at"],
  legal_complete_corpus_control_attempts: ["run_id", "attempt_id", "stage", "lane", "record_count", "created_object_count", "reused_object_count", "created_byte_count", "reused_byte_count", "root_sha256", "completed_at"],
  legal_complete_corpus_qualifications: ["run_id", "report_r2_key", "report_sha256", "report_byte_count", "report_write_disposition", "database_export_sha256", "database_export_byte_count", "evidence_object_count", "evidence_byte_count", "evidence_root_sha256", "qualified_at"],
  legal_complete_corpus_snapshots: ["run_id", "snapshot_id", "source_cutoff", "source_inventory_sha256", "source_canonical_sha256", "source_alias_sha256", "union_root_sha256", "current_root_sha256", "history_root_sha256", "gaps_root_sha256", "quarantines_root_sha256", "r2_key", "snapshot_sha256", "byte_count", "created_at"],
};

export function assertTicket29BodyFreeSchema(
  columns: ReadonlyArray<{ tableName: string; columnName: string }>,
): void {
  const actual: Record<string, string[]> = {};
  for (const { tableName, columnName } of columns) {
    (actual[tableName] ??= []).push(columnName);
  }
  const actualTables = Object.keys(actual).sort();
  const expectedTables = Object.keys(TICKET29_BODY_FREE_SCHEMA).sort();
  const schemaMatches = JSON.stringify(actualTables) === JSON.stringify(expectedTables)
    && expectedTables.every((tableName) => JSON.stringify(actual[tableName])
      === JSON.stringify(TICKET29_BODY_FREE_SCHEMA[tableName]));
  if (!schemaMatches) {
    throw new Error("TICKET29_EXPORTED_D1_SCHEMA_MISMATCH");
  }
}

function comparablePath(value: string): string {
  return process.platform === "win32" ? value.toLocaleLowerCase("en-US") : value;
}

async function pathIdentity(label: keyof Ticket29ArtifactPaths, value: string): Promise<PathIdentity> {
  const resolvedPath = resolve(value);
  try {
    const [canonicalPath, metadata] = await Promise.all([realpath(resolvedPath), stat(resolvedPath)]);
    return {
      label,
      resolvedPath,
      canonicalPath,
      device: metadata.dev,
      inode: metadata.ino,
    };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    const canonicalParent = await realpath(dirname(resolvedPath));
    return {
      label,
      resolvedPath,
      canonicalPath: join(canonicalParent, basename(resolvedPath)),
      device: null,
      inode: null,
    };
  }
}

export async function assertTicket29DistinctArtifactPaths(
  paths: Ticket29ArtifactPaths,
): Promise<{ databasePath: string; checkpointPath: string; reportPath: string }> {
  const identities = await Promise.all((Object.entries(paths) as Array<[
    keyof Ticket29ArtifactPaths,
    string,
  ]>).map(([label, value]) => pathIdentity(label, value)));

  for (let left = 0; left < identities.length; left += 1) {
    for (let right = left + 1; right < identities.length; right += 1) {
      const first = identities[left]!;
      const second = identities[right]!;
      const sameCanonicalPath = comparablePath(first.canonicalPath)
        === comparablePath(second.canonicalPath);
      const sameExistingFile = first.device !== null && second.device !== null
        && first.device === second.device && first.inode === second.inode;
      if (sameCanonicalPath || sameExistingFile) {
        throw new Error(`Ticket 29 isolated artifacts must be distinct: ${first.label} aliases ${second.label}`);
      }
    }
  }

  return {
    databasePath: identities.find(({ label }) => label === "databasePath")!.resolvedPath,
    checkpointPath: identities.find(({ label }) => label === "checkpointPath")!.resolvedPath,
    reportPath: identities.find(({ label }) => label === "reportPath")!.resolvedPath,
  };
}
