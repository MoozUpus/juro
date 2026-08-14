import {
  LegalSourceFetchError,
  fetchLegalSource,
} from "../legal/source-fetch";
import {
  LegalSourceParserError,
  normalizeLegalSourceHtml,
} from "../legal/source-parser";
import { chunkLegalProvision, parseLegalProvisions } from "./provision-parser";
import {
  discoverLexLanguageVariants,
  lexLanguageFamilyId,
  parseLexDocumentUrl,
  type LexDiscoveredDocument,
} from "./lex-discovery";
import {
  LEGAL_CORPUS_FEATURE_FLAGS,
  autoTrustLexSource,
  featureEnabled,
  type LegalCorpusFeatureFlag,
  type LegalCorpusLanguage,
} from "./trust";
import { diffCorpusProvisions, type CorpusProvisionSnapshot } from "./versioning";

const MAX_PROVISIONS_PER_VERSION = 8_000;
const MAX_CHUNKS_PER_VERSION = 16_000;
const WRITE_BATCH_SIZE = 90;

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
};

type StoredProvision = {
  articleNumber: string | null;
  title: string | null;
  text: string;
  sequence: number;
};

type IngestionJob = {
  id: string;
  sourceUrl: string;
  language: LegalCorpusLanguage;
  canonicalDocumentId: string;
  attemptCount: number;
  maxAttempts: number;
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

function sparseTerms(input: { text: string; articleNumber: string | null; title: string | null }): string {
  const weighted = [
    input.articleNumber ? `${input.articleNumber} `.repeat(8) : "",
    input.title ? `${input.title} `.repeat(4) : "",
    input.text,
  ].join(" ").toLocaleLowerCase("und").normalize("NFKC");
  const counts = new Map<string, number>();
  for (const token of weighted.match(/[\p{L}\p{N}][\p{L}\p{N}._-]{1,80}/gu) ?? []) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return JSON.stringify([...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 512));
}

function safeErrorCode(error: unknown): string {
  if (error instanceof LegalSourceFetchError || error instanceof LegalSourceParserError) {
    return error.code;
  }
  return "LEGAL_CORPUS_INGESTION_FAILED";
}

function retryable(error: unknown): boolean {
  return error instanceof LegalSourceFetchError && error.retryable;
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
      current_version.version_number AS currentVersionNumber
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

async function recordFailure(input: {
  db: D1Database;
  jobId?: string | null;
  documentId?: string | null;
  sourceUrl?: string | null;
  language?: LegalCorpusLanguage | null;
  now: string;
  errorCode: string;
  retryable: boolean;
  retryCount: number;
  retryState: "pending" | "retrying" | "terminal" | "technically_unavailable";
}): Promise<void> {
  await input.db.prepare(`
    INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,safe_message,retryable,retry_count,retry_state)
    VALUES (?,?,?,?,?,?,NULL,?,?,?, ?,?)
  `).bind(
    crypto.randomUUID(), input.jobId ?? null, input.documentId ?? null,
    input.sourceUrl ?? null, input.language ?? null, input.now,
    input.errorCode.slice(0, 120), input.errorCode.slice(0, 400),
    input.retryable ? 1 : 0, input.retryCount, input.retryState,
  ).run();
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
  const parsed = parseLexDocumentUrl(input.sourceUrl);
  if (!parsed) throw new TypeError("LEGAL_CORPUS_OFFICIAL_URL_REJECTED");
  autoTrustLexSource({ officialUrl: parsed.sourceUrl });

  const fetched = await fetchLegalSource(parsed.sourceUrl, {
    adviceEnabled: false,
    now: () => input.now ?? new Date(),
    wait: input.wait,
    fetchImpl: input.fetchImpl,
  });
  const sourceUrl = fetched.canonicalUrl;
  const sourceHash = fetched.contentSha256;
  const rawHtml = new TextDecoder("utf-8", { fatal: true }).decode(fetched.bytes);
  const languageVariants = discoverLexLanguageVariants(rawHtml, parsed);
  const documentId = await linkedDocumentId(env.DB, languageVariants)
    ?? lexLanguageFamilyId(languageVariants);
  const normalized = normalizeLegalSourceHtml({
    html: rawHtml,
    reference: {
      sourceKind: "lex",
      locale: languageToLegacyLocale(parsed.language),
      canonicalId: parsed.canonicalDocumentId,
      canonicalUrl: sourceUrl,
    },
    rawContentSha256: sourceHash,
  });
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
  const current = await existingVariant(env.DB, documentId, parsed.language);
  if (current?.currentHash === sourceHash) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE legal_corpus_variants
        SET source_url=?,last_verified_at=?,updated_at=? WHERE id=?`).bind(sourceUrl, now, now, current.variantId),
      env.DB.prepare(`UPDATE legal_corpus_documents SET updated_at=? WHERE id=?`).bind(now, current.documentId),
    ]);
    await persistLanguageAliasesAndQueue({
      env, documentId: current.documentId, variants: languageVariants,
      currentSourceUrl: sourceUrl, now: input.now ?? new Date(),
    });
    return {
      status: "unchanged", documentId: current.documentId, variantId: current.variantId,
      versionId: current.currentVersionId, provisionCount: 0, chunkCount: 0, sourceUrl,
    };
  }

  const previous = await currentProvisions(env.DB, current?.currentVersionId ?? null);
  const diff = diffCorpusProvisions(previous, provisions);
  if (diff.suspiciousShrink) {
    await recordFailure({
      db: env.DB, documentId, sourceUrl,
      language: parsed.language, now, errorCode: "LEGAL_CORPUS_SUSPICIOUS_CHANGE",
      retryable: false, retryCount: 0, retryState: "terminal",
    });
    return {
      status: "halted_suspicious_change", documentId,
      variantId: current?.variantId ?? `${documentId}:${parsed.language}`,
      versionId: null, provisionCount: 0, chunkCount: 0, sourceUrl,
    };
  }

  const stem = objectStem(parsed.canonicalDocumentId, parsed.language, sourceHash);
  const rawObjectKey = `${stem}/raw.html`;
  const normalizedObjectKey = `${stem}/normalized.json`;
  const normalizedJson = JSON.stringify(normalized);
  await env.BUCKET.put(rawObjectKey, fetched.bytes, {
    httpMetadata: { contentType: fetched.contentType },
    customMetadata: { sourceSha256: sourceHash, sourceUrl },
  });
  await env.BUCKET.put(normalizedObjectKey, normalizedJson, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { sourceSha256: sourceHash, sourceUrl },
  });

  const variantId = current?.variantId ?? `${documentId}:${parsed.language}`;
  const versionNumber = (current?.currentVersionNumber ?? 0) + 1;
  const versionId = `${variantId}:v${versionNumber}:${sourceHash.slice(0, 12)}`;
  const changeType = previous.length === 0
    ? "new"
    : diff.changes.some((change) => change.change === "modified" || change.change === "renumbered")
      ? "modified"
      : "metadata_changed";

  const header = [
    env.DB.prepare(`INSERT INTO legal_corpus_documents
      (id,provider,jurisdiction,source_class,scope,tenant_id,owner_user_id,matter_id,visibility,canonical_url,title,short_title,document_type,document_number,adopting_authority,adoption_date,publication_date,availability_status,trusted,verification_status,approval_required,created_at,updated_at)
      VALUES (?,?,?,?,? ,NULL,NULL,NULL,?,?,?,?,?,NULL,NULL,NULL,NULL,'ready',1,'official_source',0,?,?)
      ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
    `).bind(
      documentId, "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global",
      sourceUrl, normalized.documentTitle, normalized.documentTitle.slice(0, 240),
      "legal_act", now, now,
    ),
    env.DB.prepare(`INSERT INTO legal_corpus_variants
      (id,document_id,language,is_official_language_version,translation_type,source_url,last_verified_at,current_version_id,created_at,updated_at)
      VALUES (?,?,?,1,NULL,?,?,NULL,?,?)
      ON CONFLICT(document_id,language,is_official_language_version) DO UPDATE SET source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,updated_at=excluded.updated_at
    `).bind(variantId, documentId, parsed.language, sourceUrl, now, now, now),
    // The current pointer is intentionally updated only after all immutable
    // provision rows exist, so a retry can safely resume a partial write.
    env.DB.prepare(`INSERT INTO legal_corpus_versions
      (id,variant_id,previous_version_id,version_number,status,valid_from,valid_to,version_date,content_sha256,raw_object_key,normalized_object_key,source_url,fetched_at,change_type,created_at)
      VALUES (?,?,?,?, 'active',NULL,NULL,?,?,?,?,?,?,?,?)
      ON CONFLICT(variant_id,content_sha256) DO NOTHING
    `).bind(
      versionId, variantId, current?.currentVersionId ?? null, versionNumber,
      dateOnly(fetched.fetchedAt), sourceHash, rawObjectKey, normalizedObjectKey,
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
      VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,?, 'active',NULL,NULL,?,?,?)
      ON CONFLICT(version_id,article_number_normalized,sequence) DO NOTHING
    `).bind(
      provisionId, documentId, variantId, versionId, provision.articleNumber,
      provision.articleNumberNormalized, provision.title, provision.sequence,
      provision.text, provision.text, parsed.language, sourceUrl, provisionHash, now,
    ));
  }
  for (const chunk of chunks) {
    const provisionId = `${versionId}:p${chunk.provision.sequence}`;
    provisionStatements.push(env.DB.prepare(`INSERT INTO legal_corpus_chunks
      (id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,dense_vector_id,sparse_terms_json,indexed_at,created_at)
      VALUES (?,?,?,?,?,?,?,NULL,?,?,?)
      ON CONFLICT(provision_id,chunk_index) DO NOTHING
    `).bind(
      `${provisionId}:c${chunk.chunkIndex}`, provisionId, versionId, chunk.chunkIndex,
      chunk.totalChunks, chunk.text, await sha256(chunk.text),
      sparseTerms({ text: chunk.text, articleNumber: chunk.provision.articleNumber, title: chunk.provision.title }),
      now, now,
    ));
    // FTS5 has no unique constraint. Delete-then-insert makes a replay after
    // a transient D1 batch failure idempotent without mutating legal content.
    provisionStatements.push(env.DB.prepare(
      "DELETE FROM legal_corpus_search WHERE chunk_id=?",
    ).bind(`${provisionId}:c${chunk.chunkIndex}`));
    provisionStatements.push(env.DB.prepare(`INSERT INTO legal_corpus_search
      (chunk_id,version_id,document_id,language,article_number,title,content)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      `${provisionId}:c${chunk.chunkIndex}`, versionId, documentId, parsed.language,
      chunk.provision.articleNumber, chunk.provision.title ?? "", chunk.text,
    ));
  }
  await runBatches(env.DB, provisionStatements);
  await env.DB.prepare(`UPDATE legal_corpus_variants
    SET current_version_id=?,source_url=?,last_verified_at=?,updated_at=? WHERE id=?
  `).bind(versionId, sourceUrl, now, now, variantId).run();

  await persistLanguageAliasesAndQueue({
    env, documentId, variants: languageVariants,
    currentSourceUrl: sourceUrl, now: input.now ?? new Date(),
  });

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

/** Runs one job per invocation: Lex.uz crawl delay and the D1 job claim form
 * the distributed backpressure mechanism. */
export async function runNextLegalCorpusIngestionJob(
  env: LegalCorpusIngestionEnv,
  input: { now?: Date; wait?: (delayMs: number) => Promise<void>; fetchImpl?: FetchLike } = {},
): Promise<LegalCorpusJobRunResult> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { claimed: false, status: "disabled", jobId: null, safeErrorCode: null };
  }
  const nowDate = input.now ?? new Date();
  const now = nowIso(nowDate);
  const candidate = await env.DB.prepare(`SELECT id,source_url AS sourceUrl,language,canonical_document_id AS canonicalDocumentId,attempt_count AS attemptCount,max_attempts AS maxAttempts
    FROM legal_corpus_ingestion_jobs
    WHERE status IN ('queued','retrying') AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY created_at ASC LIMIT 1
  `).bind(now).first<IngestionJob>();
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
    const shouldRetry = retryable(error) && attempt < candidate.maxAttempts;
    await recordFailure({
      db: env.DB, jobId: candidate.id, documentId: candidate.canonicalDocumentId,
      sourceUrl: candidate.sourceUrl, language: candidate.language, now, errorCode,
      retryable: shouldRetry, retryCount: attempt,
      retryState: shouldRetry ? "retrying" : "terminal",
    });
    await env.DB.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status=?,next_attempt_at=?,last_error_code=?,updated_at=? WHERE id=?
    `).bind(shouldRetry ? "retrying" : "dead_letter", shouldRetry ? retryAt(nowDate, attempt) : null, errorCode, now, candidate.id).run();
    return {
      claimed: true,
      status: shouldRetry ? "retrying" : "failed",
      jobId: candidate.id,
      safeErrorCode: errorCode,
    };
  }
}

export { LEGAL_CORPUS_FEATURE_FLAGS };
