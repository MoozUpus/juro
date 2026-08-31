import {
  LegalSourceFetchError,
  classifyLegalSourceUrl,
  fetchLexArchiveRepresentation,
  fetchLexPdfRepresentation,
  fetchLegalSource,
} from "../legal/source-fetch";
import {
  LEGAL_SOURCE_UI_NOISE_MARKERS,
  LegalSourceParserError,
  normalizeLegalSourceHtml,
  removeLegalSourceUiNoise,
  type NormalizedLegalSourceSnapshot,
} from "../legal/source-parser";
import {
  LegalSourceNormalizationError,
  normalizeLexPdfRepresentation,
} from "../legal/source-normalization";
import { readAnalysisPackageMembers } from "../document-analysis/package-extractor";
import { chunkLegalProvision, parseLegalProvisions } from "./provision-parser";
import {
  discoverLexLanguageVariants,
  discoverLexArchiveRepresentation,
  discoverLexRevisionHistory,
  lexLanguageFamilyId,
  LEX_CORPUS_CATEGORIES,
  LEX_CORPUS_CATEGORY_PRIORITY,
  parseLexDocumentEffectivity,
  parseLexDocumentMetadata,
  parseLexDocumentUrl,
  parseLexRevisionUrl,
  type LexDiscoveredDocument,
  type LexDiscoveredRevision,
} from "./lex-discovery";
import {
  LEGAL_CORPUS_FEATURE_FLAGS,
  autoTrustLexSource,
  featureEnabled,
  type LegalCorpusFeatureFlag,
  type LegalCorpusLanguage,
} from "./trust";
import { diffCorpusProvisions, type CorpusProvisionSnapshot } from "./versioning";
import { LegalCorpusEmbeddingError } from "./embeddings";
import { QdrantCorpusError } from "./qdrant";
import {
  buildSparseTermEntries,
  sparseStorageMode,
  sparseTermWriteStatements,
} from "./sparse-index";

const MAX_PROVISIONS_PER_VERSION = 8_000;
const MAX_CHUNKS_PER_VERSION = 16_000;
// Consolidated official codes can exceed the conservative 2 MiB live-lookup
// limit (the largest verified staging code page was 7.24 MiB). Scheduled
// ingestion processes one robots-checked source at a time, so permit a still
// bounded 12 MiB document while retaining the stricter interactive default.
const MAX_LEX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_LEX_REPRESENTATION_BYTES = 20 * 1024 * 1024;
const INITIAL_INGESTION_MAX_ATTEMPTS = 5;
const WRITE_BATCH_SIZE = 90;
const RETRYABLE_INTERNAL_ERROR_CODES = new Set([
  "LEGAL_CORPUS_LANGUAGE_FAMILY_CONFLICT",
  "LEGAL_CORPUS_VERSION_MATERIALIZATION_INCOMPLETE",
]);
const RECOVERABLE_DEAD_LETTER_CODES = [
  "LEGAL_CORPUS_INGESTION_FAILED",
  // Older Workers did not preserve the upstream HTTP status and therefore
  // dead-lettered permanent Lex 4xx responses on the first attempt. Re-read
  // those bounded jobs once so the current fetcher can classify an explicit
  // missing/restricted source as technically unavailable with evidence.
  "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE",
  // Earlier Workers accepted only the root `/files/<id>.zip` representation
  // link. Lex also emits equivalent locale-prefixed links such as
  // `/uz/files/<id>.zip`; re-read those bounded jobs after parser support is
  // deployed instead of leaving accessible official PDFs in dead-letter.
  "LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2",
  // Previous scheduled workers used the 2 MiB live-lookup cap for every
  // corpus page. Reclaim an affected official document once after the
  // bounded ingestion-specific cap is deployed; do not turn this into an
  // unbounded retry loop for genuinely oversized sources.
  "LEGAL_SOURCE_TOO_LARGE",
  // A corrupt official ZIP is a concrete unavailable source condition. This
  // entry recovers only legacy rows that were dead-lettered before the
  // classifier recorded that condition as resolved coverage.
  "LEGAL_CORPUS_ATTACHMENT_INVALID",
  ...RETRYABLE_INTERNAL_ERROR_CODES,
] as const;
const LEGACY_CONTENT_INSUFFICIENT_V2 = "LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2";
// A processor upgrade can make an otherwise reachable official source
// processable (for example, by falling back to Lex's official PDF/ZIP
// representation). Re-read an exhausted row once, and only from the initial
// retry budget: a second exhaustion remains terminal or explicitly unavailable.
const ONE_TIME_BOUNDED_RECOVERY_CODES = [
  "LEGAL_SOURCE_PARSE_TOO_COMPLEX",
  "LEGAL_SOURCE_TOO_LARGE",
] as const;
// The first signed Lex PDF implementation classified a reachable
// `/pdffile/-<id>` page as unavailable because it stripped the sign before
// constructing the representation URL. Re-read only that exact legacy shape
// once after the signed-ID parser is deployed; a second unavailable result is
// retained as a truthful source condition.
const SIGNED_LEX_UNAVAILABLE_RECOVERY_CODE = "LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE";
const LANGUAGE_TEXT_UNAVAILABLE_RECOVERY_CODE = "LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE";
const ALTERNATE_LANGUAGE_REDIRECT_CODE = "LEGAL_CORPUS_ALTERNATE_LANGUAGE_REDIRECT";
const STALE_RUNNING_ERROR_CODE = "LEGAL_CORPUS_STALE_RUNNING_TIMEOUT";
const COMPLETED_PARTIAL_WRITE_RISK_CODES = [
  STALE_RUNNING_ERROR_CODE,
  "LEGAL_CORPUS_INGESTION_FAILED",
] as const;
// A normal scheduled invocation is fenced by a seven-minute distributed lock
// and its Lex requests have shorter individual timeouts. Keep a wider window
// so a slow but live invocation is never reclaimed by the next cron tick.
const STALE_RUNNING_AFTER_MS = 15 * 60_000;
const CATALOG_CATEGORY_KEYS = new Set<string>(LEX_CORPUS_CATEGORIES.map((category) => category.key));
const CATALOG_LANGUAGE_KEYS = new Set<LegalCorpusLanguage>(["uz-Cyrl", "uz-Latn", "ru", "en"]);

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type LegalCorpusIngestionEnv = Pick<Env, "APP_ENV" | "BUCKET" | "DB">
  & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

export type LegalCorpusQueueEnv = Pick<Env, "DB"> & { APP_ENV?: Env["APP_ENV"] }
  & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

type ExistingVariant = {
  variantId: string;
  documentId: string;
  currentVersionId: string | null;
  currentHash: string | null;
  currentVersionNumber: number | null;
  currentValidFrom: string | null;
};

type StoredProvision = {
  articleNumber: string | null;
  title: string | null;
  text: string;
  sequence: number;
};

type IngestionJob = {
  id: string;
  jobType: "fetch" | "version";
  sourceUrl: string;
  language: LegalCorpusLanguage;
  canonicalDocumentId: string;
  attemptCount: number;
  maxAttempts: number;
};

type StoredVersion = {
  versionId: string;
  versionNumber: number;
  validFrom: string | null;
};

type StoredVersionMaterialization = {
  provisionCount: number;
  chunkCount: number;
  sparseChunkCount: number;
};

type CorpusRepresentation = {
  kind: "lex-pdf" | "lex-zip-pdf";
  sourceUrl: string;
  contentType: string;
  containerBytes: Uint8Array;
  containerSha256: string;
  pdfBytes: Uint8Array;
  pdfSha256: string;
};

export type LegalCorpusIngestionResult = {
  status: "indexed" | "unchanged" | "halted_suspicious_change";
  documentId: string;
  variantId: string;
  versionId: string | null;
  provisionCount: number;
  chunkCount: number;
  sourceUrl: string;
};

export type LegalCorpusJobRunResult = {
  claimed: boolean;
  status: "disabled" | "empty" | "completed" | "retrying" | "failed" | "halted_suspicious_change";
  jobId: string | null;
  safeErrorCode: string | null;
};

function preferredCatalogCategories(input: readonly string[] | undefined): string[] {
  if (!input) return [];
  return [...new Set(input)].filter((category) => CATALOG_CATEGORY_KEYS.has(category));
}

function preferredCatalogLanguages(input: readonly string[] | undefined): LegalCorpusLanguage[] {
  if (!input) return [];
  return [...new Set(input)].filter(
    (language): language is LegalCorpusLanguage => CATALOG_LANGUAGE_KEYS.has(language as LegalCorpusLanguage),
  );
}

function preferredCanonicalDocumentIds(input: readonly string[] | undefined): string[] {
  if (!input) return [];
  return [...new Set(input)].filter((value) => /^lexuz:\d+$/u.test(value)).slice(0, 32);
}

async function findPreferredCanonicalDocumentJob(
  db: D1Database,
  now: string,
  documentIds: readonly string[],
): Promise<IngestionJob | null> {
  if (documentIds.length === 0) return null;
  const priority = `CASE canonical_document_id ${documentIds.map((_, index) => `WHEN ? THEN ${index}`).join(" ")} ELSE ${documentIds.length} END`;
  return db.prepare(`SELECT id,job_type AS jobType,source_url AS sourceUrl,language,
      canonical_document_id AS canonicalDocumentId,attempt_count AS attemptCount,max_attempts AS maxAttempts
    FROM legal_corpus_ingestion_jobs
    WHERE status='queued' AND handoff_id IS NULL AND job_type='fetch'
      AND canonical_document_id IN (${documentIds.map(() => "?").join(",")})
      AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY ${priority},coalesce(next_attempt_at,created_at) ASC,created_at ASC,id ASC LIMIT 1
  `).bind(...documentIds, now, ...documentIds).first<IngestionJob>();
}

async function findPreferredCatalogJob(
  db: D1Database,
  now: string,
  categories: readonly string[],
  languages: readonly LegalCorpusLanguage[],
): Promise<IngestionJob | null> {
  const languageClause = languages.length > 0
    ? `AND j.language IN (${languages.map(() => "?").join(",")})`
    : "";
  const categoryPriority = `CASE cp.category_key ${categories.map((_, index) => `WHEN ? THEN ${index}`).join(" ")} ELSE ${categories.length} END`;
  return db.prepare(`SELECT j.id,j.job_type AS jobType,j.source_url AS sourceUrl,j.language,
      j.canonical_document_id AS canonicalDocumentId,j.attempt_count AS attemptCount,j.max_attempts AS maxAttempts
    FROM legal_corpus_discovery_checkpoints cp
    CROSS JOIN legal_corpus_discovery_documents dd
    CROSS JOIN legal_corpus_ingestion_jobs AS j INDEXED BY legal_corpus_ingestion_document_language_ready_idx
    LEFT JOIN legal_corpus_source_aliases known_source ON known_source.source_url=j.source_url
    WHERE dd.checkpoint_id=cp.id
      AND j.canonical_document_id=dd.provider_source_id AND j.language=dd.language
      AND cp.category_key IN (${categories.map(() => "?").join(",")})
      AND j.job_type='fetch' AND j.status='queued' AND j.handoff_id IS NULL
      ${languageClause}
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=?)
    -- The approved legal-source sequence is the primary ordering. A fetched
    -- official page links all advertised language URLs into one canonical
    -- family, so source novelty is only a tie-breaker within the same source
    -- category. It must not allow a lower-priority catalogue to overtake
    -- queued legislation merely because the latter already has a linked alias.
    ORDER BY ${categoryPriority},
      CASE WHEN known_source.document_id IS NULL THEN 0 ELSE 1 END,
      j.created_at ASC,j.id ASC LIMIT 1
  `).bind(...categories, ...languages, now, ...categories).first<IngestionJob>();
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function languageToLegacyLocale(language: LegalCorpusLanguage): "ru" | "uz" | "uzc" | "en" {
  if (language === "uz-Cyrl") return "uzc";
  if (language === "uz-Latn") return "uz";
  return language;
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  // Copy into an ArrayBuffer-backed view: TypeScript distinguishes a possible
  // SharedArrayBuffer view from the BufferSource accepted by Web Crypto.
  const stableBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", stableBytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function objectStem(documentId: string, language: LegalCorpusLanguage, hash: string): string {
  return `legal-corpus/lex-uz/${documentId.replaceAll(":", "/")}/${language}/${hash}`;
}

async function normalizeOfficialLexSource(input: {
  rawHtml: string;
  sourceUrl: string;
  sourceHash: string;
  canonicalId: string;
  locale: "ru" | "uz" | "uzc" | "en";
  now: Date;
  wait?: (delayMs: number) => Promise<void>;
  fetchImpl?: FetchLike;
  heartbeat?: () => Promise<void>;
}): Promise<{
  normalized: NormalizedLegalSourceSnapshot;
  representation: CorpusRepresentation | null;
}> {
  const reference = classifyLegalSourceUrl(input.sourceUrl);
  try {
    return {
      normalized: normalizeLegalSourceHtml({
        html: input.rawHtml,
        reference: {
          sourceKind: "lex",
          locale: input.locale,
          canonicalId: input.canonicalId,
          canonicalUrl: input.sourceUrl,
        },
        rawContentSha256: input.sourceHash,
      }),
      representation: null,
    };
  } catch (error) {
    if (!(error instanceof LegalSourceParserError)
      || (error.code !== "LEGAL_SOURCE_CONTENT_INSUFFICIENT"
        && error.code !== "LEGAL_SOURCE_PARSE_TOO_COMPLEX")) throw error;
  }

  let representation: CorpusRepresentation;
  // Lex uses signed document IDs in the localized `/pdffile/<id>` embed path
  // (for example `/pdffile/-8420999`). Preserve the sign from the canonical
  // source URL; stripping it makes a reachable official PDF look unavailable.
  const representationId = reference.canonicalId;
  const embeddedPdfPath = `/pdffile/${representationId}`;
  if (input.rawHtml.includes(embeddedPdfPath)) {
    const fetched = await fetchLexPdfRepresentation(input.sourceUrl, {
      fetchImpl: input.fetchImpl,
      now: () => input.now,
      wait: input.wait,
      heartbeat: input.heartbeat,
      maxBytes: MAX_LEX_REPRESENTATION_BYTES,
    });
    representation = {
      kind: "lex-pdf",
      sourceUrl: fetched.representationUrl,
      contentType: fetched.contentType,
      containerBytes: fetched.bytes,
      containerSha256: fetched.contentSha256,
      pdfBytes: fetched.bytes,
      pdfSha256: fetched.contentSha256,
    };
  } else {
    const archive = discoverLexArchiveRepresentation(input.rawHtml, input.sourceUrl);
    // The HTML parser already proved the primary page does not contain a
    // usable legal text. When Lex exposes neither its embedded PDF nor a
    // supported ZIP/PDF representation, retrying cannot create official
    // source material. Record that explicit source condition instead of
    // exhausting the job retry budget and leaving an avoidable dead letter.
    if (!archive) throw new TypeError("LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE");
    const fetched = await fetchLexArchiveRepresentation(
      input.sourceUrl,
      archive.sourceUrl,
      {
        fetchImpl: input.fetchImpl,
        now: () => input.now,
        wait: input.wait,
        heartbeat: input.heartbeat,
        maxBytes: MAX_LEX_REPRESENTATION_BYTES,
      },
    );
    let members: Awaited<ReturnType<typeof readAnalysisPackageMembers>>;
    try {
      members = await readAnalysisPackageMembers({
        bytes: fetched.bytes,
        mimeType: "application/zip",
      });
    } catch {
      throw new TypeError("LEGAL_CORPUS_ATTACHMENT_INVALID");
    }
    if (members.length !== 1 || members[0]?.mimeType !== "application/pdf") {
      throw new TypeError("LEGAL_CORPUS_ATTACHMENT_LAYOUT_UNSUPPORTED");
    }
    const pdfBytes = members[0].bytes;
    representation = {
      kind: "lex-zip-pdf",
      sourceUrl: fetched.representationUrl,
      contentType: fetched.contentType,
      containerBytes: fetched.bytes,
      containerSha256: fetched.contentSha256,
      pdfBytes,
      pdfSha256: await sha256(pdfBytes),
    };
  }

  try {
    return {
      normalized: await normalizeLexPdfRepresentation({
        bytes: representation.pdfBytes,
        reference,
        rawContentSha256: input.sourceHash,
      }),
      representation,
    };
  } catch (error) {
    if (error instanceof LegalSourceNormalizationError
      && error.code === "LEGAL_SOURCE_PDF_EXTRACTION_FAILED") {
      throw new TypeError("LEGAL_CORPUS_ATTACHMENT_TEXT_UNAVAILABLE");
    }
    throw error;
  }
}

function internalErrorCode(error: unknown): string | null {
  if (!(error instanceof TypeError)) return null;
  const message = error.message.trim();
  return /^LEGAL_CORPUS_[A-Z0-9_]{1,100}$/u.test(message) ? message : null;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof LegalSourceFetchError || error instanceof LegalSourceParserError) {
    return error.code;
  }
  if (error instanceof QdrantCorpusError || error instanceof LegalCorpusEmbeddingError) {
    return error.code;
  }
  const internal = internalErrorCode(error);
  if (internal) return internal;
  return "LEGAL_CORPUS_INGESTION_FAILED";
}

function retryable(error: unknown): boolean {
  if (error instanceof LegalSourceFetchError
    || error instanceof QdrantCorpusError
    || error instanceof LegalCorpusEmbeddingError) return error.retryable;
  const internal = internalErrorCode(error);
  if (internal) return RETRYABLE_INTERNAL_ERROR_CODES.has(internal);
  // Unknown non-TypeError failures are treated as transient infrastructure
  // errors, but remain bounded by the job's max-attempts budget. Parser and
  // invariant TypeErrors stay fail-closed unless explicitly allowlisted.
  return !(error instanceof TypeError);
}

function technicallyUnavailable(error: unknown): boolean {
  return (error instanceof LegalSourceParserError
    && error.code === "LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE")
    // The scheduled processor has a deliberate, bounded source-size ceiling.
    // After its one deployment redrive, retaining a concrete unavailable state
    // is safer and more truthful than retrying an oversized official page forever.
    || (error instanceof LegalSourceFetchError
      && error.code === "LEGAL_SOURCE_TOO_LARGE")
    || (error instanceof LegalSourceFetchError
      && error.code === "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE"
      && !error.retryable
      && error.httpStatus !== null
      && error.httpStatus >= 400
      && error.httpStatus < 500)
    // A bounded article-first parser can prove that an official page exceeds
    // the per-version safety ceiling without treating the source as a worker
    // failure. Retain that explicit limitation as technical unavailability so
    // the job is completed with evidence rather than dead-lettered.
    || internalErrorCode(error) === "LEGAL_CORPUS_PROVISION_LIMIT_REJECTED"
    // A Lex page can link an attachment whose archive itself is corrupted.
    // The primary HTML has already established this as the document's sole
    // official representation, so retrying the same immutable invalid bytes
    // cannot recover a legal text. Keep this concrete source condition in
    // coverage instead of turning it into an actionable crawler dead letter.
    || internalErrorCode(error) === "LEGAL_CORPUS_ATTACHMENT_INVALID"
    || internalErrorCode(error) === "LEGAL_CORPUS_ATTACHMENT_TEXT_UNAVAILABLE"
    || internalErrorCode(error) === "LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE";
}

function fetchHttpStatus(error: unknown): number | null {
  return error instanceof LegalSourceFetchError ? error.httpStatus : null;
}

function retryAt(now: Date, attempt: number): string {
  const delayMs = Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + delayMs).toISOString();
}

async function runBatches(
  db: D1Database,
  statements: D1PreparedStatement[],
  heartbeat?: () => Promise<void>,
): Promise<void> {
  let batchNumber = 0;
  for (let offset = 0; offset < statements.length; offset += WRITE_BATCH_SIZE) {
    // A large historical Lex version can require many bounded D1 batches.
    // Renew the scheduler lease between batches so durable work cannot be
    // mistaken for a stale Worker after the fifteen-minute fence expires.
    if (heartbeat && batchNumber % 8 === 0) await heartbeat();
    await db.batch(statements.slice(offset, offset + WRITE_BATCH_SIZE));
    batchNumber += 1;
  }
}

type CorpusTitleRow = {
  id: string;
  title: string | null;
};

async function nextCorpusTitleRepairRows(
  db: D1Database,
  limit: number,
): Promise<{ documents: CorpusTitleRow[]; variants: CorpusTitleRow[] }> {
  // D1 rejected the former one-query disjunction over every multi-language
  // marker. Probe one literal marker at a time, sequentially, and stop at the
  // first bounded repair batch. This stays inexpensive, avoids wildcard/regex
  // semantics, and cannot let a D1 query-planner limit stop corpus ingestion.
  for (const marker of LEGAL_SOURCE_UI_NOISE_MARKERS) {
    const documentRows = await db.prepare(`SELECT id,title FROM legal_corpus_documents
      WHERE instr(title, ?) > 0 ORDER BY updated_at ASC LIMIT ?`)
      .bind(marker, limit)
      .all<CorpusTitleRow>();
    const variantRows = await db.prepare(`SELECT id,title FROM legal_corpus_variants
      WHERE title IS NOT NULL AND instr(title, ?) > 0 ORDER BY updated_at ASC LIMIT ?`)
      .bind(marker, limit)
      .all<CorpusTitleRow>();
    if (documentRows.results.length > 0 || variantRows.results.length > 0) {
      return { documents: documentRows.results, variants: variantRows.results };
    }
  }
  return { documents: [], variants: [] };
}

/**
 * Repairs only known Lex reader controls accidentally persisted in a title by
 * older parser builds. This is deliberately text-only, bounded, and never
 * changes legal body text, source URLs, version hashes, or retrieval scope.
 */
export async function reconcileLegalCorpusTitleUiNoise(
  db: D1Database,
  input: { now?: Date; limit?: number } = {},
): Promise<{ documents: number; variants: number }> {
  const now = (input.now ?? new Date()).toISOString();
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 24)));
  const { documents: documentRows, variants: variantRows } = await nextCorpusTitleRepairRows(db, limit);
  const documentStatements: D1PreparedStatement[] = [];
  const variantStatements: D1PreparedStatement[] = [];
  for (const row of documentRows) {
    const title = removeLegalSourceUiNoise(row.title ?? "");
    if (!title || title === row.title) continue;
    documentStatements.push(db.prepare(`UPDATE legal_corpus_documents
      SET title=?,short_title=?,updated_at=? WHERE id=? AND title=?`)
      .bind(title, title.slice(0, 240), now, row.id, row.title));
  }
  for (const row of variantRows) {
    const title = removeLegalSourceUiNoise(row.title ?? "");
    if (!title || title === row.title) continue;
    variantStatements.push(db.prepare(`UPDATE legal_corpus_variants
      SET title=?,short_title=?,updated_at=? WHERE id=? AND title=?`)
      .bind(title, title.slice(0, 240), now, row.id, row.title));
  }
  await runBatches(db, documentStatements);
  await runBatches(db, variantStatements);
  return { documents: documentStatements.length, variants: variantStatements.length };
}

async function existingVariant(
  db: D1Database,
  documentId: string,
  language: LegalCorpusLanguage,
): Promise<ExistingVariant | null> {
  return db.prepare(`
    SELECT variant.id AS variantId,variant.document_id AS documentId,
      variant.current_version_id AS currentVersionId,
      current_version.content_sha256 AS currentHash,
      current_version.version_number AS currentVersionNumber,
      current_version.valid_from AS currentValidFrom
    FROM legal_corpus_variants AS variant
    LEFT JOIN legal_corpus_versions AS current_version
      ON current_version.id=variant.current_version_id
    WHERE variant.document_id=? AND variant.language=?
      AND variant.is_official_language_version=1
    LIMIT 1
  `).bind(documentId, language).first<ExistingVariant>();
}

async function linkedDocumentId(
  db: D1Database,
  variants: readonly LexDiscoveredDocument[],
): Promise<string | null> {
  const linked = new Set<string>();
  for (const variant of variants) {
    const row = await db.prepare(`SELECT document_id AS documentId
      FROM legal_corpus_source_aliases WHERE source_url=? LIMIT 1
    `).bind(variant.sourceUrl).first<{ documentId: string }>();
    if (row?.documentId) linked.add(row.documentId);
  }
  if (linked.size > 1) throw new TypeError("LEGAL_CORPUS_LANGUAGE_FAMILY_CONFLICT");
  return [...linked][0] ?? null;
}

async function persistLanguageAliasesAndQueue(input: {
  env: LegalCorpusIngestionEnv;
  documentId: string;
  variants: readonly LexDiscoveredDocument[];
  currentSourceUrl: string;
  now: Date;
  heartbeat?: () => Promise<void>;
}): Promise<void> {
  const timestamp = input.now.toISOString();
  await input.env.DB.batch(input.variants.map((variant) => input.env.DB.prepare(`INSERT INTO legal_corpus_source_aliases
    (source_url,document_id,provider_source_id,language,created_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(source_url) DO UPDATE SET document_id=excluded.document_id
  `).bind(
    variant.sourceUrl, input.documentId, variant.canonicalDocumentId,
    variant.language, timestamp,
  )));
  await input.heartbeat?.();
  if (!featureEnabled(input.env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) return;
  for (const [index, variant] of input.variants.entries()) {
    if (index > 0 && index % 4 === 0) await input.heartbeat?.();
    if (variant.sourceUrl === input.currentSourceUrl) continue;
    await enqueueOfficialLexCorpusDocument(input.env, {
      sourceUrl: variant.sourceUrl,
      now: input.now,
      correlationId: `language-family:${input.documentId}`,
    });
  }
}

async function currentProvisions(
  db: D1Database,
  versionId: string | null,
): Promise<CorpusProvisionSnapshot[]> {
  if (!versionId) return [];
  const result = await db.prepare(`
    SELECT article_number AS articleNumber,article_title AS title,text,sequence
    FROM legal_corpus_provisions WHERE version_id=? ORDER BY sequence ASC
  `).bind(versionId).all<StoredProvision>();
  return result.results;
}

async function storedVersionByHash(
  db: D1Database,
  variantId: string,
  hash: string,
): Promise<StoredVersion | null> {
  return db.prepare(`SELECT id AS versionId,version_number AS versionNumber,valid_from AS validFrom
    FROM legal_corpus_versions WHERE variant_id=? AND content_sha256=? LIMIT 1
  `).bind(variantId, hash).first<StoredVersion>();
}

async function storedVersionMaterialization(
  db: D1Database,
  versionId: string,
  mode: Awaited<ReturnType<typeof sparseStorageMode>>,
): Promise<StoredVersionMaterialization> {
  const compressedSparseClause = mode === "compressed" ? `
      OR EXISTS (
        SELECT 1
        FROM legal_corpus_sparse_chunk_keys AS chunk_key
        INNER JOIN legal_corpus_sparse_postings AS posting
          ON posting.chunk_key_id=chunk_key.id
        WHERE chunk_key.chunk_id=version_chunk.id
      )` : "";
  const row = await db.prepare(`WITH version_provision AS (
      SELECT id FROM legal_corpus_provisions WHERE version_id=?
    ), version_chunk AS (
      SELECT chunk.id
      FROM legal_corpus_chunks AS chunk
      INNER JOIN version_provision AS provision ON provision.id=chunk.provision_id
      WHERE chunk.version_id=?
    )
    SELECT
      (SELECT count(*) FROM version_provision) AS provisionCount,
      (SELECT count(*) FROM version_chunk) AS chunkCount,
      (SELECT count(*) FROM version_chunk
        WHERE EXISTS (
          SELECT 1 FROM legal_corpus_sparse_terms AS sparse
          WHERE sparse.chunk_id=version_chunk.id
        )${compressedSparseClause}
      ) AS sparseChunkCount
  `).bind(versionId, versionId).first<StoredVersionMaterialization>();
  return {
    provisionCount: Number(row?.provisionCount ?? 0),
    chunkCount: Number(row?.chunkCount ?? 0),
    sparseChunkCount: Number(row?.sparseChunkCount ?? 0),
  };
}

function versionMaterializationComplete(
  stored: StoredVersionMaterialization,
  expectedProvisions: number,
  expectedChunks: number,
): boolean {
  return stored.provisionCount === expectedProvisions
    && stored.chunkCount === expectedChunks
    && stored.sparseChunkCount === expectedChunks;
}

async function nextVersionNumber(db: D1Database, variantId: string): Promise<number> {
  const row = await db.prepare(`SELECT coalesce(max(version_number),0)+1 AS nextNumber
    FROM legal_corpus_versions WHERE variant_id=?
  `).bind(variantId).first<{ nextNumber: number }>();
  return Math.max(1, Number(row?.nextNumber ?? 1));
}

async function nextLaterValidityDate(
  db: D1Database,
  variantId: string,
  validFrom: string,
): Promise<string | null> {
  const row = await db.prepare(`SELECT valid_from AS validFrom
    FROM legal_corpus_versions
    WHERE variant_id=? AND valid_from>? ORDER BY valid_from ASC LIMIT 1
  `).bind(variantId, validFrom).first<{ validFrom: string }>();
  return row?.validFrom ?? null;
}

async function enqueueRevisionHistory(input: {
  env: LegalCorpusIngestionEnv;
  revisions: readonly LexDiscoveredRevision[];
  now: Date;
  documentId: string;
  heartbeat?: () => Promise<void>;
}): Promise<void> {
  if (!featureEnabled(input.env, "LEGAL_CORPUS_HISTORICAL_ENABLED")
    || !featureEnabled(input.env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) return;
  for (const [index, revision] of input.revisions.entries()) {
    if (index % 4 === 0) await input.heartbeat?.();
    await enqueueOfficialLexCorpusRevision(input.env, {
      sourceUrl: revision.sourceUrl,
      now: new Date(input.now.getTime() + index),
      correlationId: `revision-history:${input.documentId}`,
    });
  }
  await input.heartbeat?.();
}

async function recordFailure(input: {
  db: D1Database;
  jobId?: string | null;
  documentId?: string | null;
  sourceUrl?: string | null;
  language?: LegalCorpusLanguage | null;
  now: string;
  httpStatus?: number | null;
  errorCode: string;
  retryable: boolean;
  retryCount: number;
  retryState: "pending" | "retrying" | "terminal" | "technically_unavailable";
}): Promise<void> {
  await input.db.prepare(`
    INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,safe_message,retryable,retry_count,retry_state)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    crypto.randomUUID(), input.jobId ?? null, input.documentId ?? null,
    input.sourceUrl ?? null, input.language ?? null, input.now,
    input.httpStatus ?? null,
    input.errorCode.slice(0, 120), input.errorCode.slice(0, 400),
    input.retryable ? 1 : 0, input.retryCount, input.retryState,
  ).run();
}

async function reconcileStaleRunningJob(
  db: D1Database,
  nowDate: Date,
): Promise<void> {
  const now = nowDate.toISOString();
  const staleBefore = new Date(nowDate.getTime() - STALE_RUNNING_AFTER_MS).toISOString();
  const stranded = await db.prepare(`SELECT id,attempt_count AS attemptCount,
      max_attempts AS maxAttempts,updated_at AS updatedAt
    FROM legal_corpus_ingestion_jobs
    WHERE status='running' AND handoff_id IS NULL AND updated_at<=?
    ORDER BY updated_at ASC,id ASC LIMIT 1
  `).bind(staleBefore).first<{
    id: string;
    attemptCount: number;
    maxAttempts: number;
    updatedAt: string;
  }>();
  if (!stranded) return;
  const exhausted = stranded.attemptCount >= stranded.maxAttempts;
  const updated = await db.prepare(`UPDATE legal_corpus_ingestion_jobs
    SET status=?,next_attempt_at=?,last_error_code=?,updated_at=?
    WHERE id=? AND status='running' AND handoff_id IS NULL AND updated_at=?
  `).bind(
    exhausted ? "dead_letter" : "retrying",
    exhausted ? null : now,
    STALE_RUNNING_ERROR_CODE,
    now,
    stranded.id,
    stranded.updatedAt,
  ).run();
  if (Number(updated.meta.changes ?? 0) !== 1) return;
  await recordFailure({
    db,
    jobId: stranded.id,
    now,
    errorCode: STALE_RUNNING_ERROR_CODE,
    retryable: !exhausted,
    retryCount: stranded.attemptCount,
    retryState: exhausted ? "terminal" : "retrying",
  });
}

async function reconcileCompletedPartialWriteRiskJob(
  db: D1Database,
  now: string,
): Promise<void> {
  // A Worker can be interrupted after inserting the immutable version header
  // but before all article/chunk batches are durable. Older processors then
  // treated the header hash as a completed version. A stale-running timeout
  // proves an interrupted processor, while the generic retryable ingestion
  // code can represent an interruption after the header batch but before the
  // article batches. Re-read each affected completion exactly once per
  // recorded failed attempt so the materialization invariant below can verify
  // or repair it without creating a permanent retry loop. Source-fetch
  // timeouts and explicit source conditions occur before the header write and
  // are deliberately excluded from this extra fetch.
  const placeholders = COMPLETED_PARTIAL_WRITE_RISK_CODES.map(() => "?").join(",");
  const candidate = await db.prepare(`SELECT job.id,
      job.attempt_count AS attemptCount,max(failure.retry_count) AS failedAttempt
    FROM legal_corpus_ingestion_jobs AS job
    INNER JOIN legal_corpus_failures AS failure ON failure.job_id=job.id
    WHERE job.status='completed' AND job.handoff_id IS NULL
      AND failure.retryable=1
      AND failure.error_code IN (${placeholders})
    GROUP BY job.id,job.attempt_count
    HAVING job.attempt_count=max(failure.retry_count)+1
    ORDER BY min(failure.attempted_at) ASC,job.id ASC
    LIMIT 1
  `).bind(...COMPLETED_PARTIAL_WRITE_RISK_CODES).first<{
    id: string;
    attemptCount: number;
    failedAttempt: number;
  }>();
  if (!candidate) return;
  await db.prepare(`UPDATE legal_corpus_ingestion_jobs
    SET status='retrying',
      max_attempts=CASE WHEN attempt_count>=max_attempts THEN attempt_count+1 ELSE max_attempts END,
      next_attempt_at=?,last_error_code=?,updated_at=?
    WHERE id=? AND status='completed' AND handoff_id IS NULL
      AND attempt_count=?
      AND EXISTS (
        SELECT 1 FROM legal_corpus_failures
        WHERE job_id=? AND retryable=1
          AND error_code IN (${placeholders}) AND retry_count=?
      )
  `).bind(
    now,
    "LEGAL_CORPUS_COMPLETION_REVALIDATION",
    now,
    candidate.id,
    candidate.attemptCount,
    candidate.id,
    ...COMPLETED_PARTIAL_WRITE_RISK_CODES,
    candidate.failedAttempt,
  ).run();
}

async function reconcileRecoverableDeadLetter(
  db: D1Database,
  now: string,
): Promise<void> {
  const placeholders = RECOVERABLE_DEAD_LETTER_CODES.map(() => "?").join(",");
  const boundedRecoveryPlaceholders = ONE_TIME_BOUNDED_RECOVERY_CODES.map(() => "?").join(",");
  const stranded = await db.prepare(`SELECT id,attempt_count AS attemptCount,
      max_attempts AS maxAttempts,last_error_code AS lastErrorCode
    FROM legal_corpus_ingestion_jobs
    WHERE status='dead_letter' AND handoff_id IS NULL AND (
      (attempt_count<max_attempts AND last_error_code IN (${placeholders}))
      OR last_error_code='LEGAL_SOURCE_CONTENT_INSUFFICIENT'
      -- This was emitted before the parser distinguished a page with no
      -- usable official text from a locale-prefixed archive. Re-read an
      -- exhausted legacy row exactly once under the corrected classifier.
      OR (last_error_code=? AND attempt_count>=max_attempts)
      -- Re-read parser/size dead letters exactly once after a bounded parser
      -- upgrade. Do not revive rows already given that additional attempt.
      OR (last_error_code IN (${boundedRecoveryPlaceholders})
        AND attempt_count>=max_attempts AND max_attempts=?)
    )
    ORDER BY updated_at ASC,id ASC LIMIT 1
  `).bind(
    ...RECOVERABLE_DEAD_LETTER_CODES,
    LEGACY_CONTENT_INSUFFICIENT_V2,
    ...ONE_TIME_BOUNDED_RECOVERY_CODES,
    INITIAL_INGESTION_MAX_ATTEMPTS,
  ).first<{
    id: string;
    attemptCount: number;
    maxAttempts: number;
    lastErrorCode: string;
  }>();
  if (!stranded) return;
  const updated = await db.prepare(`UPDATE legal_corpus_ingestion_jobs
    SET status='retrying',
      max_attempts=CASE WHEN attempt_count>=max_attempts THEN attempt_count+1 ELSE max_attempts END,
      next_attempt_at=?,updated_at=?
    WHERE id=? AND status='dead_letter' AND handoff_id IS NULL AND (
      attempt_count<max_attempts OR last_error_code='LEGAL_SOURCE_CONTENT_INSUFFICIENT'
      OR last_error_code=?
      OR (last_error_code IN (${boundedRecoveryPlaceholders})
        AND attempt_count>=max_attempts AND max_attempts=?)
    )
  `).bind(
    now,
    now,
    stranded.id,
    LEGACY_CONTENT_INSUFFICIENT_V2,
    ...ONE_TIME_BOUNDED_RECOVERY_CODES,
    INITIAL_INGESTION_MAX_ATTEMPTS,
  ).run();
  if (Number(updated.meta.changes ?? 0) !== 1) return;
  await db.prepare(`UPDATE legal_corpus_failures
    SET retryable=1,retry_state='retrying'
    WHERE job_id=? AND retry_state='terminal'
      AND (error_code IN (${placeholders})
        OR error_code='LEGAL_SOURCE_CONTENT_INSUFFICIENT'
        OR error_code IN (${boundedRecoveryPlaceholders}))
  `).bind(
    stranded.id,
    ...RECOVERABLE_DEAD_LETTER_CODES,
    ...ONE_TIME_BOUNDED_RECOVERY_CODES,
  ).run();
}

async function reconcileRecoverableSignedLexUnavailable(
  db: D1Database,
  now: string,
): Promise<void> {
  const stranded = await db.prepare(`SELECT id
      FROM legal_corpus_ingestion_jobs
      WHERE status='completed' AND handoff_id IS NULL AND attempt_count=1
        AND last_error_code=?
        AND (source_url LIKE 'https://lex.uz/docs/-%'
          OR source_url LIKE 'https://lex.uz/%/docs/-%')
      ORDER BY updated_at ASC,id ASC LIMIT 1
    `).bind(SIGNED_LEX_UNAVAILABLE_RECOVERY_CODE).first<{ id: string }>();
  if (!stranded) return;
  const updated = await db.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='retrying',next_attempt_at=?,updated_at=?
      WHERE id=? AND status='completed' AND handoff_id IS NULL AND attempt_count=1
        AND last_error_code=?
    `).bind(now, now, stranded.id, SIGNED_LEX_UNAVAILABLE_RECOVERY_CODE).run();
  if (Number(updated.meta.changes ?? 0) !== 1) return;
  // Keep the original failure row as evidence. The dashboard projects a
  // completed job's retrying row as resolved after a successful redrive; if
  // the second attempt is unavailable, the catch path restores the concrete
  // technically_unavailable state and the release gate remains blocked.
  await db.prepare(`UPDATE legal_corpus_failures
      SET retryable=1,retry_state='retrying'
      WHERE job_id=? AND error_code=? AND retry_state='technically_unavailable'
    `).bind(stranded.id, SIGNED_LEX_UNAVAILABLE_RECOVERY_CODE).run();
}

async function reconcileRecoverableLanguageTextUnavailable(
  db: D1Database,
  now: string,
): Promise<void> {
  const stranded = await db.prepare(`SELECT id
      FROM legal_corpus_ingestion_jobs
      WHERE status='completed' AND handoff_id IS NULL AND attempt_count=1
        AND last_error_code=?
      ORDER BY updated_at ASC,id ASC LIMIT 1
    `).bind(LANGUAGE_TEXT_UNAVAILABLE_RECOVERY_CODE).first<{ id: string }>();
  if (!stranded) return;
  const updated = await db.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='retrying',next_attempt_at=?,updated_at=?
      WHERE id=? AND status='completed' AND handoff_id IS NULL AND attempt_count=1
        AND last_error_code=?
    `).bind(now, now, stranded.id, LANGUAGE_TEXT_UNAVAILABLE_RECOVERY_CODE).run();
  if (Number(updated.meta.changes ?? 0) !== 1) return;
  await db.prepare(`UPDATE legal_corpus_failures
      SET retryable=1,retry_state='retrying'
      WHERE job_id=? AND error_code=? AND retry_state='technically_unavailable'
    `).bind(stranded.id, LANGUAGE_TEXT_UNAVAILABLE_RECOVERY_CODE).run();
}

function alternateLanguageSource(error: unknown): LexDiscoveredDocument | null {
  if (!(error instanceof LegalSourceParserError)
    || error.code !== LANGUAGE_TEXT_UNAVAILABLE_RECOVERY_CODE
    || !error.alternateLanguageSource) return null;
  const parsed = parseLexDocumentUrl(error.alternateLanguageSource.href);
  if (!parsed) return null;
  const id = parsed.canonicalDocumentId.replace(/^lexuz:/u, "");
  const localePath = error.alternateLanguageSource.language === "uz-Cyrl"
    ? ""
    : error.alternateLanguageSource.language === "uz-Latn"
      ? "/uz"
      : `/${error.alternateLanguageSource.language}`;
  return parseLexDocumentUrl(`https://lex.uz${localePath}/docs/${id}`);
}

/**
 * Fetches one official Lex.uz language variant, persists immutable source
 * artifacts in R2, and writes an article-first D1 version. Source HTML is
 * parsed as data only and never becomes model instructions.
 */
export async function ingestOfficialLexDocument(
  env: LegalCorpusIngestionEnv,
  input: {
    sourceUrl: string;
    now?: Date;
    wait?: (delayMs: number) => Promise<void>;
    fetchImpl?: FetchLike;
    heartbeat?: () => Promise<void>;
  },
): Promise<LegalCorpusIngestionResult> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED")) {
    throw new TypeError("LEGAL_CORPUS_DISABLED");
  }
  const revision = parseLexRevisionUrl(input.sourceUrl);
  const parsed = revision ?? parseLexDocumentUrl(input.sourceUrl);
  if (!parsed) throw new TypeError("LEGAL_CORPUS_OFFICIAL_URL_REJECTED");
  const currentDocument = parseLexDocumentUrl(parsed.sourceUrl.split("?", 1)[0] ?? parsed.sourceUrl);
  if (!currentDocument) throw new TypeError("LEGAL_CORPUS_OFFICIAL_URL_REJECTED");
  autoTrustLexSource({ officialUrl: currentDocument.sourceUrl });

  const fetched = await fetchLegalSource(parsed.sourceUrl, {
    adviceEnabled: false,
    now: () => input.now ?? new Date(),
    wait: input.wait,
    fetchImpl: input.fetchImpl,
    heartbeat: input.heartbeat,
    maxBytes: MAX_LEX_SOURCE_BYTES,
  });
  await input.heartbeat?.();
  const sourceUrl = fetched.canonicalUrl;
  const sourceHash = fetched.contentSha256;
  const rawHtml = new TextDecoder("utf-8", { fatal: true }).decode(fetched.bytes);
  const languageVariants = discoverLexLanguageVariants(rawHtml, currentDocument);
  const revisionHistory = discoverLexRevisionHistory(rawHtml, currentDocument);
  const effectivity = parseLexDocumentEffectivity(rawHtml);
  const documentMetadata = parseLexDocumentMetadata(rawHtml);
  const documentId = await linkedDocumentId(env.DB, languageVariants)
    ?? lexLanguageFamilyId(languageVariants);
  const normalizedSource = await normalizeOfficialLexSource({
    rawHtml,
    sourceUrl,
    sourceHash,
    canonicalId: currentDocument.canonicalDocumentId,
    locale: languageToLegacyLocale(currentDocument.language),
    now: input.now ?? new Date(),
    wait: input.wait,
    fetchImpl: input.fetchImpl,
    heartbeat: input.heartbeat,
  });
  await input.heartbeat?.();
  const { normalized, representation } = normalizedSource;
  const normalizedJson = JSON.stringify(normalized);
  const normalizedHash = await sha256(normalizedJson);
  const versionHash = await sha256(JSON.stringify({
    sourceHash,
    normalizedHash,
    representation: representation === null ? null : {
      kind: representation.kind,
      sourceUrl: representation.sourceUrl,
      containerSha256: representation.containerSha256,
      pdfSha256: representation.pdfSha256,
    },
    status: effectivity.status,
    validFrom: effectivity.validFrom,
    validTo: effectivity.validTo,
    currentRevisionDate: revisionHistory.currentRevisionDate,
    revisionDate: revision?.revisionDate ?? null,
  }));
  const provisions = parseLegalProvisions(normalized.plainText, parsed.language, {
    maxProvisions: MAX_PROVISIONS_PER_VERSION,
  });
  if (provisions.length === 0 || provisions.length > MAX_PROVISIONS_PER_VERSION) {
    throw new TypeError("LEGAL_CORPUS_PROVISION_LIMIT_REJECTED");
  }
  const chunks = provisions.flatMap((provision) => chunkLegalProvision(provision)
    .map((text, chunkIndex, all) => ({ provision, text, chunkIndex, totalChunks: all.length })));
  if (chunks.length === 0 || chunks.length > MAX_CHUNKS_PER_VERSION) {
    throw new TypeError("LEGAL_CORPUS_CHUNK_LIMIT_REJECTED");
  }
  await input.heartbeat?.();

  const now = nowIso(input.now);
  const current = await existingVariant(env.DB, documentId, currentDocument.language);
  const variantId = current?.variantId ?? `${documentId}:${currentDocument.language}`;
  if (current) {
    await env.DB.prepare(`UPDATE legal_corpus_documents SET
      document_type=coalesce(?,document_type),
      document_number=coalesce(?,document_number),
      adopting_authority=coalesce(?,adopting_authority),
      adoption_date=coalesce(?,adoption_date),updated_at=?
      WHERE id=?`).bind(
      documentMetadata.documentType,
      documentMetadata.documentNumber,
      documentMetadata.adoptingAuthority,
      documentMetadata.adoptionDate,
      nowIso(input.now),
      current.documentId,
    ).run();
  }
  const sparseMode = await sparseStorageMode(env.DB);
  const alreadyStored = await storedVersionByHash(env.DB, variantId, versionHash);
  const alreadyStoredMaterialization = alreadyStored
    ? await storedVersionMaterialization(env.DB, alreadyStored.versionId, sparseMode)
    : null;
  if (
    alreadyStored
    && alreadyStoredMaterialization
    && versionMaterializationComplete(
      alreadyStoredMaterialization,
      provisions.length,
      chunks.length,
    )
  ) {
    if (revision) {
      return {
        status: "unchanged", documentId, variantId,
        versionId: alreadyStored.versionId, provisionCount: 0, chunkCount: 0, sourceUrl,
      };
    }
    if (!current) throw new TypeError("LEGAL_CORPUS_VARIANT_INVARIANT_FAILED");
    await env.DB.batch([
      env.DB.prepare(`UPDATE legal_corpus_variants
        SET source_url=?,last_verified_at=?,updated_at=? WHERE id=?`).bind(sourceUrl, now, now, current.variantId),
      env.DB.prepare(`UPDATE legal_corpus_documents SET updated_at=? WHERE id=?`).bind(now, current.documentId),
      env.DB.prepare(`UPDATE legal_corpus_variants
        SET title=?,short_title=?,updated_at=? WHERE id=?`).bind(
        normalized.documentTitle, normalized.documentTitle.slice(0, 240), now, current.variantId,
      ),
    ]);
    const resumesPartialWrite = alreadyStored.versionNumber > (current.currentVersionNumber ?? 0);
    if (resumesPartialWrite) {
      if (
        alreadyStored.validFrom
        && (!current.currentValidFrom || alreadyStored.validFrom > current.currentValidFrom)
      ) {
        await env.DB.prepare(`UPDATE legal_corpus_versions
          SET valid_to=? WHERE id=? AND valid_to IS NULL
            AND (valid_from IS NULL OR valid_from<?)
        `).bind(alreadyStored.validFrom, current.currentVersionId, alreadyStored.validFrom).run();
      }
      await env.DB.prepare(`UPDATE legal_corpus_variants
        SET current_version_id=?,source_url=?,last_verified_at=?,updated_at=? WHERE id=?
      `).bind(alreadyStored.versionId, currentDocument.sourceUrl, now, now, variantId).run();
    }
    await persistLanguageAliasesAndQueue({
      env, documentId: current.documentId, variants: languageVariants,
      currentSourceUrl: sourceUrl, now: input.now ?? new Date(), heartbeat: input.heartbeat,
    });
    await enqueueRevisionHistory({
      env, revisions: revisionHistory.revisions, now: input.now ?? new Date(), documentId,
      heartbeat: input.heartbeat,
    });
    return {
      status: "unchanged", documentId: current.documentId, variantId: current.variantId,
      versionId: resumesPartialWrite ? alreadyStored.versionId : current.currentVersionId,
      provisionCount: 0, chunkCount: 0, sourceUrl,
    };
  }

  const previous = alreadyStored || revision
    ? []
    : await currentProvisions(env.DB, current?.currentVersionId ?? null);
  const diff = diffCorpusProvisions(previous, provisions);
  if (!alreadyStored && !revision && diff.suspiciousShrink) {
    await recordFailure({
      db: env.DB, documentId, sourceUrl,
      language: currentDocument.language, now, errorCode: "LEGAL_CORPUS_SUSPICIOUS_CHANGE",
      retryable: false, retryCount: 0, retryState: "terminal",
    });
    return {
      status: "halted_suspicious_change", documentId,
      variantId,
      versionId: null, provisionCount: 0, chunkCount: 0, sourceUrl,
    };
  }

  const stem = objectStem(currentDocument.canonicalDocumentId, currentDocument.language, sourceHash);
  const rawObjectKey = `${stem}/raw.html`;
  const normalizedObjectKey = `${stem}/normalized.json`;
  const representationContainerKey = representation === null
    ? null
    : `${stem}/representation/${representation.containerSha256}.${representation.kind === "lex-zip-pdf" ? "zip" : "pdf"}`;
  const representationPdfKey = representation === null
    ? null
    : representation.kind === "lex-pdf"
      ? representationContainerKey
      : `${stem}/representation/${representation.pdfSha256}.pdf`;
  await env.BUCKET.put(rawObjectKey, fetched.bytes, {
    httpMetadata: { contentType: fetched.contentType },
    customMetadata: {
      sourceSha256: sourceHash,
      sourceUrl,
      ...(representation === null ? {} : {
        representationKind: representation.kind,
        representationSourceUrl: representation.sourceUrl,
        representationContainerSha256: representation.containerSha256,
        representationPdfSha256: representation.pdfSha256,
      }),
    },
  });
  await input.heartbeat?.();
  if (representation !== null && representationContainerKey !== null) {
    await env.BUCKET.put(representationContainerKey, representation.containerBytes, {
      httpMetadata: { contentType: representation.contentType },
      customMetadata: {
        sourceSha256: sourceHash,
        sourceUrl,
        representationKind: representation.kind,
        representationSourceUrl: representation.sourceUrl,
        representationContainerSha256: representation.containerSha256,
        representationPdfSha256: representation.pdfSha256,
      },
    });
    if (
      representation.kind === "lex-zip-pdf"
      && representationPdfKey !== null
    ) {
      await env.BUCKET.put(representationPdfKey, representation.pdfBytes, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: {
          sourceSha256: sourceHash,
          sourceUrl,
          representationKind: representation.kind,
          representationSourceUrl: representation.sourceUrl,
          representationContainerSha256: representation.containerSha256,
          representationPdfSha256: representation.pdfSha256,
        },
      });
    }
    await input.heartbeat?.();
  }
  await env.BUCKET.put(normalizedObjectKey, normalizedJson, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: {
      sourceSha256: sourceHash,
      normalizedSha256: normalizedHash,
      versionSha256: versionHash,
      sourceUrl,
      ...(representation === null ? {} : {
        representationKind: representation.kind,
        representationSourceUrl: representation.sourceUrl,
        representationContainerSha256: representation.containerSha256,
        representationPdfSha256: representation.pdfSha256,
        ...(representationContainerKey ? { representationContainerKey } : {}),
        ...(representationPdfKey ? { representationPdfKey } : {}),
      }),
    },
  });
  await input.heartbeat?.();

  const versionNumber = alreadyStored?.versionNumber
    ?? await nextVersionNumber(env.DB, variantId);
  const versionId = alreadyStored?.versionId
    ?? `${variantId}:v${versionNumber}:${versionHash.slice(0, 12)}`;
  const changeType = revision ? "modified" : previous.length === 0
    ? "new"
    : diff.changes.some((change) => change.change === "modified" || change.change === "renumbered")
      ? "modified"
      : "metadata_changed";
  const revisionDate = revision?.revisionDate
    ?? revisionHistory.currentRevisionDate
    ?? effectivity.validFrom;
  const validTo = revisionDate && revision
    ? await nextLaterValidityDate(env.DB, variantId, revisionDate)
    : effectivity.validTo;
  const versionStatus = revision ? "historical" : effectivity.status;

  const header = [
    env.DB.prepare(`INSERT INTO legal_corpus_documents
      (id,provider,jurisdiction,source_class,scope,tenant_id,owner_user_id,matter_id,visibility,canonical_url,title,short_title,document_type,document_number,adopting_authority,adoption_date,publication_date,availability_status,trusted,verification_status,approval_required,created_at,updated_at)
      VALUES (?,?,?,?,? ,NULL,NULL,NULL,?,?,?,?,?,?,?,?,?,'ready',1,'official_source',0,?,?)
      ON CONFLICT(id) DO UPDATE SET
        document_type=coalesce(excluded.document_type,legal_corpus_documents.document_type),
        document_number=coalesce(excluded.document_number,legal_corpus_documents.document_number),
        adopting_authority=coalesce(excluded.adopting_authority,legal_corpus_documents.adopting_authority),
        adoption_date=coalesce(excluded.adoption_date,legal_corpus_documents.adoption_date),
        updated_at=excluded.updated_at
    `).bind(
      documentId, "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global",
      currentDocument.sourceUrl, normalized.documentTitle, normalized.documentTitle.slice(0, 240),
      documentMetadata.documentType, documentMetadata.documentNumber,
      documentMetadata.adoptingAuthority, documentMetadata.adoptionDate, null,
      now, now,
    ),
    env.DB.prepare(`INSERT INTO legal_corpus_variants
      (id,document_id,language,is_official_language_version,translation_type,source_url,last_verified_at,current_version_id,created_at,updated_at,title,short_title)
      VALUES (?,?,?,1,NULL,?,?,NULL,?,?,?,?)
      ON CONFLICT(document_id,language,is_official_language_version) DO UPDATE SET
        source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,
        title=excluded.title,short_title=excluded.short_title,updated_at=excluded.updated_at
    `).bind(
      variantId, documentId, currentDocument.language, currentDocument.sourceUrl,
      now, now, now, normalized.documentTitle, normalized.documentTitle.slice(0, 240),
    ),
    // The current pointer is intentionally updated only after all immutable
    // provision rows exist, so a retry can safely resume a partial write.
    env.DB.prepare(`INSERT INTO legal_corpus_versions
      (id,variant_id,previous_version_id,version_number,status,valid_from,valid_to,version_date,content_sha256,raw_object_key,normalized_object_key,source_url,fetched_at,change_type,created_at)
      VALUES (?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(variant_id,content_sha256) DO NOTHING
    `).bind(
      versionId, variantId, revision ? null : current?.currentVersionId ?? null, versionNumber,
      versionStatus, revisionDate, validTo, revisionDate ?? dateOnly(fetched.fetchedAt),
      versionHash, rawObjectKey, normalizedObjectKey,
      sourceUrl, fetched.fetchedAt, changeType, now,
    ),
  ];
  await env.DB.batch(header);
  await input.heartbeat?.();

  // New Workers can run before the additive sparse migration. Resolve this
  // once per source so a deployment and schema migration can be rolled out in
  // either safe order without dropping a document's sparse evidence.
  const provisionStatements: D1PreparedStatement[] = [];
  for (const [provisionIndex, provision] of provisions.entries()) {
    if (provisionIndex % 64 === 0) await input.heartbeat?.();
    const provisionId = `${versionId}:p${provision.sequence}`;
    const provisionHash = await sha256(provision.text);
    provisionStatements.push(env.DB.prepare(`INSERT INTO legal_corpus_provisions
      (id,document_id,variant_id,version_id,article_number,article_number_normalized,article_title,part,chapter,section,sequence,text,exact_quote_source,language,status,valid_from,valid_to,source_url,content_sha256,created_at)
      VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,?, ?,?,?, ?,?,?)
      ON CONFLICT(version_id,article_number_normalized,sequence) DO NOTHING
    `).bind(
      provisionId, documentId, variantId, versionId, provision.articleNumber,
      provision.articleNumberNormalized, provision.title, provision.sequence,
      provision.text, provision.text, currentDocument.language, versionStatus,
      revisionDate, validTo, sourceUrl, provisionHash, now,
    ));
  }
  for (const [chunkIndex, chunk] of chunks.entries()) {
    if (chunkIndex % 64 === 0) await input.heartbeat?.();
    const provisionId = `${versionId}:p${chunk.provision.sequence}`;
    const sparseEntries = buildSparseTermEntries({
      text: chunk.text,
      articleNumber: chunk.provision.articleNumber,
      title: chunk.provision.title,
    });
    const chunkId = `${provisionId}:c${chunk.chunkIndex}`;
    provisionStatements.push(env.DB.prepare(`INSERT INTO legal_corpus_chunks
      (id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,dense_vector_id,sparse_terms_json,indexed_at,created_at)
      VALUES (?,?,?,?,?,?,?,NULL,?,?,?)
      ON CONFLICT(provision_id,chunk_index) DO NOTHING
    `).bind(
      chunkId, provisionId, versionId, chunk.chunkIndex,
      chunk.totalChunks, chunk.text, await sha256(chunk.text),
      "[]",
      now, now,
    ));
    provisionStatements.push(...sparseTermWriteStatements({
      db: env.DB,
      mode: sparseMode,
      chunkId,
      entries: sparseEntries,
      documentId,
      versionId,
      language: currentDocument.language,
    }));
  }
  await runBatches(env.DB, provisionStatements, input.heartbeat);
  await input.heartbeat?.();
  const storedMaterialization = await storedVersionMaterialization(
    env.DB,
    versionId,
    sparseMode,
  );
  if (!versionMaterializationComplete(
    storedMaterialization,
    provisions.length,
    chunks.length,
  )) {
    throw new TypeError("LEGAL_CORPUS_VERSION_MATERIALIZATION_INCOMPLETE");
  }
  if (!revision) {
    if (
      current?.currentVersionId
      && revisionDate
      && (!current.currentValidFrom || revisionDate > current.currentValidFrom)
    ) {
      await env.DB.prepare(`UPDATE legal_corpus_versions
        SET valid_to=? WHERE id=? AND valid_to IS NULL
          AND (valid_from IS NULL OR valid_from<?)
      `).bind(revisionDate, current.currentVersionId, revisionDate).run();
    }
    await env.DB.prepare(`UPDATE legal_corpus_variants
      SET current_version_id=?,source_url=?,last_verified_at=?,updated_at=? WHERE id=?
    `).bind(versionId, currentDocument.sourceUrl, now, now, variantId).run();

    await persistLanguageAliasesAndQueue({
      env, documentId, variants: languageVariants,
      currentSourceUrl: currentDocument.sourceUrl, now: input.now ?? new Date(), heartbeat: input.heartbeat,
    });
    await enqueueRevisionHistory({
      env, revisions: revisionHistory.revisions, now: input.now ?? new Date(), documentId,
      heartbeat: input.heartbeat,
    });
  }

  return {
    status: "indexed", documentId, variantId, versionId,
    provisionCount: provisions.length, chunkCount: chunks.length, sourceUrl,
  };
}

export async function enqueueOfficialLexCorpusDocument(
  env: LegalCorpusQueueEnv,
  input: { sourceUrl: string; now?: Date; correlationId?: string },
): Promise<{ created: boolean; jobId: string; canonicalDocumentId: string }> {
  const parsed = parseLexDocumentUrl(input.sourceUrl);
  if (!parsed) throw new TypeError("LEGAL_CORPUS_OFFICIAL_URL_REJECTED");
  const now = nowIso(input.now);
  const idempotencyKey = await sha256(`fetch\n${parsed.sourceUrl}`);
  const jobId = `legal-corpus:${idempotencyKey.slice(0, 28)}`;
  const result = await env.DB.prepare(`INSERT INTO legal_corpus_ingestion_jobs
    (id,job_type,status,provider,canonical_document_id,variant_id,source_url,language,idempotency_key,attempt_count,max_attempts,next_attempt_at,last_error_code,correlation_id,created_at,updated_at)
    VALUES (?,'fetch','queued','lex_uz',?,NULL,?,?,?,0,5,?,NULL,?,?,?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).bind(
    jobId, parsed.canonicalDocumentId, parsed.sourceUrl, parsed.language,
    idempotencyKey, now, input.correlationId ?? crypto.randomUUID(), now, now,
  ).run();
  return {
    created: Number(result.meta.changes ?? 0) === 1,
    jobId,
    canonicalDocumentId: parsed.canonicalDocumentId,
  };
}

export async function enqueueOfficialLexCorpusRevision(
  env: LegalCorpusQueueEnv,
  input: { sourceUrl: string; now?: Date; correlationId?: string },
): Promise<{ created: boolean; jobId: string; canonicalDocumentId: string }> {
  const parsed = parseLexRevisionUrl(input.sourceUrl);
  if (!parsed) throw new TypeError("LEGAL_CORPUS_OFFICIAL_REVISION_URL_REJECTED");
  const now = nowIso(input.now);
  const idempotencyKey = await sha256(`version\n${parsed.sourceUrl}`);
  const jobId = `legal-version:${idempotencyKey.slice(0, 28)}`;
  const result = await env.DB.prepare(`INSERT INTO legal_corpus_ingestion_jobs
    (id,job_type,status,provider,canonical_document_id,variant_id,source_url,language,idempotency_key,attempt_count,max_attempts,next_attempt_at,last_error_code,correlation_id,created_at,updated_at)
    VALUES (?,'version','queued','lex_uz',?,NULL,?,?,?,0,5,?,NULL,?,?,?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).bind(
    jobId, parsed.canonicalDocumentId, parsed.sourceUrl, parsed.language,
    idempotencyKey, now, input.correlationId ?? crypto.randomUUID(), now, now,
  ).run();
  return {
    created: Number(result.meta.changes ?? 0) === 1,
    jobId,
    canonicalDocumentId: parsed.canonicalDocumentId,
  };
}

/**
 * Repair a handoff or interrupted discovery ledger whose durable catalogue
 * rows were written without their corresponding fetch jobs.  Discovery rows
 * are immutable evidence; this bounded reconciliation only materializes the
 * missing queue entries and leaves already-created (including failed) jobs
 * untouched.  Ordering follows the approved source-family priority so laws,
 * Cabinet acts (ПКМ), and President acts (ПП/УП) are restored before lower
 * priority catalogues.  Network work remains in runNextLegalCorpusIngestionJob
 * and therefore still uses the single Lex host pacer.
 */
export async function reconcileLexCatalogFetchJobs(
  env: LegalCorpusIngestionEnv,
  input: { now?: Date; limit?: number } = {},
): Promise<{ considered: number; queued: number }> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { considered: 0, queued: 0 };
  }
  const limit = Math.max(1, Math.min(input.limit ?? 250, 500));
  const priority = `CASE cp.category_key ${LEX_CORPUS_CATEGORY_PRIORITY
    .map((category, index) => `WHEN '${category}' THEN ${index}`)
    .join(" ")} ELSE ${LEX_CORPUS_CATEGORY_PRIORITY.length} END`;
  const candidates = await env.DB.prepare(`
    SELECT dd.source_url AS sourceUrl
    FROM legal_corpus_discovery_checkpoints AS cp
    INNER JOIN legal_corpus_discovery_documents AS dd ON dd.checkpoint_id=cp.id
    LEFT JOIN legal_corpus_ingestion_jobs AS existing ON existing.source_url=dd.source_url
    WHERE cp.status='completed' AND existing.id IS NULL
    ORDER BY ${priority},dd.discovered_at ASC,dd.source_url ASC
    LIMIT ?
  `).bind(limit).all<{ sourceUrl: string }>();
  let queued = 0;
  for (const candidate of candidates.results) {
    const result = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: candidate.sourceUrl,
      now: input.now,
      correlationId: "legal-corpus-discovery-reconcile",
    });
    if (result.created) queued += 1;
  }
  return { considered: candidates.results.length, queued };
}

/**
 * Converts the already robots-aware Lex metadata feed into durable corpus
 * jobs. It never discovers arbitrary URLs and is inert until both corpus
 * switches are enabled. A later category crawler can use the same queue.
 */
export async function seedLexCorpusJobsFromMetadata(
  env: LegalCorpusIngestionEnv,
  input: { now?: Date; limit?: number } = {},
): Promise<{ considered: number; queued: number }> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { considered: 0, queued: 0 };
  }
  const limit = Math.max(1, Math.min(input.limit ?? 100, 250));
  const candidates = await env.DB.prepare(`
    SELECT canonical_url AS sourceUrl
    FROM legal_monitoring_metadata
    WHERE canonical_url LIKE 'https://lex.uz/%'
    ORDER BY last_checked_at DESC
    LIMIT ?
  `).bind(limit).all<{ sourceUrl: string }>();
  let queued = 0;
  for (const candidate of candidates.results) {
    const result = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: candidate.sourceUrl,
      now: input.now,
    });
    if (result.created) queued += 1;
  }
  return { considered: candidates.results.length, queued };
}

/** Claims and runs one job. Callers may invoke it sequentially with the same
 * D1-paced fetch function to form a bounded batch without parallel crawling. */
export async function runNextLegalCorpusIngestionJob(
  env: LegalCorpusIngestionEnv,
  input: {
    now?: Date;
    /**
     * Staging-only queue drain approval. This permits processing jobs that
     * already exist in the durable queue while keeping catalog discovery and
     * metadata seeding behind LEGAL_CORPUS_AUTO_INGEST_ENABLED.
     */
    allowQueuedProcessing?: boolean;
    wait?: (delayMs: number) => Promise<void>;
    fetchImpl?: FetchLike;
    heartbeat?: () => Promise<void>;
    afterIngest?: (result: LegalCorpusIngestionResult) => Promise<void>;
    /** Reserves one bounded slot for a durable queued job type. A due retry
     * still has global precedence, and an empty reservation falls back to
     * ordinary FIFO work rather than leaving a paced source slot idle. */
    reservedQueuedJobType?: IngestionJob["jobType"];
    /** A bounded share may favour already-discovered, high-value official
     * source families. Retries always retain global precedence, and callers
     * keep ordinary FIFO slots so this cannot starve the rest of the corpus. */
    preferredCatalogCategories?: readonly string[];
    /** A deterministic preferred-language slot avoids consuming the whole
     * bounded share with whichever official locale was catalogued first. */
    preferredCatalogLanguages?: readonly LegalCorpusLanguage[];
    /** Exact official code candidates discovered by the bounded title search
     * are taken before ordinary catalogue jobs. Due retries and an explicitly
     * reserved version slot retain precedence. */
    preferredCanonicalDocumentIds?: readonly string[];
    /** Once a staging shard is above the release document floor, prefer
     * already-queued non-catalogue work (reconciliation/version jobs) so the
     * release-blocking queue can drain without enabling new discovery. */
    preferNonCatalogQueuedJob?: boolean;
  } = {},
): Promise<LegalCorpusJobRunResult> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED")
    || (!featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")
      && input.allowQueuedProcessing !== true)) {
    return { claimed: false, status: "disabled", jobId: null, safeErrorCode: null };
  }
  const nowDate = input.now ?? new Date();
  const now = nowIso(nowDate);
  await reconcileStaleRunningJob(env.DB, nowDate);
  await reconcileCompletedPartialWriteRiskJob(env.DB, now);
  await reconcileRecoverableSignedLexUnavailable(env.DB, now);
  await reconcileRecoverableLanguageTextUnavailable(env.DB, now);
  await reconcileRecoverableDeadLetter(env.DB, now);
  const retryCandidate = await env.DB.prepare(`SELECT id,job_type AS jobType,source_url AS sourceUrl,language,canonical_document_id AS canonicalDocumentId,attempt_count AS attemptCount,max_attempts AS maxAttempts
    FROM legal_corpus_ingestion_jobs
    WHERE status='retrying' AND handoff_id IS NULL
      AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY coalesce(next_attempt_at,created_at) ASC,created_at ASC LIMIT 1
  `).bind(now).first<IngestionJob>();
  const reservedCandidate = retryCandidate || !input.reservedQueuedJobType
    ? null
    : await env.DB.prepare(`SELECT id,job_type AS jobType,source_url AS sourceUrl,language,
        canonical_document_id AS canonicalDocumentId,attempt_count AS attemptCount,max_attempts AS maxAttempts
      FROM legal_corpus_ingestion_jobs
      WHERE status='queued' AND handoff_id IS NULL
        AND job_type=? AND (next_attempt_at IS NULL OR next_attempt_at<=?)
      ORDER BY coalesce(next_attempt_at,created_at) ASC,created_at ASC,id ASC LIMIT 1
    `).bind(input.reservedQueuedJobType, now).first<IngestionJob>();
  const preferredDocumentIds = preferredCanonicalDocumentIds(input.preferredCanonicalDocumentIds);
  const preferredCodeCandidate = retryCandidate || reservedCandidate || preferredDocumentIds.length === 0
    ? null
    : await findPreferredCanonicalDocumentJob(env.DB, now, preferredDocumentIds);
  const categories = preferredCatalogCategories(input.preferredCatalogCategories);
  const languages = preferredCatalogLanguages(input.preferredCatalogLanguages);
  const preferredCandidate = retryCandidate || reservedCandidate || preferredCodeCandidate || categories.length === 0
    ? null
    : await findPreferredCatalogJob(env.DB, now, categories, languages)
      ?? (languages.length > 0
        ? await findPreferredCatalogJob(env.DB, now, categories, [])
        : null);
  const nonCatalogCandidate = retryCandidate || reservedCandidate || preferredCodeCandidate || preferredCandidate
    || input.preferNonCatalogQueuedJob !== true
    ? null
    : await env.DB.prepare(`SELECT id,job_type AS jobType,source_url AS sourceUrl,language,canonical_document_id AS canonicalDocumentId,attempt_count AS attemptCount,max_attempts AS maxAttempts
      FROM legal_corpus_ingestion_jobs
      WHERE status='queued' AND handoff_id IS NULL
        AND (correlation_id IS NULL OR correlation_id NOT LIKE 'lex-catalog:%')
        AND (next_attempt_at IS NULL OR next_attempt_at<=?)
      ORDER BY coalesce(next_attempt_at,created_at) ASC,created_at ASC,id ASC LIMIT 1
    `).bind(now).first<IngestionJob>();
  const fifoCandidate = retryCandidate || reservedCandidate || preferredCodeCandidate || preferredCandidate || nonCatalogCandidate
    ? null
    : await env.DB.prepare(`SELECT id,job_type AS jobType,source_url AS sourceUrl,language,canonical_document_id AS canonicalDocumentId,attempt_count AS attemptCount,max_attempts AS maxAttempts
      FROM legal_corpus_ingestion_jobs
      WHERE status='queued' AND handoff_id IS NULL
        AND (next_attempt_at IS NULL OR next_attempt_at<=?)
      ORDER BY coalesce(next_attempt_at,created_at) ASC,created_at ASC LIMIT 1
    `).bind(now).first<IngestionJob>();
  const candidate = retryCandidate ?? reservedCandidate ?? preferredCodeCandidate ?? preferredCandidate
    ?? nonCatalogCandidate ?? fifoCandidate;
  if (!candidate) return { claimed: false, status: "empty", jobId: null, safeErrorCode: null };
  const claimed = await env.DB.prepare(`UPDATE legal_corpus_ingestion_jobs
    SET status='running',attempt_count=attempt_count+1,updated_at=?
    WHERE id=? AND handoff_id IS NULL AND status IN ('queued','retrying')
      AND (next_attempt_at IS NULL OR next_attempt_at<=?)
  `).bind(now, candidate.id, now).run();
  if (Number(claimed.meta.changes ?? 0) !== 1) {
    return { claimed: false, status: "empty", jobId: candidate.id, safeErrorCode: null };
  }
  const attempt = candidate.attemptCount + 1;
  // Keep the durable ingestion lease fresh as well as the scheduler lease.
  // Long Lex pages can spend several minutes in fetch/parse/index work; only
  // renewing the scheduled-run row would let a neighboring invocation
  // incorrectly reclaim this still-live job as stale.
  const touchIngestionJob = async (): Promise<void> => {
    const heartbeatAt = new Date().toISOString();
    const touched = await env.DB.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET updated_at=? WHERE id=? AND status='running'`).bind(
      heartbeatAt, candidate.id,
    ).run();
    if (Number(touched.meta.changes ?? 0) !== 1) {
      throw new Error("LEGAL_CORPUS_INGESTION_LEASE_LOST");
    }
    await input.heartbeat?.();
  };
  try {
    const result = await ingestOfficialLexDocument(env, {
      sourceUrl: candidate.sourceUrl,
      now: nowDate,
      wait: input.wait,
      fetchImpl: input.fetchImpl,
      heartbeat: touchIngestionJob,
    });
    if (result.status !== "halted_suspicious_change" && result.versionId && input.afterIngest) {
      await input.afterIngest(result);
    }
    const terminal = result.status === "halted_suspicious_change";
    const finishedAt = new Date().toISOString();
    await env.DB.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status=?,next_attempt_at=NULL,last_error_code=?,updated_at=? WHERE id=?
    `).bind(terminal ? "failed" : "completed", terminal ? "LEGAL_CORPUS_SUSPICIOUS_CHANGE" : null, finishedAt, candidate.id).run();
    return {
      claimed: true,
      status: terminal ? "halted_suspicious_change" : "completed",
      jobId: candidate.id,
      safeErrorCode: terminal ? "LEGAL_CORPUS_SUSPICIOUS_CHANGE" : null,
    };
  } catch (error) {
    const finishedDate = new Date();
    const finishedAt = finishedDate.toISOString();
    const errorCode = safeErrorCode(error);
    const alternate = alternateLanguageSource(error);
    if (alternate && candidate.attemptCount <= 1 && alternate.sourceUrl !== candidate.sourceUrl) {
      await recordFailure({
        db: env.DB, jobId: candidate.id, documentId: candidate.canonicalDocumentId,
        sourceUrl: candidate.sourceUrl, language: candidate.language, now: finishedAt,
        errorCode, httpStatus: fetchHttpStatus(error), retryable: true,
        retryCount: attempt, retryState: "retrying",
      });
      await env.DB.prepare(`UPDATE legal_corpus_ingestion_jobs
        SET status='retrying',source_url=?,language=?,next_attempt_at=?,last_error_code=?,updated_at=?
        WHERE id=? AND status='running'
      `).bind(
        alternate.sourceUrl, alternate.language, now, ALTERNATE_LANGUAGE_REDIRECT_CODE, finishedAt, candidate.id,
      ).run();
      return { claimed: true, status: "completed", jobId: candidate.id, safeErrorCode: null };
    }
    const unavailable = technicallyUnavailable(error);
    const shouldRetry = !unavailable && retryable(error) && attempt < candidate.maxAttempts;
    if (unavailable) {
      // A prior parser version reported this explicit Lex language notice as a
      // terminal short-document failure. Preserve the records while correcting
      // their resolution state for the same job after the official page has
      // been re-read by the current parser.
      await env.DB.prepare(`UPDATE legal_corpus_failures
        SET retryable=0,retry_state='technically_unavailable'
        WHERE job_id=? AND retry_state IN ('pending','retrying','terminal')
          AND (error_code='LEGAL_SOURCE_CONTENT_INSUFFICIENT' OR error_code=?)
      `).bind(candidate.id, errorCode).run();
    }
    await recordFailure({
      db: env.DB, jobId: candidate.id, documentId: candidate.canonicalDocumentId,
      sourceUrl: candidate.sourceUrl, language: candidate.language, now: finishedAt, errorCode,
      httpStatus: fetchHttpStatus(error),
      retryable: shouldRetry, retryCount: attempt,
      retryState: unavailable ? "technically_unavailable" : shouldRetry ? "retrying" : "terminal",
    });
    await env.DB.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status=?,next_attempt_at=?,last_error_code=?,updated_at=? WHERE id=?
    `).bind(unavailable ? "completed" : shouldRetry ? "retrying" : "dead_letter",
      shouldRetry ? retryAt(finishedDate, attempt) : null, errorCode, finishedAt, candidate.id).run();
    return {
      claimed: true,
      status: unavailable ? "completed" : shouldRetry ? "retrying" : "failed",
      jobId: candidate.id,
      safeErrorCode: errorCode,
    };
  }
}

export { LEGAL_CORPUS_FEATURE_FLAGS };
