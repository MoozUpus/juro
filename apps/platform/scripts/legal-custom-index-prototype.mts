import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { buildCustomBm25Artifacts, queryCustomBm25 } from "../lib/legal-corpus/custom-bm25";
import {
  buildRetrievalChunks,
  putImmutableCustomArtifact,
  type CustomRetrievalChunk,
} from "../lib/legal-corpus/custom-hybrid-index";

type SourceRow = {
  id: string;
  language: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  articleNumber: string | null;
  articleTitle: string | null;
  part: string | null;
  chapter: string | null;
  section: string | null;
  text: string;
  title: string;
  documentType: string | null;
  validFrom: string;
  validTo: string | null;
  status: "active" | "historical";
};

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const databaseId = process.env.LEGAL_PROTOTYPE_SOURCE_DATABASE_ID;
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
if (!accountId || !apiToken || !databaseId || !outputArgument) {
  throw new Error("LEGAL_PROTOTYPE_CONFIGURATION_REQUIRED");
}
if (accountId !== "e22babd36b65c99b69adf3de50df5227") {
  throw new Error("LEGAL_PROTOTYPE_ACCOUNT_PIN_MISMATCH");
}
const outputPath = resolve(outputArgument.slice("--output=".length));

async function d1Rows(
  status: SourceRow["status"],
  language: SourceRow["language"],
): Promise<SourceRow[]> {
  const sql = `SELECT p.id,p.language,p.article_number AS articleNumber,
    p.article_title AS articleTitle,p.part,p.chapter,p.section,p.text,
    d.title,d.document_type AS documentType,v.valid_from AS validFrom,
    v.valid_to AS validTo,v.status
    FROM legal_corpus_provisions p
    JOIN legal_corpus_versions v ON v.id=p.version_id
    JOIN legal_corpus_documents d ON d.id=p.document_id
    WHERE v.status=? AND p.language=? AND v.valid_from IS NOT NULL
      AND (?<>'historical' OR v.valid_to IS NOT NULL)
    ORDER BY p.id LIMIT 32`;
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ sql, params: [status, language, status] }),
    },
  );
  const body = await response.json() as {
    success: boolean;
    errors?: unknown;
    result?: Array<{ results?: SourceRow[] }>;
  };
  if (!response.ok || !body.success) throw new Error("LEGAL_PROTOTYPE_D1_QUERY_FAILED");
  const rows = body.result?.[0]?.results ?? [];
  return rows;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function percentile(values: readonly number[], percentage: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * percentage) - 1)] ?? 0;
}

class MemoryR2 {
  readonly objects = new Map<string, Uint8Array>();
  rangedReads = 0;
  bytesRead = 0;

  async head(key: string) {
    const bytes = this.objects.get(key);
    return bytes ? { key, size: bytes.byteLength } : null;
  }

  async put(key: string, bytes: Uint8Array, options?: { onlyIf?: { etagDoesNotMatch?: string } }) {
    if (options?.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    this.objects.set(key, bytes.slice());
    return { key, size: bytes.byteLength };
  }

  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const source = this.objects.get(key);
    if (!source) return null;
    const bytes = options?.range
      ? source.slice(options.range.offset, options.range.offset + options.range.length)
      : source.slice();
    if (options?.range) this.rangedReads += 1;
    this.bytesRead += bytes.byteLength;
    return { async arrayBuffer() { return bytes.slice().buffer; } };
  }
}

const languages = ["uz-Latn", "uz-Cyrl", "ru", "en"] as const;
const sourceRows = (await Promise.all(
  ["active", "historical"].flatMap((status) => languages.map((language) =>
    d1Rows(status as SourceRow["status"], language))),
)).flat();
if (["active", "historical"].some((status) =>
  sourceRows.filter((row) => row.status === status).length < 64)) {
  throw new Error("LEGAL_PROTOTYPE_TEMPORAL_SAMPLE_TOO_SMALL");
}
const policies = [512, 1_024, 2_048] as const;
const policyEvidence: Record<string, unknown> = {};
let selectedChunks: CustomRetrievalChunk[] = [];
for (const targetTokens of policies) {
  const chunks = (await Promise.all(sourceRows.map((row) => buildRetrievalChunks({
    snapshotProvisionId: `${row.status}:${row.id}`,
    sourceDocumentTitle: row.title,
    documentType: row.documentType ?? "unknown",
    articleNumber: row.articleNumber ?? "unknown",
    articleTitle: row.articleTitle,
    hierarchy: [row.part, row.chapter, row.section].filter((value): value is string => Boolean(value)),
    language: row.language,
    script: row.language === "uz-Cyrl" || row.language === "ru" ? "Cyrl" : "Latn",
    officialText: row.text,
    validFromEpoch: Math.floor(Date.parse(row.validFrom) / 1_000),
    validToEpoch: row.validTo ? Math.floor(Date.parse(row.validTo) / 1_000) : null,
  }, { targetTokens })))).flat();
  const tokens = chunks.map((chunk) => chunk.embeddingTokenCount);
  const currentChunks = chunks.filter((chunk) => chunk.snapshotProvisionId.startsWith("active:")).length;
  const historicalChunks = chunks.length - currentChunks;
  const sampleCurrent = sourceRows.filter((row) => row.status === "active").length;
  const sampleHistorical = sourceRows.length - sampleCurrent;
  const projectedTokens = tokens.reduce((sum, value) => sum + value, 0)
    / sourceRows.length * (160_978 + 1_295_149);
  policyEvidence[String(targetTokens)] = {
    sampleChunks: chunks.length,
    currentChunks,
    historicalChunks,
    sampleCurrentProvisions: sampleCurrent,
    sampleHistoricalProvisions: sampleHistorical,
    maximumEmbeddingTokens: Math.max(...tokens),
    meanEmbeddingTokensPerProvision: tokens.reduce((sum, value) => sum + value, 0) / sourceRows.length,
    projectedEmbeddingTokens: Math.round(projectedTokens),
    projectedEmbeddingCostUsdAt013PerMillion: Number((projectedTokens / 1_000_000 * 0.13).toFixed(2)),
    adjacencyConcatenationVerified: chunks.every((chunk, index) =>
      index === 0
      || chunk.snapshotProvisionId !== chunks[index - 1]!.snapshotProvisionId
      || chunk.ordinal === chunks[index - 1]!.ordinal + 1),
    inventorySha256: sha256(JSON.stringify(chunks.map((chunk) => ({
      id: chunk.id,
      parent: chunk.snapshotProvisionId,
      ordinal: chunk.ordinal,
      textSha256: chunk.officialTextSha256,
      embeddingTokens: chunk.embeddingTokenCount,
    })))),
  };
  if (targetTokens === 512) selectedChunks = chunks;
}

const bm25Input = selectedChunks.map((chunk) => ({
  segmentId: chunk.snapshotProvisionId.startsWith("active:") ? "base-current" : "delta-history",
  itemKey: chunk.id,
  language: chunk.language,
  documentType: chunk.documentType,
  validFromEpoch: chunk.validFromEpoch,
  validToEpoch: chunk.validToEpoch,
  fields: {
    title: chunk.sourceDocumentTitle,
    hierarchy: chunk.hierarchy.join(" "),
    article: [chunk.articleNumber, chunk.articleTitle].filter(Boolean).join(" "),
    text: chunk.officialText,
  },
}));
const buildStarted = performance.now();
const bm25 = await buildCustomBm25Artifacts(bm25Input, { analyzer: "word-v1" });
const buildMs = performance.now() - buildStarted;
const bucket = new MemoryR2();
for (const stored of bm25.artifacts) {
  await putImmutableCustomArtifact(bucket as unknown as R2Bucket, stored.key, stored.bytes, {
    contentType: "application/octet-stream",
  });
}
const queryTexts = sourceRows.slice(0, 25).map((row) =>
  (row.articleTitle ?? row.title).split(/\s+/u).slice(0, 4).join(" "));
const latencies: number[] = [];
for (let iteration = 0; iteration < 100; iteration += 1) {
  const started = performance.now();
  await queryCustomBm25(bucket as unknown as R2Bucket, bm25.manifest, {
    text: queryTexts[iteration % queryTexts.length]!,
    atEpoch: 1_893_456_000,
    topK: 50,
  });
  latencies.push(performance.now() - started);
}

function firstLongTerm(value: string): string | null {
  return value.normalize("NFKC").toLocaleLowerCase("und")
    .match(/[\p{L}\p{N}]{7,}/gu)?.[0] ?? null;
}

function typo(value: string): string {
  const points = [...value];
  points[points.length - 1] = points.at(-1) === "x" ? "q" : "x";
  return points.join("");
}

const challengerCases = sourceRows.flatMap((row) => {
  const term = firstLongTerm(row.articleTitle ?? row.title);
  const expected = selectedChunks.find((chunk) =>
    chunk.snapshotProvisionId === `${row.status}:${row.id}`)?.id;
  return term && expected ? [{
    query: typo(term),
    querySha256: sha256(typo(term)),
    expected,
    language: row.language,
    atEpoch: Math.floor(Date.parse(row.validFrom) / 1_000),
  }] : [];
}).slice(0, 48);
const characterBuildStarted = performance.now();
const characterBm25 = await buildCustomBm25Artifacts(bm25Input, {
  analyzer: "character-trigram-v1",
});
const characterBuildMs = performance.now() - characterBuildStarted;
const characterBucket = new MemoryR2();
for (const stored of characterBm25.artifacts) {
  await putImmutableCustomArtifact(
    characterBucket as unknown as R2Bucket,
    stored.key,
    stored.bytes,
    { contentType: "application/octet-stream" },
  );
}
let wordRecovered = 0;
let characterRecovered = 0;
const characterLatencies: number[] = [];
for (const challenger of challengerCases) {
  const wordHits = await queryCustomBm25(bucket as unknown as R2Bucket, bm25.manifest, {
    text: challenger.query,
    language: challenger.language,
    atEpoch: challenger.atEpoch,
    topK: 50,
  });
  const started = performance.now();
  const characterHits = await queryCustomBm25(
    characterBucket as unknown as R2Bucket,
    characterBm25.manifest,
    {
      text: challenger.query,
      language: challenger.language,
      atEpoch: challenger.atEpoch,
      topK: 50,
    },
  );
  characterLatencies.push(performance.now() - started);
  if (wordHits.some((hit) => hit.itemKey === challenger.expected)) wordRecovered += 1;
  if (characterHits.some((hit) => hit.itemKey === challenger.expected)) characterRecovered += 1;
}

const currentDatabaseBytes = 2_335_174_656;
const currentRows = 165_852;
const projectedRows = 160_978 + 1_295_149 + 4_679;
const projectedSingleCatalogBytes = Math.ceil(currentDatabaseBytes / currentRows * projectedRows);
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  accountId,
  source: {
    databaseId,
    queryMode: "read-only-rest-api",
    sampleRows: sourceRows.length,
    currentRows: sourceRows.filter((row) => row.status === "active").length,
    historicalRows: sourceRows.filter((row) => row.status === "historical").length,
    languages: Object.fromEntries([...new Set(sourceRows.map((row) => row.language))].sort()
      .map((language) => [language, sourceRows.filter((row) => row.language === language).length])),
    temporalLanguages: Object.fromEntries(["active", "historical"].flatMap((status) =>
      languages.map((language) => [
        `${status}:${language}`,
        sourceRows.filter((row) => row.status === status && row.language === language).length,
      ]))),
    contentFreeInventorySha256: sha256(JSON.stringify(sourceRows.map((row) => ({
      id: row.id,
      status: row.status,
      language: row.language,
      contentSha256: sha256(row.text),
    })))),
  },
  chunkPolicies: policyEvidence,
  bm25: {
    analyzer: bm25.manifest.analyzer,
    documents: bm25.manifest.statistics.documentCount,
    segments: bm25.manifest.segments.length,
    artifactCount: bm25.artifacts.length,
    artifactBytes: bm25.artifacts.reduce((sum, value) => sum + value.sizeBytes, 0),
    manifestSha256: bm25.manifestArtifact.sha256,
    buildMs: Number(buildMs.toFixed(3)),
    queryRuntime: "node-memory-r2-contract-not-remote-r2",
    queryCount: latencies.length,
    p50Ms: Number(percentile(latencies, 0.5).toFixed(3)),
    p95Ms: Number(percentile(latencies, 0.95).toFixed(3)),
    maximumMs: Number(Math.max(...latencies).toFixed(3)),
    rangedReads: bucket.rangedReads,
    bytesRead: bucket.bytesRead,
    qualifiesRemoteLatencyGate: false,
  },
  characterTrigramChallenger: {
    developmentSetKind: "deterministic-single-codepoint-typo-from-official-title",
    caseCount: challengerCases.length,
    caseInventorySha256: sha256(JSON.stringify(challengerCases.map((value) => ({
      querySha256: value.querySha256,
      expected: value.expected,
      language: value.language,
    })))),
    wordRecallAt50: challengerCases.length === 0 ? 0 : wordRecovered / challengerCases.length,
    characterRecallAt50: challengerCases.length === 0 ? 0 : characterRecovered / challengerCases.length,
    buildMs: Number(characterBuildMs.toFixed(3)),
    artifactCount: characterBm25.artifacts.length,
    artifactBytes: characterBm25.artifacts.reduce((sum, value) => sum + value.sizeBytes, 0),
    p95Ms: Number(percentile(characterLatencies, 0.95).toFixed(3)),
    rangedReads: characterBucket.rangedReads,
    bytesRead: characterBucket.bytesRead,
    activationDecision: "deferred-until-remote-latency-and-judged-language-strata",
  },
  legalCatalog: {
    currentRestoredDatabaseBytes: currentDatabaseBytes,
    currentRows,
    projectedRows,
    projectedSingleCatalogBytes,
    maximumAllowedBytes: 7_000_000_000,
    singleCatalogAllowed: projectedSingleCatalogBytes <= 7_000_000_000,
    conclusion: projectedSingleCatalogBytes <= 7_000_000_000
      ? "single-catalog-below-gate"
      : "sharding-required-before-history-build",
  },
  workerReducer: {
    sampleSortReduceMs: Number(buildMs.toFixed(3)),
    containerAuthorized: false,
    conclusion: "sample-only-worker-native-candidate; remote-constraint-proof-pending",
  },
  limitations: [
    "No OpenAI or Vectorize mutation was made by this evidence run.",
    "Node memory timings do not satisfy the remote warm/cold R2 latency gate.",
    "The historical source rows are representative legacy rows, not a completed target migration.",
    "The character n-gram challenger still requires a separate judged development comparison.",
  ],
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
process.stdout.write(`${JSON.stringify({
  outputPath,
  reportSha256: sha256(JSON.stringify(report)),
  sampleRows: sourceRows.length,
  selectedChunks: selectedChunks.length,
  remoteMutation: false,
})}\n`);
