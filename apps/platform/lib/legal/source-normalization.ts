import { z } from "zod";
import {
  LegalSourceParserError,
  normalizeLegalSourceHtml,
  normalizedLegalSourceSnapshotSchema,
} from "./source-parser";
import { classifyLegalSourceUrl } from "./source-fetch";

export const LEGAL_SOURCE_NORMALIZATION_ERROR_CODES = [
  "LEGAL_SOURCE_VERSION_NOT_FOUND",
  "LEGAL_SOURCE_VERSION_STATE_REJECTED",
  "LEGAL_SOURCE_NORMALIZATION_CONFLICT",
  "LEGAL_SOURCE_RAW_OBJECT_MISSING",
  "LEGAL_SOURCE_RAW_OBJECT_TOO_LARGE",
  "LEGAL_SOURCE_RAW_HASH_MISMATCH",
  "LEGAL_SOURCE_RAW_ENCODING_REJECTED",
  "LEGAL_SOURCE_NORMALIZATION_FAILED",
  "LEGAL_SOURCE_NORMALIZED_OBJECT_TOO_LARGE",
  "LEGAL_SOURCE_NORMALIZED_HASH_MISMATCH",
  "LEGAL_SOURCE_NORMALIZED_CONTENT_REJECTED",
  "LEGAL_SOURCE_NORMALIZED_STORAGE_FAILED",
  "LEGAL_SOURCE_NORMALIZED_PERSISTENCE_FAILED",
] as const;

export type LegalSourceNormalizationErrorCode =
  (typeof LEGAL_SOURCE_NORMALIZATION_ERROR_CODES)[number];

export class LegalSourceNormalizationError extends Error {
  constructor(
    readonly code: LegalSourceNormalizationErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "LegalSourceNormalizationError";
  }
}

export type LegalSourceNormalizationEnv = Pick<Env, "APP_ENV" | "BUCKET" | "DB">;

export type LegalSourceNormalizationResult = {
  versionId: string;
  parsedObjectKey: string;
  parsedContentSha256: string;
  blockCount: number;
  changed: boolean;
};

type VersionRow = {
  id: string;
  source_id: string;
  language: "ru" | "uz";
  status: string;
  content_sha256: string;
  raw_object_key: string;
  parsed_object_key: string | null;
  metadata_json: string;
  canonical_id: string | null;
  official_url: string;
  source_type: "lex" | "advice";
  verification_state: string;
};

const identifierSchema = z.string().min(1).max(180)
  .regex(/^[A-Za-z0-9:_-]+$/);
const metadataSchema = z.record(z.string(), z.unknown());
const MAX_RAW_BYTES = 2 * 1024 * 1024;
const MAX_PARSED_BYTES = 4 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;

async function sha256(bytes: Uint8Array): Promise<string> {
  const digestBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestBytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_RAW_ENCODING_REJECTED",
      false,
    );
  }
}

function parseMetadata(value: string): Record<string, unknown> {
  if (new TextEncoder().encode(value).byteLength > MAX_METADATA_BYTES) {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZATION_CONFLICT",
      false,
    );
  }
  try {
    return metadataSchema.parse(JSON.parse(value));
  } catch (error) {
    if (error instanceof LegalSourceNormalizationError) throw error;
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZATION_CONFLICT",
      false,
    );
  }
}

async function loadVersion(
  db: D1Database,
  versionId: string,
): Promise<VersionRow | null> {
  return db.prepare(`
    SELECT
      version.id, version.source_id, version.language, version.status,
      version.content_sha256, version.raw_object_key,
      version.parsed_object_key, version.metadata_json,
      source.canonical_id, source.official_url, source.source_type,
      source.verification_state
    FROM legal_source_versions AS version
    INNER JOIN legal_sources AS source ON source.id = version.source_id
    WHERE version.id = ?
    LIMIT 1
  `).bind(versionId).first<VersionRow>();
}

async function requireStoredSnapshot(
  bucket: R2Bucket,
  key: string,
  expected: {
    contentSha256: string;
    row: VersionRow;
  },
): Promise<void> {
  let object: R2ObjectBody | null;
  try {
    object = await bucket.get(key);
  } catch {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZED_STORAGE_FAILED",
      true,
    );
  }
  if (!object) {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZED_STORAGE_FAILED",
      true,
    );
  }
  if (object.size === 0 || object.size > MAX_PARSED_BYTES) {
    try {
      await object.body.cancel();
    } catch {
      // Cancellation is best effort after a size rejection.
    }
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZED_OBJECT_TOO_LARGE",
      false,
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await object.arrayBuffer());
  } catch {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZED_STORAGE_FAILED",
      true,
    );
  }
  if (
    bytes.byteLength === 0
    || bytes.byteLength > MAX_PARSED_BYTES
    || await sha256(bytes) !== expected.contentSha256
  ) {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZED_HASH_MISMATCH",
      false,
    );
  }
  try {
    const snapshot = normalizedLegalSourceSnapshotSchema.parse(
      JSON.parse(decodeUtf8(bytes)),
    );
    if (
      snapshot.source.rawContentSha256 !== expected.row.content_sha256
      || snapshot.source.sourceKind !== expected.row.source_type
      || snapshot.source.locale !== expected.row.language
      || snapshot.source.canonicalId !== expected.row.canonical_id
      || snapshot.source.canonicalUrl !== expected.row.official_url
    ) {
      throw new TypeError("Normalized source identity does not match D1.");
    }
  } catch {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZED_CONTENT_REJECTED",
      false,
    );
  }
}

async function recordNormalizationReview(
  db: D1Database,
  row: VersionRow,
  now: string,
): Promise<void> {
  const digest = await sha256(new TextEncoder().encode(
    `${row.id}\nnormalization_failed`,
  ));
  await db.prepare(`
    INSERT INTO legal_review_queue (
      id, source_id, version_id, reason_code, confidence,
      status, assigned_to_user_id, decision, decided_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'normalization_failed', 'low',
      'pending', NULL, NULL, NULL, ?, ?)
    ON CONFLICT(version_id, reason_code) DO NOTHING
  `).bind(
    `lsreview_${digest.slice(0, 32)}`,
    row.source_id,
    row.id,
    now,
    now,
  ).run();
}

export async function executeLegalSourceNormalization(
  env: LegalSourceNormalizationEnv,
  versionId: string,
  dependencies: { now?: () => Date } = {},
): Promise<LegalSourceNormalizationResult> {
  identifierSchema.parse(versionId);
  const row = await loadVersion(env.DB, versionId);
  if (!row) {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_VERSION_NOT_FOUND",
      false,
    );
  }
  if (row.parsed_object_key) {
    const metadata = parseMetadata(row.metadata_json);
    const normalization = z.object({
      contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
      blockCount: z.number().int().nonnegative(),
    }).passthrough().safeParse(metadata.normalization);
    if (!normalization.success) {
      throw new LegalSourceNormalizationError(
        "LEGAL_SOURCE_NORMALIZATION_CONFLICT",
        false,
      );
    }
    await requireStoredSnapshot(env.BUCKET, row.parsed_object_key, {
      contentSha256: normalization.data.contentSha256,
      row,
    });
    return {
      versionId: row.id,
      parsedObjectKey: row.parsed_object_key,
      parsedContentSha256: normalization.data.contentSha256,
      blockCount: normalization.data.blockCount,
      changed: false,
    };
  }
  if (row.status !== "pending_review" || row.verification_state === "rejected") {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_VERSION_STATE_REJECTED",
      false,
    );
  }

  let rawObject: R2ObjectBody | null;
  try {
    const candidate = await env.BUCKET.get(row.raw_object_key);
    rawObject = candidate && "body" in candidate ? candidate : null;
  } catch {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_RAW_OBJECT_MISSING",
      true,
    );
  }
  if (!rawObject) {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_RAW_OBJECT_MISSING",
      true,
    );
  }
  if (rawObject.size > MAX_RAW_BYTES) {
    try {
      await rawObject.body.cancel();
    } catch {
      // Cancellation is best effort after a size rejection.
    }
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_RAW_OBJECT_TOO_LARGE",
      false,
    );
  }

  let rawBytes: Uint8Array;
  try {
    rawBytes = new Uint8Array(await rawObject.arrayBuffer());
  } catch {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_RAW_OBJECT_MISSING",
      true,
    );
  }
  if (rawBytes.byteLength === 0 || rawBytes.byteLength > MAX_RAW_BYTES) {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_RAW_OBJECT_TOO_LARGE",
      false,
    );
  }
  if (await sha256(rawBytes) !== row.content_sha256) {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_RAW_HASH_MISMATCH",
      false,
    );
  }

  let reference;
  try {
    reference = classifyLegalSourceUrl(row.official_url);
  } catch {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZATION_CONFLICT",
      false,
    );
  }
  if (
    reference.sourceKind !== row.source_type
    || reference.locale !== row.language
    || reference.canonicalId !== row.canonical_id
  ) {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZATION_CONFLICT",
      false,
    );
  }

  let snapshot;
  const now = (dependencies.now ?? (() => new Date()))().toISOString();
  try {
    snapshot = normalizeLegalSourceHtml({
      html: decodeUtf8(rawBytes),
      reference,
      rawContentSha256: row.content_sha256,
    });
  } catch (error) {
    if (error instanceof LegalSourceParserError) {
      try {
        await recordNormalizationReview(env.DB, row, now);
      } catch {
        throw new LegalSourceNormalizationError(
          "LEGAL_SOURCE_NORMALIZED_PERSISTENCE_FAILED",
          true,
        );
      }
      throw new LegalSourceNormalizationError(
        "LEGAL_SOURCE_NORMALIZATION_FAILED",
        false,
      );
    }
    throw error;
  }

  const serialized = JSON.stringify(snapshot);
  const parsedBytes = new TextEncoder().encode(serialized);
  const parsedContentSha256 = await sha256(parsedBytes);
  const parsedObjectKey = [
    "legal-sources",
    "parsed",
    reference.sourceKind,
    reference.locale,
    row.content_sha256.slice(0, 2),
    row.content_sha256,
    `parse5-v1-${parsedContentSha256}.json`,
  ].join("/");

  try {
    if (!await env.BUCKET.head(parsedObjectKey)) {
      const stored = await env.BUCKET.put(parsedObjectKey, parsedBytes, {
        httpMetadata: {
          contentType: "application/json; charset=utf-8",
          cacheControl: "private, no-store",
        },
        customMetadata: {
          sourceKind: reference.sourceKind,
          locale: reference.locale,
          canonicalId: reference.canonicalId,
          rawContentSha256: row.content_sha256,
          parsedContentSha256,
          parserProfile: "juro-legal-blocks-v1",
          parsedAt: now,
        },
      });
      if (!stored) throw new TypeError("R2 put did not persist parsed source.");
    }
  } catch {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZED_STORAGE_FAILED",
      true,
    );
  }
  await requireStoredSnapshot(env.BUCKET, parsedObjectKey, {
    contentSha256: parsedContentSha256,
    row,
  });

  const metadata = parseMetadata(row.metadata_json);
  const nextMetadata = JSON.stringify({
    ...metadata,
    normalization: {
      parser: "parse5",
      parserVersion: "8.0.1",
      profile: "juro-legal-blocks-v1",
      contentSha256: parsedContentSha256,
      blockCount: snapshot.blocks.length,
      parsedAt: now,
    },
  });
  if (new TextEncoder().encode(nextMetadata).byteLength > MAX_METADATA_BYTES) {
    throw new LegalSourceNormalizationError(
      "LEGAL_SOURCE_NORMALIZATION_CONFLICT",
      false,
    );
  }

  const result = await env.DB.prepare(`
    UPDATE legal_source_versions
    SET parsed_object_key = ?, metadata_json = ?, updated_at = ?
    WHERE id = ? AND source_id = ? AND status = 'pending_review'
      AND parsed_object_key IS NULL AND content_sha256 = ?
  `).bind(
    parsedObjectKey,
    nextMetadata,
    now,
    row.id,
    row.source_id,
    row.content_sha256,
  ).run();
  if (Number(result.meta.changes ?? 0) !== 1) {
    const replay = await loadVersion(env.DB, row.id);
    if (replay?.parsed_object_key !== parsedObjectKey) {
      throw new LegalSourceNormalizationError(
        "LEGAL_SOURCE_NORMALIZED_PERSISTENCE_FAILED",
        true,
      );
    }
  }

  return {
    versionId: row.id,
    parsedObjectKey,
    parsedContentSha256,
    blockCount: snapshot.blocks.length,
    changed: Number(result.meta.changes ?? 0) === 1,
  };
}
