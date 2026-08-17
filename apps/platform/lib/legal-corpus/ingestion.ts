import {
  LegalSourceFetchError,
  classifyLegalSourceUrl,
  fetchLexArchiveRepresentation,
  fetchLexPdfRepresentation,
  fetchLegalSource,
} from "../legal/source-fetch";
import {
  LegalSourceParserError,
  normalizeLegalSourceHtml,
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
import { buildSparseTermEntries, sparseTermsJson } from "./sparse-index";

const MAX_PROVISIONS_PER_VERSION = 8_000;
const MAX_CHUNKS_PER_VERSION = 16_000;
const MAX_LEX_REPRESENTATION_BYTES = 20 * 1024 * 1024;
const WRITE_BATCH_SIZE = 90;
const RETRYABLE_INTERNAL_ERROR_CODES = new Set([
  "LEGAL_CORPUS_LANGUAGE_FAMILY_CONFLICT",
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
  ...RETRYABLE_INTERNAL_ERROR_CODES,
] as const;
const STALE_RUNNING_ERROR_CODE = "LEGAL_CORPUS_STALE_RUNNING_TIMEOUT";
// A normal scheduled invocation is fenced by a seven-minute distributed lock
// and its Lex requests have shorter individual timeouts. Keep a wider window
// so a slow but live invocation is never reclaimed by the next cron tick.
const STALE_RUNNING_AFTER_MS = 15 * 60_000;
const CATALOG_CATEGORY_KEYS = new Set<string>(LEX_CORPUS_CATEGORIES.map((category) => category.key));

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
      || error.code !== "LEGAL_SOURCE_CONTENT_INSUFFICIENT") throw error;
  }

  let representation: CorpusRepresentation;
  const representationId = reference.canonicalId.replace(/^-/, "");
  const embeddedPdfPath = `/pdffile/${representationId}`;
  if (input.rawHtml.includes(embeddedPdfPath)) {
    const fetched = await fetchLexPdfRepresentation(input.sourceUrl, {
      fetchImpl: input.fetchImpl,
      now: () => input.now,
      wait: input.wait,
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
    if (!archive) throw new TypeError("LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2");
    const fetched = await fetchLexArchiveRepresentation(
      input.sourceUrl,
      archive.sourceUrl,
      {
        fetchImpl: input.fetchImpl,
        now: () => input.now,
        wait: input.wait,
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
    || (error instanceof LegalSourceFetchError
      && error.code === "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE"
      && !error.retryable
      && error.httpStatus !== null
      && error.httpStatus >= 400
      && error.httpStatus < 500)
    || internalErrorCode(error) === "LEGAL_CORPUS_ATTACHMENT_TEXT_UNAVAILABLE";
}

function fetchHttpStatus(error: unknown): number | null {
  return error instanceof LegalSourceFetchError ? error.httpStatus : null;
}

function retryAt(now: Date, attempt: number): string {
  const delayMs = Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + delayMs).toISOString();
}

async function runBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let offset = 0; offset < statements.length; offset += WRITE_BATCH_SIZE) {
    await db.batch(statements.slice(offset, offset + WRITE_BATCH_SIZE));
  }
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
  if (!featureEnabled(input.env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) return;
  for (const variant of input.variants) {
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
}): Promise<void> {
  if (!featureEnabled(input.env, "LEGAL_CORPUS_HISTORICAL_ENABLED")
    || !featureEnabled(input.env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) return;
  for (const [index, revision] of input.revisions.entries()) {
    await enqueueOfficialLexCorpusRevision(input.env, {
      sourceUrl: revision.sourceUrl,
      now: new Date(input.now.getTime() + index),
      correlationId: `revision-history:${input.documentId}`,
    });
  }
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
    WHERE status='running' AND updated_at<=?
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
    WHERE id=? AND status='running' AND updated_at=?
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

async function reconcileRecoverableDeadLetter(
  db: D1Database,
  now: string,
): Promise<void> {
  const placeholders = RECOVERABLE_DEAD_LETTER_CODES.map(() => "?").join(",");
  const stranded = await db.prepare(`SELECT id,attempt_count AS attemptCount,
      max_attempts AS maxAttempts,last_error_code AS lastErrorCode
    FROM legal_corpus_ingestion_jobs
    WHERE status='dead_letter' AND (
      (attempt_count<max_attempts AND last_error_code IN (${placeholders}))
      OR last_error_code='LEGAL_SOURCE_CONTENT_INSUFFICIENT'
    )
    ORDER BY updated_at ASC,id ASC LIMIT 1
  `).bind(...RECOVERABLE_DEAD_LETTER_CODES).first<{
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
    WHERE id=? AND status='dead_letter' AND (
      attempt_count<max_attempts OR last_error_code='LEGAL_SOURCE_CONTENT_INSUFFICIENT'
    )
  `).bind(now, now, stranded.id).run();
  if (Number(updated.meta.changes ?? 0) !== 1) return;
  await db.prepare(`UPDATE legal_corpus_failures
    SET retryable=1,retry_state='retrying'
    WHERE job_id=? AND retry_state='terminal'
      AND (error_code IN (${placeholders})
        OR error_code='LEGAL_SOURCE_CONTENT_INSUFFICIENT')
  `).bind(stranded.id, ...RECOVERABLE_DEAD_LETTER_CODES).run();
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
  });
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
  });
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
  const provisions = parseLegalProvisions(normalized.plainText, parsed.language);
  if (provisions.length === 0 || provisions.length > MAX_PROVISIONS_PER_VERSION) {
    throw new TypeError("LEGAL_CORPUS_PROVISION_LIMIT_REJECTED");
  }
  const chunks = provisions.flatMap((provision) => chunkLegalProvision(provision)
    .map((text, chunkIndex, all) => ({ provision, text, chunkIndex, totalChunks: all.length })));
  if (chunks.length === 0 || chunks.length > MAX_CHUNKS_PER_VERSION) {
    throw new TypeError("LEGAL_CORPUS_CHUNK_LIMIT_REJECTED");
  }

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
  const alreadyStored = await storedVersionByHash(env.DB, variantId, versionHash);
  if (alreadyStored) {
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
      currentSourceUrl: sourceUrl, now: input.now ?? new Date(),
    });
    await enqueueRevisionHistory({
      env, revisions: revisionHistory.revisions, now: input.now ?? new Date(), documentId,
    });
    return {
      status: "unchanged", documentId: current.documentId, variantId: current.variantId,
      versionId: resumesPartialWrite ? alreadyStored.versionId : current.currentVersionId,
      provisionCount: 0, chunkCount: 0, sourceUrl,
    };
  }

  const previous = revision ? [] : await currentProvisions(env.DB, current?.currentVersionId ?? null);
  const diff = diffCorpusProvisions(previous, provisions);
  if (!revision && diff.suspiciousShrink) {
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

  const versionNumber = await nextVersionNumber(env.DB, variantId);
  const versionId = `${variantId}:v${versionNumber}:${versionHash.slice(0, 12)}`;
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

  const provisionStatements: D1PreparedStatement[] = [];
  for (const provision of provisions) {
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
  for (const chunk of chunks) {
    const provisionId = `${versionId}:p${chunk.provision.sequence}`;
    const sparseEntries = buildSparseTermEntries({
      text: chunk.text,
      articleNumber: chunk.provision.articleNumber,
      title: chunk.provision.title,
    });
    const sparseJson = sparseTermsJson(sparseEntries);
    provisionStatements.push(env.DB.prepare(`INSERT INTO legal_corpus_chunks
      (id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,dense_vector_id,sparse_terms_json,indexed_at,created_at)
      VALUES (?,?,?,?,?,?,?,NULL,?,?,?)
      ON CONFLICT(provision_id,chunk_index) DO NOTHING
    `).bind(
      `${provisionId}:c${chunk.chunkIndex}`, provisionId, versionId, chunk.chunkIndex,
      chunk.totalChunks, chunk.text, await sha256(chunk.text),
      "[]",
      now, now,
    ));
    // The exportable inverted index is rebuildable from immutable chunks.
    // Delete-then-insert keeps a retry idempotent without mutating legal text.
    provisionStatements.push(env.DB.prepare(
      "DELETE FROM legal_corpus_sparse_terms WHERE chunk_id=?",
    ).bind(`${provisionId}:c${chunk.chunkIndex}`));
    provisionStatements.push(env.DB.prepare(`INSERT INTO legal_corpus_sparse_terms
      (term,chunk_id,document_id,version_id,language,term_frequency,title_frequency,article_frequency)
      SELECT
        CAST(json_extract(value,'$.term') AS TEXT),?,?,?,?,
        CAST(json_extract(value,'$.termFrequency') AS INTEGER),
        CAST(json_extract(value,'$.titleFrequency') AS INTEGER),
        CAST(json_extract(value,'$.articleFrequency') AS INTEGER)
      FROM json_each(?)
      WHERE 1=1
      ON CONFLICT(term,chunk_id) DO UPDATE SET
        term_frequency=excluded.term_frequency,
        title_frequency=excluded.title_frequency,
        article_frequency=excluded.article_frequency
    `).bind(
      `${provisionId}:c${chunk.chunkIndex}`, documentId, versionId, currentDocument.language,
      sparseJson,
    ));
  }
  await runBatches(env.DB, provisionStatements);
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
      currentSourceUrl: currentDocument.sourceUrl, now: input.now ?? new Date(),
    });
    await enqueueRevisionHistory({
      env, revisions: revisionHistory.revisions, now: input.now ?? new Date(), documentId,
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
    wait?: (delayMs: number) => Promise<void>;
    fetchImpl?: FetchLike;
    afterIngest?: (result: LegalCorpusIngestionResult) => Promise<void>;
    /** A bounded share may favour already-discovered, high-value official
     * source families. Retries always retain global precedence, and callers
     * keep ordinary FIFO slots so this cannot starve the rest of the corpus. */
    preferredCatalogCategories?: readonly string[];
  } = {},
): Promise<LegalCorpusJobRunResult> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { claimed: false, status: "disabled", jobId: null, safeErrorCode: null };
  }
  const nowDate = input.now ?? new Date();
  const now = nowIso(nowDate);
  await reconcileStaleRunningJob(env.DB, nowDate);
  await reconcileRecoverableDeadLetter(env.DB, now);
  const retryCandidate = await env.DB.prepare(`SELECT id,job_type AS jobType,source_url AS sourceUrl,language,canonical_document_id AS canonicalDocumentId,attempt_count AS attemptCount,max_attempts AS maxAttempts
    FROM legal_corpus_ingestion_jobs
    WHERE status='retrying' AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY coalesce(next_attempt_at,created_at) ASC,created_at ASC LIMIT 1
  `).bind(now).first<IngestionJob>();
  const categories = preferredCatalogCategories(input.preferredCatalogCategories);
  const preferredCandidate = retryCandidate || categories.length === 0
    ? null
    : await env.DB.prepare(`SELECT j.id,j.job_type AS jobType,j.source_url AS sourceUrl,j.language,
        j.canonical_document_id AS canonicalDocumentId,j.attempt_count AS attemptCount,j.max_attempts AS maxAttempts
      FROM legal_corpus_discovery_checkpoints cp
      JOIN legal_corpus_discovery_documents dd ON dd.checkpoint_id=cp.id
      JOIN legal_corpus_ingestion_jobs j ON j.canonical_document_id=dd.provider_source_id
        AND j.language=dd.language
      WHERE cp.category_key IN (${categories.map(() => "?").join(",")})
        AND j.job_type='fetch' AND j.status='queued'
        AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=?)
      ORDER BY j.created_at ASC,j.id ASC LIMIT 1
    `).bind(...categories, now).first<IngestionJob>();
  const fifoCandidate = retryCandidate || preferredCandidate
    ? null
    : await env.DB.prepare(`SELECT id,job_type AS jobType,source_url AS sourceUrl,language,canonical_document_id AS canonicalDocumentId,attempt_count AS attemptCount,max_attempts AS maxAttempts
      FROM legal_corpus_ingestion_jobs
      WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at<=?)
      ORDER BY coalesce(next_attempt_at,created_at) ASC,created_at ASC LIMIT 1
    `).bind(now).first<IngestionJob>();
  const candidate = retryCandidate ?? preferredCandidate ?? fifoCandidate;
  if (!candidate) return { claimed: false, status: "empty", jobId: null, safeErrorCode: null };
  const claimed = await env.DB.prepare(`UPDATE legal_corpus_ingestion_jobs
    SET status='running',attempt_count=attempt_count+1,updated_at=?
    WHERE id=? AND status IN ('queued','retrying') AND (next_attempt_at IS NULL OR next_attempt_at<=?)
  `).bind(now, candidate.id, now).run();
  if (Number(claimed.meta.changes ?? 0) !== 1) {
    return { claimed: false, status: "empty", jobId: candidate.id, safeErrorCode: null };
  }
  const attempt = candidate.attemptCount + 1;
  try {
    const result = await ingestOfficialLexDocument(env, {
      sourceUrl: candidate.sourceUrl,
      now: nowDate,
      wait: input.wait,
      fetchImpl: input.fetchImpl,
    });
    if (result.status !== "halted_suspicious_change" && result.versionId && input.afterIngest) {
      await input.afterIngest(result);
    }
    const terminal = result.status === "halted_suspicious_change";
    await env.DB.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status=?,next_attempt_at=NULL,last_error_code=?,updated_at=? WHERE id=?
    `).bind(terminal ? "failed" : "completed", terminal ? "LEGAL_CORPUS_SUSPICIOUS_CHANGE" : null, now, candidate.id).run();
    return {
      claimed: true,
      status: terminal ? "halted_suspicious_change" : "completed",
      jobId: candidate.id,
      safeErrorCode: terminal ? "LEGAL_CORPUS_SUSPICIOUS_CHANGE" : null,
    };
  } catch (error) {
    const errorCode = safeErrorCode(error);
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
      sourceUrl: candidate.sourceUrl, language: candidate.language, now, errorCode,
      httpStatus: fetchHttpStatus(error),
      retryable: shouldRetry, retryCount: attempt,
      retryState: unavailable ? "technically_unavailable" : shouldRetry ? "retrying" : "terminal",
    });
    await env.DB.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status=?,next_attempt_at=?,last_error_code=?,updated_at=? WHERE id=?
    `).bind(unavailable ? "completed" : shouldRetry ? "retrying" : "dead_letter",
      shouldRetry ? retryAt(nowDate, attempt) : null, errorCode, now, candidate.id).run();
    return {
      claimed: true,
      status: unavailable ? "completed" : shouldRetry ? "retrying" : "failed",
      jobId: candidate.id,
      safeErrorCode: errorCode,
    };
  }
}

export { LEGAL_CORPUS_FEATURE_FLAGS };
