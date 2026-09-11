import {
  NPA_FUTURE_TARGETS,
  NPA_MASTER_TARGETS,
  npaAsOfDate,
  type NpaTarget,
} from "./npa-master-registry";
import { extractNpaCrossReferences } from "./npa-cross-references";

export type NpaRegistryStatus =
  | "active"
  | "future"
  | "repealed"
  | "partially_effective"
  | "transitional"
  | "manual_review";

export type NpaCandidateMetadata = Readonly<{
  title: string | null;
  actType: string | null;
  actNumber: string | null;
  adoptionDate: string | null;
}>;

export type NpaTemporalState = Readonly<{
  status: NpaRegistryStatus;
  ragEnabled: boolean;
  futureStatus: "scheduled_activation" | "scheduled_repeal" | "scheduled_replacement" | null;
}>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const AMENDMENT_TITLE = /(?:^|\s)(?:о\s+внесении|внесении\s+изменени|проект(?:е)?\s+(?:закона|постановления)|законопроект)(?:\s|$)/iu;

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/[«»"'`’“”()[\]{}.,:;!?/\\–—-]+/gu, " ")
    .replace(/\b(?:республики\s+узбекистан|узбекистана)\b/gu, " ")
    .replace(/^(?:закон|кодекс)\s+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizedNumber(value: string | null): string | null {
  if (!value) return null;
  return value.normalize("NFKC").toLocaleUpperCase("ru")
    .replace(/[\s№.]/gu, "")
    .replace(/[–—]/gu, "-")
    .replace(/^O['’]?R?Q/iu, "ЗРУ")
    || null;
}

function assertIsoDate(value: string | null, field: string): string | null {
  if (value === null) return null;
  if (!ISO_DATE.test(value)) throw new TypeError(`NPA_${field}_DATE_REJECTED`);
  return value;
}

function dayBefore(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function isConsolidatedNpaCandidate(title: string): boolean {
  return title.trim().length > 2 && !AMENDMENT_TITLE.test(title);
}

/** Exact target/alias match only; similar acts and amendment acts are rejected. */
export function targetAcceptsLexTitle(target: NpaTarget, title: string | null): boolean {
  if (!title || !isConsolidatedNpaCandidate(title)) return false;
  const candidate = normalized(title);
  return [target.titleRu, ...(target.titleAliases ?? [])]
    .some((expected) => normalized(expected) === candidate);
}

/**
 * A discovered URL is not a verified source until its title, type and date
 * fields are present.  The target number/date are search anchors, rather than
 * an authority to rewrite the LexUZ card: a later restatement can legitimately
 * present different historical details.  The LexUZ values are persisted as
 * the source of truth and discrepancies are reported separately for review.
 */
export function targetAcceptsLexMetadata(
  target: NpaTarget,
  metadata: NpaCandidateMetadata,
): boolean {
  if (!targetAcceptsLexTitle(target, metadata.title)) return false;
  return Boolean(metadata.actType && metadata.adoptionDate);
}

export function targetMetadataDiscrepancy(
  target: NpaTarget,
  metadata: NpaCandidateMetadata,
): string | null {
  const expectedNumber = normalizedNumber(target.expectedActNumber);
  const actualNumber = normalizedNumber(metadata.actNumber);
  const mismatches = [
    expectedNumber !== null && actualNumber !== expectedNumber ? "act_number" : null,
    metadata.adoptionDate !== target.expectedAdoptionDate ? "adoption_date" : null,
  ].filter((value): value is string => value !== null);
  return mismatches.length > 0 ? mismatches.join(",") : null;
}

/**
 * Applies the legal query date, not fetch time. `effectiveTo` is inclusive in
 * the read model because JURO's retrieval contract uses `>= query_date`.
 */
export function npaTemporalState(input: {
  asOfDate?: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceStatus?: "active" | "repealed" | "unknown";
  replacementScheduled?: boolean;
}): NpaTemporalState {
  const asOfDate = input.asOfDate ?? npaAsOfDate();
  assertIsoDate(asOfDate, "AS_OF");
  const effectiveFrom = assertIsoDate(input.effectiveFrom, "EFFECTIVE_FROM");
  const effectiveTo = assertIsoDate(input.effectiveTo, "EFFECTIVE_TO");
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
    throw new TypeError("NPA_EFFECTIVE_INTERVAL_REJECTED");
  }
  if (effectiveFrom && effectiveFrom > asOfDate) {
    return { status: "future", ragEnabled: false, futureStatus: "scheduled_activation" };
  }
  if ((effectiveTo && effectiveTo < asOfDate) || input.sourceStatus === "repealed") {
    return { status: "repealed", ragEnabled: false, futureStatus: null };
  }
  if (input.sourceStatus === "unknown" || !effectiveFrom) {
    return { status: "manual_review", ragEnabled: false, futureStatus: null };
  }
  return {
    status: "active",
    ragEnabled: true,
    futureStatus: input.replacementScheduled ? "scheduled_replacement" : null,
  };
}

export async function seedNpaMasterTargets(
  db: D1Database,
  now = new Date(),
): Promise<{ mandatory: number; future: number }> {
  const timestamp = now.toISOString();
  // The additional target catalog is deliberately deferred. The initial production
  // corpus is contractually the mandatory 100 plus a separately stored
  // future successor; staging has the same database check constraint.
  const allTargets = [
    ...NPA_MASTER_TARGETS.map((target) => ({ target, targetSet: "mandatory" as const })),
    ...NPA_FUTURE_TARGETS.map((target) => ({ target, targetSet: "future" as const })),
  ];
  const statements = allTargets.flatMap(({ target, targetSet }) => [
    db.prepare(`INSERT INTO npa_master_targets
      (document_key,target_set,priority,expected_title_ru,expected_title_aliases_json,
       expected_act_type,expected_act_number,expected_adoption_date,source_seed_url,
       successor_document_key,replaces_document_key,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(document_key) DO UPDATE SET
        expected_title_ru=excluded.expected_title_ru,
        expected_title_aliases_json=excluded.expected_title_aliases_json,
        expected_act_type=excluded.expected_act_type,
        expected_act_number=excluded.expected_act_number,
        expected_adoption_date=excluded.expected_adoption_date,
        source_seed_url=coalesce(npa_master_targets.source_seed_url,excluded.source_seed_url),
        successor_document_key=excluded.successor_document_key,
        replaces_document_key=excluded.replaces_document_key,
        updated_at=excluded.updated_at`).bind(
      target.documentKey, targetSet, "P0", target.titleRu,
      JSON.stringify(target.titleAliases ?? []), target.actType,
      target.expectedActNumber, target.expectedAdoptionDate,
      target.verifiedSourceSeed ?? null, target.successorDocumentKey ?? null,
      target.replacesDocumentKey ?? null, timestamp, timestamp,
    ),
    db.prepare(`INSERT INTO npa_discovery_state
      (document_key,status,candidate_source_url,candidate_lexuz_doc_id,attempt_count,
       next_attempt_at,last_error_code,page_number,next_event_target,view_state,
       view_state_generator,source_session_cookie,source_session_expires_at,last_checked_at,
       resolved_at,created_at,updated_at)
      VALUES (?, 'queued',NULL,NULL,0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,?)
      ON CONFLICT(document_key) DO NOTHING`).bind(target.documentKey, timestamp, timestamp),
  ]);
  await db.batch(statements);
  return { mandatory: NPA_MASTER_TARGETS.length, future: NPA_FUTURE_TARGETS.length };
}

export async function recordNpaManualReview(input: {
  db: D1Database;
  documentKey: string;
  reasonCode: "LEXUZ_CARD_NOT_FOUND" | "IDENTITY_MISMATCH" | "METADATA_INCOMPLETE"
    | "FUTURE_EFFECTIVE_DATE_UNCONFIRMED" | "LANGUAGE_LABEL_AMBIGUOUS" | "FULL_TEXT_UNAVAILABLE"
    | "STRUCTURAL_PARSE_FAILED" | "VERSION_INTERVAL_AMBIGUOUS";
  details: string;
  sourceReference?: string | null;
  runId?: string | null;
  now?: Date;
}): Promise<void> {
  const details = input.details.trim().slice(0, 1_500);
  if (details.length < 3) throw new TypeError("NPA_MANUAL_REVIEW_DETAILS_REJECTED");
  const sourceReference = input.sourceReference ?? null;
  if (sourceReference !== null && !/^https:\/\/lex\.uz\//u.test(sourceReference)) {
    throw new TypeError("NPA_MANUAL_REVIEW_SOURCE_REJECTED");
  }
  const now = (input.now ?? new Date()).toISOString();
  await input.db.batch([
    input.db.prepare(`INSERT INTO npa_manual_review_report
      (id,document_key,run_id,reason_code,details,source_reference,created_at,resolved_at)
      VALUES (?,?,?,?,?,?,?,NULL)`).bind(
      crypto.randomUUID(), input.documentKey, input.runId ?? null, input.reasonCode,
      details, sourceReference, now,
    ),
    input.db.prepare(`UPDATE npa_discovery_state SET status='manual_review',last_error_code=?,
      last_checked_at=?,updated_at=? WHERE document_key=?`).bind(input.reasonCode, now, now, input.documentKey),
  ]);
}

export type NpaCitation = Readonly<{
  act: string;
  article: string;
  part: string | null;
  versionAsOf: string;
  source: "LexUZ";
  sourceReference: string;
}>;

export function npaCitation(input: {
  title: string;
  article: string | null;
  part?: string | null;
  versionAsOf: string;
  sourceReference: string;
}): NpaCitation | null {
  if (!input.article || !ISO_DATE.test(input.versionAsOf)
    || !/^https:\/\/lex\.uz\//u.test(input.sourceReference)) return null;
  return {
    act: input.title,
    article: input.article,
    part: input.part ?? null,
    versionAsOf: input.versionAsOf,
    source: "LexUZ",
    sourceReference: input.sourceReference,
  };
}

/**
 * Attaches an already-stored immutable corpus version to a master target. It
 * is deliberately called after raw/normalized R2 persistence and provision
 * writes. A failed identity or temporal check records manual review and never
 * leaves an active RAG row behind.
 */
export async function recordNpaCorpusVersion(input: {
  db: D1Database;
  sourceUrl: string;
  lexuzDocId: string;
  legalCorpusDocumentId: string;
  legalCorpusVariantId: string;
  legalCorpusVersionId: string;
  language: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  title: string | null;
  metadata: NpaCandidateMetadata;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceStatus: "active" | "repealed" | "unknown";
  versionEffectiveFrom: string | null;
  versionEffectiveTo?: string | null;
  normativeChecksum: string;
  articleCount: number;
  chunkCount: number;
  isAsOfRevision: boolean;
  asOfDate?: string;
  now?: Date;
}): Promise<{ attached: boolean; status: NpaRegistryStatus | null }> {
  const candidate = await input.db.prepare(`SELECT document_key AS documentKey
    FROM npa_discovery_state WHERE candidate_source_url=? LIMIT 1`)
    .bind(input.sourceUrl.split("?", 1)[0] ?? input.sourceUrl)
    .first<{ documentKey: string }>();
  if (!candidate) return { attached: false, status: null };
  const target = [...NPA_MASTER_TARGETS, ...NPA_FUTURE_TARGETS]
    .find((entry) => entry.documentKey === candidate.documentKey);
  if (!target) throw new TypeError("NPA_TARGET_DEFINITION_MISSING");
  const metadata = { ...input.metadata, title: input.metadata.title ?? input.title };
  const existing = await input.db.prepare(`SELECT lexuz_doc_id AS lexuzDocId
    FROM npa_master_registry WHERE document_key=? LIMIT 1`)
    .bind(target.documentKey).first<{ lexuzDocId: string }>();
  const isVerifiedLanguageRecord = existing?.lexuzDocId === input.lexuzDocId;
  if (!isVerifiedLanguageRecord && !targetAcceptsLexMetadata(target, metadata)) {
    await recordNpaManualReview({
      db: input.db,
      documentKey: target.documentKey,
      reasonCode: metadata.title && isConsolidatedNpaCandidate(metadata.title)
        ? "IDENTITY_MISMATCH" : "METADATA_INCOMPLETE",
      details: "LexUZ card metadata did not meet the exact master-target identity contract.",
      sourceReference: input.sourceUrl.split("?", 1)[0] ?? input.sourceUrl,
      now: input.now,
    });
    return { attached: false, status: "manual_review" };
  }
  const targetDiscrepancy = targetMetadataDiscrepancy(target, metadata);
  if (input.language === "en") {
    await recordNpaManualReview({
      db: input.db, documentKey: target.documentKey, reasonCode: "LANGUAGE_LABEL_AMBIGUOUS",
      details: "The first production NPA corpus accepts only separately verified RU and Uzbek LexUZ records.",
      sourceReference: input.sourceUrl.split("?", 1)[0] ?? input.sourceUrl, now: input.now,
    });
    return { attached: false, status: "manual_review" };
  }
  const asOfDate = input.asOfDate ?? npaAsOfDate(input.now ?? new Date());
  if (!ISO_DATE.test(asOfDate)) throw new TypeError("NPA_AS_OF_DATE_REJECTED");
  // A current source may only activate if the discovery transaction has
  // explicitly retrieved its canonical ONDATE revision for this query date.
  // Future successors are retained but never enabled for current retrieval.
  const isFutureTarget = NPA_FUTURE_TARGETS.some((entry) => entry.documentKey === target.documentKey);
  if (!input.isAsOfRevision && !isFutureTarget) {
    return { attached: false, status: null };
  }
  const versionEffectiveFrom = input.versionEffectiveFrom;
  if (!versionEffectiveFrom || !ISO_DATE.test(versionEffectiveFrom)) {
    await recordNpaManualReview({
      db: input.db, documentKey: target.documentKey, reasonCode: "VERSION_INTERVAL_AMBIGUOUS",
      details: "LexUZ did not expose a determinate effective-from date for the retrieved version.",
      sourceReference: input.sourceUrl.split("?", 1)[0] ?? input.sourceUrl, now: input.now,
    });
    return { attached: false, status: "manual_review" };
  }
  const successor = target.successorDocumentKey
    ? await input.db.prepare(`SELECT effective_from AS effectiveFrom
      FROM npa_master_registry WHERE document_key=? LIMIT 1`)
      .bind(target.successorDocumentKey).first<{ effectiveFrom: string | null }>()
    : null;
  const successorEffectiveTo = successor?.effectiveFrom && ISO_DATE.test(successor.effectiveFrom)
    ? dayBefore(successor.effectiveFrom) : null;
  const effectiveTo = [input.effectiveTo, successorEffectiveTo]
    .filter((value): value is string => value !== null)
    .sort()[0] ?? null;
  const versionEffectiveTo = input.versionEffectiveTo ?? effectiveTo;
  const replacementScheduled = Boolean(target.successorDocumentKey);
  const temporal = npaTemporalState({
    asOfDate,
    effectiveFrom: input.effectiveFrom,
    effectiveTo,
    sourceStatus: input.sourceStatus,
    replacementScheduled,
  });
  const sourceReference = input.sourceUrl.split("?", 1)[0] ?? input.sourceUrl;
  const now = (input.now ?? new Date()).toISOString();
  const versionId = `npa:${target.documentKey}:${input.language}:${versionEffectiveFrom}:${input.normativeChecksum.slice(0, 16)}`;
  await input.db.batch([
    input.db.prepare(`INSERT INTO npa_master_registry
      (document_key,lexuz_doc_id,legal_corpus_document_id,title_ru,title_uz,short_title,
       act_type,act_number,adoption_date,publication_date,effective_from,effective_to,status,
       future_status,successor_document_key,replaces_document_key,source,source_reference,
       content_checksum,last_checked_at,article_count,chunk_count,rag_enabled,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'LexUZ',?,?,?,?,?,?,?,?)
      ON CONFLICT(document_key) DO UPDATE SET
        lexuz_doc_id=excluded.lexuz_doc_id,legal_corpus_document_id=excluded.legal_corpus_document_id,
        title_ru=coalesce(excluded.title_ru,npa_master_registry.title_ru),
        title_uz=coalesce(excluded.title_uz,npa_master_registry.title_uz),
        short_title=excluded.short_title,act_type=excluded.act_type,act_number=excluded.act_number,
        adoption_date=excluded.adoption_date,effective_from=excluded.effective_from,effective_to=excluded.effective_to,
        status=excluded.status,future_status=excluded.future_status,
        successor_document_key=excluded.successor_document_key,replaces_document_key=excluded.replaces_document_key,
        source_reference=excluded.source_reference,content_checksum=excluded.content_checksum,
        last_checked_at=excluded.last_checked_at,article_count=excluded.article_count,chunk_count=excluded.chunk_count,
        rag_enabled=excluded.rag_enabled,updated_at=excluded.updated_at`).bind(
      target.documentKey, input.lexuzDocId, input.legalCorpusDocumentId,
      input.language === "ru" ? metadata.title : null,
      input.language === "ru" ? null : metadata.title,
      target.shortTitle, metadata.actType, metadata.actNumber, metadata.adoptionDate,
      null, input.effectiveFrom, effectiveTo, temporal.status, temporal.futureStatus,
      target.successorDocumentKey ?? null, target.replacesDocumentKey ?? null,
      sourceReference, input.normativeChecksum, now, input.articleCount, input.chunkCount,
      temporal.ragEnabled ? 1 : 0, now, now,
    ),
    input.db.prepare(`INSERT INTO npa_document_versions
      (id,document_key,language,legal_corpus_variant_id,legal_corpus_version_id,
       version_effective_from,version_effective_to,version_as_of,status,normative_checksum,
       editorial_metadata_object_key,amendment_history_object_key,source_metadata_object_key,
       last_checked_at,rag_enabled,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?)
      ON CONFLICT(document_key,language,version_effective_from,normative_checksum) DO UPDATE SET
        version_effective_to=excluded.version_effective_to,version_as_of=excluded.version_as_of,
        status=excluded.status,last_checked_at=excluded.last_checked_at,rag_enabled=excluded.rag_enabled`).bind(
      versionId, target.documentKey, input.language, input.legalCorpusVariantId,
      input.legalCorpusVersionId, versionEffectiveFrom, versionEffectiveTo,
      asOfDate, temporal.status, input.normativeChecksum, now,
      temporal.ragEnabled ? 1 : 0, now,
    ),
    // The base corpus keeps article/chapter/section columns. This NPA layer
    // makes the complete, citation-ready path explicit on every chunk without
    // duplicating normative text or embedding records.
    input.db.prepare(`INSERT INTO npa_chunk_metadata
      (chunk_id,npa_document_version_id,structural_path,parent_context,article,part,chapter,section,content_checksum,created_at)
      SELECT chunk.id,?,
        ? || coalesce(' > ' || provision.section,'') || coalesce(' > ' || provision.chapter,'')
          || coalesce(' > ' || provision.part,'') || coalesce(' > Статья ' || provision.article_number,''),
        ? || coalesce(' > Статья ' || provision.article_number,''),
        provision.article_number,provision.part,provision.chapter,provision.section,chunk.content_sha256,?
      FROM legal_corpus_chunks AS chunk
      INNER JOIN legal_corpus_provisions AS provision ON provision.id=chunk.provision_id
      WHERE provision.version_id=?
      ON CONFLICT DO NOTHING`).bind(
      versionId, target.shortTitle, target.shortTitle, now, input.legalCorpusVersionId,
    ),
    input.db.prepare(`INSERT INTO npa_language_records
      (document_key,language,source_reference,language_status,last_checked_at)
      VALUES (?,?,?,?,?) ON CONFLICT(document_key,language) DO UPDATE SET
        source_reference=excluded.source_reference,language_status=excluded.language_status,
        last_checked_at=excluded.last_checked_at`).bind(
      // A LexUZ locale is an official database representation, but its page
      // does not by itself label a translation as legally official. Preserve
      // that distinction for the answer layer instead of over-claiming it.
      target.documentKey, input.language, sourceReference, "source_label_unverified", now,
    ),
    input.db.prepare(`UPDATE npa_discovery_state SET status=?,last_checked_at=?,resolved_at=?,
      last_error_code=NULL,updated_at=? WHERE document_key=?`).bind(
      temporal.status === "active" ? "verified" : temporal.status, now, now, now, target.documentKey,
    ),
  ]);
  const sourceProvisions = await input.db.prepare(`SELECT id,article_number AS articleNumber,text
    FROM legal_corpus_provisions WHERE version_id=? ORDER BY sequence`).bind(input.legalCorpusVersionId)
    .all<{ id: string; articleNumber: string | null; text: string }>();
  const crossReferenceStatements = sourceProvisions.results.flatMap((provision) =>
    extractNpaCrossReferences({ text: provision.text, sourceDocumentKey: target.documentKey })
      .map((reference) => input.db.prepare(`INSERT INTO npa_cross_references
        (id,source_document_key,source_version_id,source_provision_id,source_article,relation_type,
         target_document_key,target_article,raw_reference,resolution_status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(source_version_id,source_provision_id,raw_reference) DO NOTHING`).bind(
        crypto.randomUUID(), target.documentKey, versionId, provision.id, provision.articleNumber,
        reference.relationType, reference.targetDocumentKey, reference.targetArticle,
        reference.rawReference, reference.resolutionStatus, now,
      ))
  );
  for (let offset = 0; offset < crossReferenceStatements.length; offset += 100) {
    await input.db.batch(crossReferenceStatements.slice(offset, offset + 100));
  }
  if (target.replacesDocumentKey && input.effectiveFrom && ISO_DATE.test(input.effectiveFrom)) {
    const replacementEnd = dayBefore(input.effectiveFrom);
    await input.db.batch([
      input.db.prepare(`UPDATE npa_master_registry SET effective_to=?,updated_at=?
        WHERE document_key=? AND (effective_to IS NULL OR effective_to>?)`).bind(
        replacementEnd, now, target.replacesDocumentKey, replacementEnd,
      ),
      input.db.prepare(`UPDATE npa_document_versions SET version_effective_to=?,last_checked_at=?
        WHERE document_key=? AND (version_effective_to IS NULL OR version_effective_to>?)`).bind(
        replacementEnd, now, target.replacesDocumentKey, replacementEnd,
      ),
    ]);
  }
  if (targetDiscrepancy) {
    await input.db.prepare(`INSERT INTO npa_manual_review_report
      (id,document_key,run_id,reason_code,details,source_reference,created_at,resolved_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), target.documentKey, null, "IDENTITY_MISMATCH",
      `LexUZ canonical card differs from the historical target hint in: ${targetDiscrepancy}. LexUZ metadata was retained as source of truth.`,
      sourceReference, now, now,
    ).run();
  }
  return { attached: true, status: temporal.status };
}
