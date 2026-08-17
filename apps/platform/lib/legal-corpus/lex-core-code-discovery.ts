import { enqueueOfficialLexCorpusDocument, type LegalCorpusQueueEnv } from "./ingestion";
import { fetchLexCatalogPage } from "./lex-catalog-discovery";
import {
  discoverExactLexCoreCodeDocument,
  LEX_CORE_CODE_TARGETS,
  lexCoreCodeSearchUrl,
  type LexCoreCodeTarget,
} from "./lex-discovery";
import { featureEnabled, type LegalCorpusFeatureFlag } from "./trust";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type CoreCodeEnv = LegalCorpusQueueEnv & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

/** Already verified as stable identifier hints by JURO's direct-live Lex
 * provider. They contain no copied legal text and are still independently
 * fetched and validated before entering the corpus. */
const LEX_CORE_CODE_SEEDS = [
  { targetId: "family", sourceUrl: "https://lex.uz/ru/docs/104723" },
  { targetId: "civil", sourceUrl: "https://lex.uz/ru/docs/111189" },
  { targetId: "tax", sourceUrl: "https://lex.uz/ru/docs/4674902" },
  { targetId: "labor", sourceUrl: "https://lex.uz/ru/docs/6257291" },
] as const;

export const LEX_CORE_CODE_SEED_URLS = LEX_CORE_CODE_SEEDS.map((seed) => seed.sourceUrl);

export const LEX_CORE_CODE_SEED_IDS = LEX_CORE_CODE_SEED_URLS.map((url) =>
  `lexuz:${/\/docs\/(\d+)$/u.exec(url)?.[1] ?? "invalid"}`,
);

export type LexCoreCodeDiscoveryResult = {
  status: "disabled" | "all_settled" | "queued" | "not_found" | "failed";
  targetId: string | null;
  canonicalDocumentId: string | null;
  queued: boolean;
  safeErrorCode: string | null;
};

function titleKey(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function pickTarget(targets: readonly LexCoreCodeTarget[], now: Date): LexCoreCodeTarget {
  const slot = Math.floor(now.getTime() / (4 * 60_000));
  return targets[((slot % targets.length) + targets.length) % targets.length]!;
}

export async function seedLexCoreCodeJobs(
  env: CoreCodeEnv,
  input: { now?: Date } = {},
): Promise<{ considered: number; queued: number }> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { considered: 0, queued: 0 };
  }
  let queued = 0;
  for (const sourceUrl of LEX_CORE_CODE_SEED_URLS) {
    const result = await enqueueOfficialLexCorpusDocument(env, { sourceUrl, now: input.now });
    if (result.created) queued += 1;
  }
  return { considered: LEX_CORE_CODE_SEED_URLS.length, queued };
}

/**
 * Performs one paced, robots-checked title lookup per staging invocation.
 * The target rotates over unresolved codes, so a temporary Lex search failure
 * cannot starve the remaining codes and the generic catalogue resumes once
 * every exact title has been observed in the corpus.
 */
export async function runNextLexCoreCodeDiscovery(
  env: CoreCodeEnv,
  input: { now?: Date; wait?: (delayMs: number) => Promise<void>; fetchImpl?: FetchLike } = {},
): Promise<LexCoreCodeDiscoveryResult> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { status: "disabled", targetId: null, canonicalDocumentId: null, queued: false, safeErrorCode: null };
  }
  const present = await env.DB.prepare(`SELECT DISTINCT title,source_url AS sourceUrl FROM legal_corpus_variants
    WHERE is_official_language_version=1`).all<{ title: string | null; sourceUrl: string | null }>();
  const presentTitles = new Set(present.results.map((row) => row.title ? titleKey(row.title) : "").filter(Boolean));
  // Lex can keep the original Uzbek official document title in the reader
  // metadata even for a `/ru/` page. A verified seeded canonical URL is
  // therefore stronger evidence than a localized title string and prevents a
  // completed code from permanently blocking the next exact-title lookup.
  const presentSourceUrls = new Set(present.results.map((row) => row.sourceUrl));
  const settledSeedTargetIds = new Set<string>(LEX_CORE_CODE_SEEDS
    .filter((seed) => presentSourceUrls.has(seed.sourceUrl))
    .map((seed) => seed.targetId));
  const unresolved = LEX_CORE_CODE_TARGETS.filter((target) =>
    !presentTitles.has(titleKey(target.titleRu)) && !settledSeedTargetIds.has(target.id));
  if (unresolved.length === 0) {
    return { status: "all_settled", targetId: null, canonicalDocumentId: null, queued: false, safeErrorCode: null };
  }
  const now = input.now ?? new Date();
  const target = pickTarget(unresolved, now);
  try {
    const page = await fetchLexCatalogPage({
      searchUrl: lexCoreCodeSearchUrl(target),
      fetchImpl: input.fetchImpl,
      wait: input.wait,
    });
    const document = discoverExactLexCoreCodeDocument(page.html, target, lexCoreCodeSearchUrl(target));
    if (!document) {
      return { status: "not_found", targetId: target.id, canonicalDocumentId: null, queued: false, safeErrorCode: null };
    }
    const queued = await enqueueOfficialLexCorpusDocument(env, { sourceUrl: document.sourceUrl, now });
    return {
      status: "queued", targetId: target.id, canonicalDocumentId: queued.canonicalDocumentId,
      queued: queued.created, safeErrorCode: null,
    };
  } catch (error) {
    const safeErrorCode = error instanceof Error && /^LEX_CATALOG_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "LEX_CORE_CODE_DISCOVERY_FAILED";
    return { status: "failed", targetId: target.id, canonicalDocumentId: null, queued: false, safeErrorCode };
  }
}
