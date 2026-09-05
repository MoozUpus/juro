import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  TICKET29_FINALIZATION_COUNTS_SQL,
  TICKET29_DISTINCT_BODY_COUNT_SQL,
  TICKET29_SOURCE_PAGE_SIZE,
  TICKET29_MATERIALIZATION_PAGE_SIZE,
  buildBodyFreeMaterializationRecord,
  immutableEvidencePut,
  reconstructMaterializedCorpus,
  runTicket29MaterializationPage,
  ticket29AccountingTotalsMatch,
  ticket29ControlReplayMatches,
  ticket29LifecycleDisposition,
  ticket29LegacyTargetRenditionId,
  ticket29EvidenceKey,
  ticket29FinalObjectSummary,
  ticket29ManifestRoot,
  ticket29PlanSourcePageInParallel,
  ticket29WritePlanPagesInParallel,
  ticket29QueueMessageSchema,
  ticket29Sha256,
  ticket29StageDecision,
  ticket29TargetPublisherRevisionToken,
  type Ticket29BodyFreeRecord,
  type Ticket29EvidenceDescriptor,
  type Ticket29RetainedLocator,
} from "../lib/legal-corpus/complete-corpus-materialization";
import { assertTicket29DistinctArtifactPaths } from "../scripts/ticket29-isolated-artifact-paths";
import { countTicket29IdentityMismatches } from "../scripts/ticket29-isolated-identity";
import { countTicket29OrphanObjects } from "../scripts/ticket29-isolated-object-reconciliation";
import {
  buildTicket29ReconstructionLaneProofs,
  ticket29ReconstructionLaneReportMatches,
} from "../scripts/ticket29-isolated-reconstruction-reports";
import { reconstructTicket28Roots } from "../scripts/ticket29-isolated-ticket28-roots";
import { stableSourceSnapshotJson } from "../lib/legal-corpus/source-snapshot";

const testSha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const testManifestRoot = (rows: readonly Record<string, unknown>[]) => {
  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(stableSourceSnapshotJson(row));
    hash.update("\n");
  }
  return hash.digest("hex");
};

test("Ticket 29 retained-current identity matches Ticket 28's target natural key", async () => {
  assert.equal(await ticket29LegacyTargetRenditionId({
    publisherDocumentToken: "lexuz-family:42",
    language: "uz-Latn",
    script: "Latn",
    textualAuthority: "unknown",
    publisherProvisionToken: "article:7:sequence:3",
    sourceRevisionSha256: "a".repeat(64),
  }), "rendition:d4088b391910f63437d03ec76e35bce7f7a71babb23dcd6820a5da72272fb88d");
});

test("Ticket 29 isolated identity proof reads the source-version token owner", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE legal_complete_corpus_records (
    run_id TEXT, source_id TEXT, source_document_id TEXT, source_version_id TEXT,
    source_revision_sha256 TEXT, language TEXT, script TEXT, textual_authority TEXT,
    valid_from TEXT, valid_to TEXT, instrument_id TEXT, official_expression_id TEXT,
    text_revision_id TEXT, provision_concept_id TEXT, provision_rendition_id TEXT,
    legacy_current_rendition_id TEXT, publisher_revision_token TEXT,
    legacy_target_publisher_revision_token TEXT, source_publisher_revision_token TEXT,
    publisher_provision_token TEXT, applicability_identity TEXT)`);
  const sourceId = "source:test";
  const documentId = "document:test";
  const sourceVersionId = "version:test";
  const sourceRevisionSha256 = "a".repeat(64);
  const language = "uz-Latn";
  const script = "Latn";
  const textualAuthority = "unknown";
  const publisherProvisionToken = "article:1";
  const applicabilityIdentity = "gap/";
  const publisherRevisionToken = JSON.stringify({
    sourceVersionId,
    versionDate: null,
    versionNumber: 1,
  });
  const instrumentId = `instrument:${testSha256(documentId)}`;
  const officialExpressionId = `expression:${testSha256(
    `${instrumentId}\u0000${language}\u0000${script}\u0000${textualAuthority}`,
  )}`;
  const textRevisionId = `revision:${testSha256([
    documentId,
    language,
    script,
    textualAuthority,
    publisherRevisionToken,
  ].join("|"))}`;
  const provisionConceptId = `concept:${testSha256(`source-provision:${sourceId}`)}`;
  const provisionRenditionId = `rendition:${testSha256([
    documentId,
    provisionConceptId,
    publisherProvisionToken,
    textRevisionId,
    language,
    script,
    textualAuthority,
    applicabilityIdentity,
  ].join("|"))}`;
  const legacyRevisionId = `revision:${testSha256(
    `${officialExpressionId}\u0000${sourceRevisionSha256}`,
  )}`;
  const legacyProvisionConceptId = `concept:${testSha256(
    `${instrumentId}\u0000${publisherProvisionToken}`,
  )}`;
  const legacyCurrentRenditionId = `rendition:${testSha256(
    `${legacyProvisionConceptId}\u0000${legacyRevisionId}`,
  )}`;
  database.prepare(`INSERT INTO legal_complete_corpus_records VALUES (
    ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "run", sourceId, documentId, sourceVersionId, sourceRevisionSha256,
    language, script, textualAuthority, null, null, instrumentId,
    officialExpressionId, textRevisionId, provisionConceptId, provisionRenditionId,
    legacyCurrentRenditionId, publisherRevisionToken, `1:${sourceRevisionSha256}`,
    publisherRevisionToken, publisherProvisionToken, applicabilityIdentity,
  );
  assert.equal(countTicket29IdentityMismatches(database, "run"), 0);
  database.close();
});

test("Ticket 29 isolated object reconciliation finds orphans with set-based references", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE legal_complete_corpus_objects (
      run_id TEXT, object_kind TEXT, r2_key TEXT);
    CREATE TABLE legal_complete_corpus_records (
      run_id TEXT, raw_object_r2_key TEXT, normalized_object_r2_key TEXT,
      provision_object_r2_key TEXT);
    CREATE TABLE legal_complete_corpus_quarantines (
      run_id TEXT, raw_object_r2_key TEXT, normalized_object_r2_key TEXT);
    CREATE TABLE legal_complete_corpus_pages (run_id TEXT, plan_r2_key TEXT);
    CREATE TABLE legal_complete_corpus_lane_reports (
      run_id TEXT, report_kind TEXT, r2_key TEXT);
    CREATE TABLE legal_complete_corpus_runs (
      id TEXT, plan_r2_key TEXT, final_reconstruction_r2_key TEXT);
    CREATE TABLE legal_complete_corpus_snapshots (run_id TEXT, r2_key TEXT)`);
  const runId = "ticket29:test";
  const referenced = [
    ["raw_capture", "raw:record"],
    ["normalized_revision", "normalized:record"],
    ["provision_rendition", "provision:record"],
    ["raw_capture", "raw:quarantine"],
    ["normalized_revision", "normalized:quarantine"],
    ["plan", "plan:page"],
    ["plan", "plan:lane"],
    ["plan", "plan:run"],
    ["manifest", "manifest:always-registered"],
    ["reconstruction", "reconstruction:lane"],
    ["reconstruction", "reconstruction:run"],
    ["corpus_snapshot", "snapshot:run"],
  ] as const;
  const insertObject = database.prepare(
    "INSERT INTO legal_complete_corpus_objects VALUES (?,?,?)",
  );
  for (const [kind, key] of referenced) insertObject.run(runId, kind, key);
  insertObject.run(runId, "raw_capture", "raw:orphan");
  insertObject.run(runId, "plan", "plan:wrong-run-reference");
  database.prepare("INSERT INTO legal_complete_corpus_records VALUES (?,?,?,?)")
    .run(runId, "raw:record", "normalized:record", "provision:record");
  database.prepare("INSERT INTO legal_complete_corpus_quarantines VALUES (?,?,?)")
    .run(runId, "raw:quarantine", "normalized:quarantine");
  database.prepare("INSERT INTO legal_complete_corpus_pages VALUES (?,?)")
    .run(runId, "plan:page");
  database.prepare("INSERT INTO legal_complete_corpus_lane_reports VALUES (?,?,?)")
    .run(runId, "plan", "plan:lane");
  database.prepare("INSERT INTO legal_complete_corpus_lane_reports VALUES (?,?,?)")
    .run(runId, "reconstruction", "reconstruction:lane");
  database.prepare("INSERT INTO legal_complete_corpus_runs VALUES (?,?,?)")
    .run(runId, "plan:run", "reconstruction:run");
  database.prepare("INSERT INTO legal_complete_corpus_snapshots VALUES (?,?)")
    .run(runId, "snapshot:run");
  database.prepare("INSERT INTO legal_complete_corpus_pages VALUES (?,?)")
    .run("ticket29:other", "plan:wrong-run-reference");

  assert.equal(countTicket29OrphanObjects(database, runId), 2);
  database.close();
});

test("Ticket 29 isolated proof reconstructs Ticket 28's exact manifest projections", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE legal_complete_corpus_records (
    run_id TEXT, source_id TEXT, legal_identity_sha256 TEXT, material_sha256 TEXT,
    content_sha256 TEXT, raw_source_r2_key TEXT, normalized_source_r2_key TEXT,
    current_eligible INTEGER, historical_eligible INTEGER, temporal_gap INTEGER,
    source_revision_sha256 TEXT, object_metadata_revision_sha256 TEXT);
    INSERT INTO legal_complete_corpus_records VALUES
      ('run','source:b','identity:a','material:b','content:b','source/raw-b','source/norm-b',0,1,0,'${"b".repeat(64)}','${"b".repeat(64)}'),
      ('run','source:a','identity:b','material:a','content:a','source/raw-a','source/norm-a',1,1,1,'${"a".repeat(64)}','${"c".repeat(64)}');`);
  const expected = {
    inventorySha256: testManifestRoot([
      { sourceId: "source:a", legalIdentitySha256: "identity:b", materialSha256: "material:a",
        contentSha256: "content:a", rawObjectKey: "source/raw-a",
        normalizedObjectKey: "source/norm-a", currentEligible: 1, historicalEligible: 1,
        temporalGap: 1 },
      { sourceId: "source:b", legalIdentitySha256: "identity:a", materialSha256: "material:b",
        contentSha256: "content:b", rawObjectKey: "source/raw-b",
        normalizedObjectKey: "source/norm-b", currentEligible: 0, historicalEligible: 1,
        temporalGap: 0 },
    ]),
    canonicalSha256: testManifestRoot([
      { legalIdentitySha256: "identity:a", materialSha256: "material:b",
        contentSha256: "content:b", currentEligible: 0, historicalEligible: 1, temporalGap: 0 },
      { legalIdentitySha256: "identity:b", materialSha256: "material:a",
        contentSha256: "content:a", currentEligible: 1, historicalEligible: 1, temporalGap: 1 },
    ]),
    aliasSha256: testManifestRoot([
      { sourceId: "source:a", normalizedObjectKey: "source/norm-a",
        revisionVersionSha256: "a".repeat(64), objectMetadataVersionSha256: "c".repeat(64) },
    ]),
  };
  assert.deepEqual(reconstructTicket28Roots(database, "run"), expected);
  database.close();
});

test("Ticket 29 finalization derives exact membership counts from sealed manifest lanes", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE legal_complete_corpus_lane_reports (
    run_id TEXT NOT NULL, report_kind TEXT NOT NULL, lane TEXT NOT NULL,
    record_count INTEGER NOT NULL, current_count INTEGER NOT NULL,
    history_count INTEGER NOT NULL, gap_count INTEGER NOT NULL,
    UNIQUE (run_id,report_kind,lane));
    INSERT INTO legal_complete_corpus_lane_reports VALUES
      ('run','manifest','1',7,2,6,1),('run','manifest','2',5,1,5,0);`);
  assert.deepEqual({ ...database.prepare(TICKET29_FINALIZATION_COUNTS_SQL).get("run") }, {
    lanes: 2,
    records: 12,
    currentRecords: 3,
    historicalRecords: 11,
    gaps: 1,
  });
  database.close();
});

test("Ticket 29 finalization distinguishes distinct bodies from retained physical rendition objects", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE legal_complete_corpus_records (
    run_id TEXT NOT NULL, content_sha256 TEXT NOT NULL);
    INSERT INTO legal_complete_corpus_records VALUES
      ('run','body-a'),('run','body-a'),('run','body-b'),('other','body-c');`);
  const observed = database.prepare(TICKET29_DISTINCT_BODY_COUNT_SQL)
    .get("run") as { distinctBodies: number };
  assert.deepEqual(ticket29FinalObjectSummary({
    physicalRawObjects: 11_001,
    physicalNormalizedObjects: 11_001,
    physicalProvisionObjects: 220_889,
    quarantineObjectsPerKind: 12,
    distinctBodies: observed.distinctBodies,
  }), {
    recordCounts: {
      rawObjects: 10_989,
      normalizedObjects: 10_989,
      distinctBodies: 2,
    },
    physicalObjectCounts: {
      rawObjects: 11_001,
      normalizedObjects: 11_001,
      provisionObjects: 220_889,
      dataObjects: 242_891,
    },
  });
  database.close();
});

test("Ticket 29 plans one bounded source page concurrently in source order", async () => {
  const started: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const result = ticket29PlanSourcePageInParallel([1, 2, 3], async (value) => {
    started.push(value);
    await gate;
    return `planned-${value}`;
  });

  await new Promise<void>((resolve) => { setImmediate(resolve); });
  assert.deepEqual(started, [1, 2, 3]);
  release();
  assert.deepEqual(await result, ["planned-1", "planned-2", "planned-3"]);
  await assert.rejects(
    ticket29PlanSourcePageInParallel(
      Array.from({ length: TICKET29_SOURCE_PAGE_SIZE + 1 }, (_, index) => index),
      async (value) => value,
    ),
    /TICKET29_SOURCE_PAGE_LIMIT_EXCEEDED/,
  );
});

test("Ticket 29 writes bounded materialization pages concurrently in source order", async () => {
  const started: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const result = ticket29WritePlanPagesInParallel(
    Array.from({ length: TICKET29_MATERIALIZATION_PAGE_SIZE * 3 }, (_, index) => index),
    async (page, offset) => {
      started.push(offset);
      await gate;
      return page[0];
    },
  );

  await new Promise<void>((resolve) => { setImmediate(resolve); });
  assert.deepEqual(started, [0, 100, 200]);
  release();
  assert.deepEqual(await result, [0, 100, 200]);
  await assert.rejects(
    ticket29WritePlanPagesInParallel(
      Array.from({ length: TICKET29_SOURCE_PAGE_SIZE + 1 }, (_, index) => index),
      async () => undefined,
    ),
    /TICKET29_SOURCE_PAGE_LIMIT_EXCEEDED/,
  );
});

const completeIdentity = {
  instrumentId: "instrument:test",
  officialExpressionId: "expression:test",
  textRevisionId: "revision:test",
  provisionConceptId: "concept:test",
  provisionRenditionId: "rendition:test",
  legacyCurrentRenditionId: "rendition:legacy-test",
  publisherRevisionToken: '{"sourceVersionId":"version","versionDate":null,"versionNumber":1}',
  legacyTargetPublisherRevisionToken: `1:${"a".repeat(64)}`,
  sourcePublisherRevisionToken: '{"sourceVersionId":"version","versionDate":null,"versionNumber":1}',
  publisherProvisionToken: "article:1:sequence:1",
  applicabilityIdentity: "2026-01-01T00:00:00.000Z/",
  identityStage: "ticket29-provisional-v1" as const,
  textualAuthority: "unknown" as const,
  provisionSourceUrl: null,
  versionSourceUrl: null,
  previousSourceVersionId: null,
  sourceChangeType: "initial",
  sourceRevisionSha256: "a".repeat(64),
  objectMetadataRevisionSha256: "a".repeat(64),
};

test("Ticket 29 isolated verifier rejects path and hard-link aliases before writing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "juro-ticket29-isolated-"));
  try {
    const databasePath = join(directory, "export.sqlite");
    const hardLinkPath = join(directory, "checkpoint.sqlite");
    const reportPath = join(directory, "report.json");
    await writeFile(databasePath, "fixture");

    await assert.rejects(
      assertTicket29DistinctArtifactPaths({
        databasePath,
        checkpointPath: databasePath,
        reportPath,
      }),
      /databasePath aliases checkpointPath/,
    );

    await link(databasePath, hardLinkPath);
    await assert.rejects(
      assertTicket29DistinctArtifactPaths({ databasePath, checkpointPath: hardLinkPath, reportPath }),
      /databasePath aliases checkpointPath/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Ticket 29 shares Ticket 12's target revision token", () => {
  assert.equal(ticket29TargetPublisherRevisionToken({
    versionNumber: 4,
    versionContentSha256: "a".repeat(64),
  }), `4:${"a".repeat(64)}`);
});

test("Ticket 29 qualification evidence cannot stale the materialized corpus prefix", () => {
  assert.equal(ticket29EvidenceKey("qualification", "a".repeat(64), "application/json;charset=utf-8"),
    `legal-corpus/qualification-v1/qualification/${"a".repeat(64)}.json`);
});

test("Ticket 29 operational retries reconcile totals and terminal states", () => {
  assert.equal(ticket29AccountingTotalsMatch({ createdObjectCount: 3, reusedObjectCount: 0,
    createdByteCount: 48, reusedByteCount: 0 }, { createdObjectCount: 0, reusedObjectCount: 3,
    createdByteCount: 0, reusedByteCount: 48 }), true);
  assert.equal(ticket29AccountingTotalsMatch({ createdObjectCount: 3, reusedObjectCount: 0,
    createdByteCount: 48, reusedByteCount: 0 }, { createdObjectCount: 0, reusedObjectCount: 2,
    createdByteCount: 0, reusedByteCount: 48 }), false);
  assert.equal(ticket29StageDecision("finalize", "building"), "execute");
  assert.equal(ticket29StageDecision("finalize", "materialized"), "replay");
  assert.equal(ticket29StageDecision("finalize", "complete"), "replay");
  assert.equal(ticket29StageDecision("qualify", "materialized"), "execute");
  assert.equal(ticket29StageDecision("qualify", "complete"), "replay");
  assert.throws(() => ticket29StageDecision("qualify", "building"),
    /TICKET29_QUALIFY_STATE_INVALID/u);
});

test("Ticket 29 complete control replay permits retry reuse then requires all-reuse replay", () => {
  const first = [{ key: "manifest:1", recordCount: 7, rootSha256: "a".repeat(64),
    createdObjectCount: 2, reusedObjectCount: 1, createdByteCount: 20, reusedByteCount: 10 }];
  const second = [{ key: "manifest:1", recordCount: 7, rootSha256: "a".repeat(64),
    createdObjectCount: 0, reusedObjectCount: 3, createdByteCount: 0, reusedByteCount: 30 }];
  assert.equal(ticket29ControlReplayMatches(first, second, ["manifest:1"]), true);
  assert.equal(ticket29ControlReplayMatches(first,
    [{ ...second[0]!, createdObjectCount: 1, reusedObjectCount: 2 }], ["manifest:1"]), false);
  assert.equal(ticket29ControlReplayMatches(first,
    [{ ...second[0]!, rootSha256: "b".repeat(64) }], ["manifest:1"]), false);
});

test("Ticket 29 lifecycle disposition survives interruption before D1 commit", () => {
  assert.equal(ticket29LifecycleDisposition("legal-corpus/complete-v2/raw-capture/hash.bin"), "created");
  assert.equal(ticket29LifecycleDisposition("corpus/provisions/retained.json"), "reused");
  assert.throws(() => ticket29LifecycleDisposition("unscoped/object"),
    /TICKET29_OBJECT_NAMESPACE_INVALID/u);
});

class MemoryObject {
  constructor(
    readonly bytes: Uint8Array,
    readonly customMetadata: Record<string, string>,
  ) {}

  get size() { return this.bytes.byteLength; }
  async arrayBuffer() { return this.bytes.slice().buffer; }
}

class MemoryBucket {
  readonly objects = new Map<string, MemoryObject>();
  putCalls = 0;

  async get(key: string) { return this.objects.get(key) ?? null; }
  async put(key: string, value: Uint8Array, options: {
    onlyIf: { etagDoesNotMatch: "*" };
    customMetadata: Record<string, string>;
  }) {
    this.putCalls += 1;
    if (options.onlyIf.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    const object = new MemoryObject(value.slice(), { ...options.customMetadata });
    this.objects.set(key, object);
    return object;
  }
}

test("Ticket 29 evidence writes are create-only and verify exact reuse", async () => {
  const bucket = new MemoryBucket();
  const bytes = new TextEncoder().encode("official evidence");
  const sha256 = await ticket29Sha256(bytes);
  const descriptor = {
    key: ticket29EvidenceKey("provision_rendition", sha256, "text/plain;charset=utf-8"),
    kind: "provision_rendition" as const,
    mediaType: "text/plain;charset=utf-8",
    sha256,
    byteCount: bytes.byteLength,
    sourceNormalizedSha256: "a".repeat(64),
  };

  assert.deepEqual(await immutableEvidencePut(bucket, descriptor, bytes), {
    disposition: "created",
    key: descriptor.key,
    byteCount: bytes.byteLength,
    sha256,
  });
  assert.deepEqual(await immutableEvidencePut(bucket, descriptor, bytes), {
    disposition: "reused",
    key: descriptor.key,
    byteCount: bytes.byteLength,
    sha256,
  });
  assert.equal(bucket.objects.size, 1);
  assert.equal(bucket.putCalls, 1);

  const conflicting = new TextEncoder().encode("different evidence");
  await assert.rejects(
    () => immutableEvidencePut(bucket, descriptor, conflicting),
    /TICKET29_OBJECT_INPUT_MISMATCH/u,
  );
  assert.equal(new TextDecoder().decode(bucket.objects.get(descriptor.key)!.bytes), "official evidence");
});

test("Ticket 29 D1 record is body-free while retaining complete identities and locators", async () => {
  const body = "Article 1. Scope";
  const contentSha256 = await ticket29Sha256(body);
  const record = buildBodyFreeMaterializationRecord({
    runId: "ticket29:cutoff-20260831",
    sourceId: "lexuz-family:100:revision:4:provision:1",
    sourceDocumentId: "lexuz-family:100",
    sourceVersionId: "lexuz-family:100:revision:4",
    legalIdentitySha256: "1".repeat(64),
    materialSha256: "2".repeat(64),
    contentSha256,
    rawSourceKey: "legal-corpus/raw/100/4.html",
    rawSourceSha256: "3".repeat(64),
    normalizedSourceKey: "legal-corpus/normalized/100/4.json",
    normalizedSourceSha256: "4".repeat(64),
    language: "en",
    script: "Latn",
    ordinal: 1,
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: null,
    currentEligible: true,
    historicalEligible: true,
    temporalGap: false,
  });

  assert.equal(record.provisionObjectKey,
    `legal-corpus/complete-v2/provision-rendition/${contentSha256}.txt`);
  assert.equal(record.rawObjectKey,
    `legal-corpus/complete-v2/raw-capture/${"3".repeat(64)}.bin`);
  assert.equal(record.normalizedObjectKey,
    `legal-corpus/complete-v2/normalized-revision/${"4".repeat(64)}.json`);
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /Article 1|officialText|"text"|"body"/u);
  assert.match(serialized, /legalIdentitySha256|sourceVersionId|validFrom/u);
});

test("Ticket 29 reuses verified Ticket 12 locators without rewriting accepted evidence", async () => {
  const bucket = new MemoryBucket();
  const rawBytes = new TextEncoder().encode("accepted raw");
  const normalizedBytes = new TextEncoder().encode("accepted normalized");
  const officialBytes = new TextEncoder().encode("official text");
  const renditionBytes = new TextEncoder().encode('{"provisionText":"official text"}\n');
  const [rawSha256, normalizedSha256, contentSha256, renditionSha256] = await Promise.all([
    ticket29Sha256(rawBytes), ticket29Sha256(normalizedBytes), ticket29Sha256(officialBytes),
    ticket29Sha256(renditionBytes),
  ]);
  const retained = (kind: "raw_capture" | "normalized_revision" | "provision_rendition",
    key: string, sha256: string, byteCount: number, sourceNormalizedSha256: string | null) => ({
    kind, key, sha256, byteCount, sourceNormalizedSha256, schemaVersion: 1 as const,
    mediaType: "application/json; charset=utf-8",
  });
  const plan = [{ sourceId: "source", legalIdentitySha256: "1".repeat(64),
    materialSha256: "2".repeat(64), contentSha256, rawSourceKey: "source/raw",
    rawSourceSha256: rawSha256, normalizedSourceKey: "source/normalized",
    normalizedSourceSha256: normalizedSha256,
    ...completeIdentity, sourceDocumentId: "document", sourceVersionId: "version",
    language: "en" as const, script: "Latn" as const, ordinal: 1,
    validFrom: "2026-01-01T00:00:00.000Z", validTo: null,
    currentEligible: true, historicalEligible: true, temporalGap: false,
    retainedRawLocator: retained("raw_capture", "corpus/raw/accepted", rawSha256, rawBytes.byteLength, null),
    retainedNormalizedLocator: retained("normalized_revision", "corpus/normalized/accepted",
      normalizedSha256, normalizedBytes.byteLength, null),
    retainedProvisionLocator: retained("provision_rendition", "corpus/provisions/accepted",
      renditionSha256, renditionBytes.byteLength, normalizedSha256) }];
  const planBytes = new TextEncoder().encode(`${JSON.stringify(plan)}\n`);
  const pageSha256 = await ticket29Sha256(planBytes);
  const retainedBytes = new Map([[plan[0]!.retainedRawLocator.key, rawBytes],
    [plan[0]!.retainedNormalizedLocator.key, normalizedBytes],
    [plan[0]!.retainedProvisionLocator.key, renditionBytes]]);
  let verifiedRetainedObjects = 0;
  let committed: Ticket29BodyFreeRecord | undefined;
  const dependencies = { bucket,
    loadPlan: async () => planBytes,
    loadSource: async () => [{ ...plan[0]!, sourceDocumentId: "document", sourceVersionId: "version",
      rawBytes, normalizedBytes, officialBytes, language: "en" as const, script: "Latn" as const,
      ordinal: 1, validFrom: "2026-01-01T00:00:00.000Z", validTo: null,
      currentEligible: true, historicalEligible: true, temporalGap: false }],
    findReceipt: async () => null,
    withRetainedObjectBytes: async (locator: Ticket29RetainedLocator,
      verifyBytes: (bytes: Uint8Array) => Promise<void>) => {
      verifiedRetainedObjects += 1;
      await verifyBytes(retainedBytes.get(locator.key)!);
    },
    commitPage: async (value: { records: Ticket29BodyFreeRecord[] }) => {
      committed = value.records[0];
    },
  };
  const message = { schemaVersion: 1 as const, kind: "materialize-page" as const,
    runId: "run", attemptId: "first",
    planKey: ticket29EvidenceKey("plan", pageSha256, "application/json;charset=utf-8"),
    offset: 0, length: planBytes.byteLength, pageSha256, injectInterruption: false,
    proofMode: "interrupted" as const };
  const result = await runTicket29MaterializationPage(dependencies, message);
  assert.equal(bucket.putCalls, 0);
  assert.equal(result.objects.created, 0);
  assert.equal(result.objects.reused, 3);
  assert.equal(verifiedRetainedObjects, 3);
  assert.equal(committed?.provisionObjectKey, "corpus/provisions/accepted");
  assert.equal(committed?.provisionObjectSha256, renditionSha256);
  await assert.rejects(() => runTicket29MaterializationPage({
    ...dependencies,
    withRetainedObjectBytes: async () => undefined,
  }, { ...message, runId: "unverified" }), /TICKET29_RETAINED_OBJECT_UNVERIFIED/u);
});

test("Ticket 29 manifests are deterministic and preserve current, history, and gap membership", async () => {
  const base: Ticket29BodyFreeRecord = {
    runId: "run",
    sourceId: "source-1",
    sourceDocumentId: "document-1",
    sourceVersionId: "version-1",
    legalIdentitySha256: "1".repeat(64),
    materialSha256: "2".repeat(64),
    contentSha256: "3".repeat(64),
    rawSourceKeySha256: "4".repeat(64),
    normalizedSourceKeySha256: "5".repeat(64),
    rawObjectKey: `legal-corpus/complete-v2/raw-capture/${"6".repeat(64)}.bin`,
    normalizedObjectKey: `legal-corpus/complete-v2/normalized-revision/${"7".repeat(64)}.json`,
    provisionObjectKey: `legal-corpus/complete-v2/provision-rendition/${"3".repeat(64)}.txt`,
    provisionObjectSha256: "3".repeat(64),
    rawSourceKey: "source/raw",
    normalizedSourceKey: "source/normalized",
    instrumentId: "instrument-1",
    officialExpressionId: "expression-1",
    textRevisionId: "revision-1",
    provisionConceptId: "concept-1",
    provisionRenditionId: "rendition-1",
    legacyCurrentRenditionId: "legacy-rendition-1",
    publisherRevisionToken: `1:${"a".repeat(64)}`,
    publisherProvisionToken: "article:1:sequence:1",
    applicabilityIdentity: "2026-01-01T00:00:00.000Z/",
    textualAuthority: "unknown",
    provisionSourceUrl: "https://lex.uz/docs/1#article-1",
    versionSourceUrl: "https://lex.uz/docs/1",
    previousSourceVersionId: null,
    sourceChangeType: "initial",
    sourceRevisionSha256: "a".repeat(64),
    objectMetadataRevisionSha256: "a".repeat(64),
    legacyTargetPublisherRevisionToken: `1:${"a".repeat(64)}`,
    sourcePublisherRevisionToken: `1:${"a".repeat(64)}`,
    identityStage: "ticket29-provisional-v1",
    language: "en",
    script: "Latn",
    ordinal: 1,
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: null,
    currentEligible: true,
    historicalEligible: true,
    temporalGap: false,
    quarantined: false,
  };
  const gap = {
    ...base,
    sourceId: "source-gap",
    legalIdentitySha256: "8".repeat(64),
    ordinal: 2,
    validFrom: null,
    currentEligible: false,
    historicalEligible: false,
    temporalGap: true,
  } satisfies Ticket29BodyFreeRecord;

  const first = await ticket29ManifestRoot([base, gap]);
  const second = await ticket29ManifestRoot([gap, base]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.counts, { union: 2, current: 1, history: 1, gaps: 1, quarantines: 0 });
  assert.notEqual(first.roots.current, first.roots.gaps);
  const provenanceChanged = await ticket29ManifestRoot([{ ...base,
    versionSourceUrl: "https://lex.uz/docs/1?changed=1" }, gap]);
  assert.notEqual(first.roots.union, provenanceChanged.roots.union);
  const identityChanged = await ticket29ManifestRoot([{ ...base,
    provisionRenditionId: "rendition-2" }, gap]);
  assert.notEqual(first.roots.union, identityChanged.roots.union);
});

test("isolated reconstruction uses only body-free mappings and evidence objects", async () => {
  const firstBody = new TextEncoder().encode("shared official provision");
  const secondBody = new TextEncoder().encode("another official provision");
  const firstSha = await ticket29Sha256(firstBody);
  const secondSha = await ticket29Sha256(secondBody);
  const make = (sourceId: "a" | "b" | "c", sha256: string,
    currentEligible: boolean): Ticket29BodyFreeRecord => {
    const normalizedHash = { a: "4", b: "5", c: "6" }[sourceId].repeat(64);
    return ({
    runId: "run",
    sourceId,
    sourceDocumentId: `document-${sourceId}`,
    sourceVersionId: `version-${sourceId}`,
    legalIdentitySha256: sourceId === "a" ? "a".repeat(64) : sourceId === "b" ? "b".repeat(64) : "c".repeat(64),
    materialSha256: sourceId === "a" ? "d".repeat(64) : sourceId === "b" ? "e".repeat(64) : "f".repeat(64),
    contentSha256: sha256,
    rawSourceKeySha256: "1".repeat(64),
    normalizedSourceKeySha256: normalizedHash,
    rawObjectKey: `legal-corpus/complete-v2/raw-capture/${"3".repeat(64)}.bin`,
    normalizedObjectKey: `legal-corpus/complete-v2/normalized-revision/${normalizedHash}.json`,
    provisionObjectKey: ticket29EvidenceKey("provision_rendition", sha256, "text/plain;charset=utf-8"),
    provisionObjectSha256: sha256,
    rawSourceKey: `source/raw/${sourceId}`,
    normalizedSourceKey: `source/normalized/${sourceId}`,
    ...completeIdentity,
    language: "en",
    script: "Latn",
    ordinal: 1,
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: null,
    currentEligible,
    historicalEligible: true,
    temporalGap: false,
    quarantined: false,
    });
  };
  const records = [make("a", firstSha, true), make("b", firstSha, false), make("c", secondSha, false)];
  const objects = new Map([[records[0]!.provisionObjectKey, firstBody], [records[2]!.provisionObjectKey, secondBody]]);

  const reconstructed = await reconstructMaterializedCorpus(records, async (key) => objects.get(key) ?? null);
  assert.deepEqual(reconstructed.counts, {
    records: 3,
    distinctBodies: 2,
    current: 1,
    history: 3,
    gaps: 0,
    quarantines: 0,
  });
  assert.equal(reconstructed.missingObjects, 0);
  assert.equal(reconstructed.hashMismatches, 0);
  assert.equal(reconstructed.manifest.roots.union, (await ticket29ManifestRoot(records)).roots.union);
});

test("isolated reconstruction verifies persisted whole-object reports without downloading bodies again", () => {
  const objects = Array.from({ length: 101 }, (_, index) => ({
    objectKind: index % 2 === 0 ? "provision_rendition" : "raw_capture",
    sha256: `a${index.toString(16).padStart(63, "0")}`,
    r2Key: `corpus/${index}`,
    byteCount: index + 1,
  }));
  objects.push({
    objectKind: "manifest",
    sha256: "b".repeat(64),
    r2Key: "legal-corpus/complete-v2/manifests/control.json",
    byteCount: 10,
  });

  const proofs = buildTicket29ReconstructionLaneProofs("run", objects);
  const lane = proofs.find((proof) => proof.lane === "a")!;
  assert.equal(lane.pageCount, 2);
  assert.equal(lane.verifiedObjectCount, 101);
  assert.equal(lane.byteCount, 5_151);
  assert.equal(proofs.find((proof) => proof.lane === "b")!.verifiedObjectCount, 0);
  assert.equal(ticket29ReconstructionLaneReportMatches(lane, lane), true);
  assert.equal(ticket29ReconstructionLaneReportMatches(lane, {
    ...lane,
    missingObjects: 1,
  }), false);
});

test("Ticket 29 queue messages are identifiers-only", () => {
  assert.equal(ticket29QueueMessageSchema.parse({
    schemaVersion: 1,
    kind: "materialize-page",
    runId: "ticket29:cutoff-20260831",
    attemptId: "ticket29:first",
    planKey: "legal-corpus/complete-v2/plans/plan.jsonl",
    offset: 0,
    length: 1024,
    pageSha256: "a".repeat(64),
    injectInterruption: false,
    proofMode: "interrupted",
  }).kind, "materialize-page");
  assert.throws(() => ticket29QueueMessageSchema.parse({
    schemaVersion: 1,
    kind: "materialize-page",
    runId: "run",
    planKey: "plan",
    offset: 0,
    length: 10,
    pageSha256: "a".repeat(64),
    injectInterruption: false,
    proofMode: "interrupted",
    text: "must never enter Queue",
  }));
});

test("Ticket 29 page processing resumes after an injected durable interruption and is idempotent", async () => {
  const bucket = new MemoryBucket();
  const officialBytes = new TextEncoder().encode("official provision");
  const rawBytes = new TextEncoder().encode("raw capture");
  const normalizedBytes = new TextEncoder().encode('{"schemaVersion":1}');
  const [contentSha256, rawSha256, normalizedSha256] = await Promise.all([
    ticket29Sha256(officialBytes), ticket29Sha256(rawBytes), ticket29Sha256(normalizedBytes),
  ]);
  const plan = [{
    sourceId: "lexuz-family:100:revision:4:provision:1",
    legalIdentitySha256: "1".repeat(64),
    materialSha256: "2".repeat(64),
    contentSha256,
    rawSourceKey: "legal-corpus/raw/100/4.html",
    rawSourceSha256: rawSha256,
    normalizedSourceKey: "legal-corpus/normalized/100/4.json",
    normalizedSourceSha256: normalizedSha256,
    ...completeIdentity,
    sourceDocumentId: "lexuz-family:100",
    sourceVersionId: "lexuz-family:100:revision:4",
    language: "en" as const,
    script: "Latn" as const,
    ordinal: 1,
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: null,
    currentEligible: true,
    historicalEligible: true,
    temporalGap: false,
  }];
  const pageBytes = new TextEncoder().encode(`${JSON.stringify(plan)}\n`);
  const pageSha256 = await ticket29Sha256(pageBytes);
  const commits: Array<{ receiptSha256: string; records: Ticket29BodyFreeRecord[];
    objects: Array<Ticket29EvidenceDescriptor & { writeDisposition: "created" | "reused" }> }> = [];
  let interrupted = false;
  const dependencies = {
    bucket,
    loadPlan: async () => pageBytes,
    loadSource: async () => [{
      ...plan[0]!,
      sourceDocumentId: "lexuz-family:100",
      sourceVersionId: "lexuz-family:100:revision:4",
      rawBytes,
      normalizedBytes,
      officialBytes,
      language: "en" as const,
      script: "Latn" as const,
      ordinal: 1,
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: null,
      currentEligible: true,
      historicalEligible: true,
      temporalGap: false,
      quarantined: false,
    }],
    findReceipt: async () => commits[0]?.receiptSha256 ?? null,
    commitPage: async (value: { receiptSha256: string; records: Ticket29BodyFreeRecord[];
      objects: Array<Ticket29EvidenceDescriptor & { writeDisposition: "created" | "reused" }> }) => {
      commits.push(value);
    },
    afterObjectCheckpoint: async () => {
      if (!interrupted) {
        interrupted = true;
        throw new Error("TICKET29_INJECTED_INTERRUPTION");
      }
    },
  };
  const message = {
    schemaVersion: 1 as const,
    kind: "materialize-page" as const,
    runId: "ticket29:cutoff-20260831",
    attemptId: "ticket29:first",
    planKey: ticket29EvidenceKey("plan", pageSha256, "application/jsonl;charset=utf-8"),
    offset: 0,
    length: pageBytes.byteLength,
    pageSha256,
    injectInterruption: true,
    proofMode: "interrupted" as const,
  };

  await assert.rejects(() => runTicket29MaterializationPage(dependencies, message),
    /TICKET29_INJECTED_INTERRUPTION/u);
  assert.equal(bucket.objects.size, 3);
  assert.equal(commits.length, 0);
  const resumed = await runTicket29MaterializationPage(dependencies, message);
  assert.equal(resumed.disposition, "completed");
  assert.deepEqual(resumed.objects, { created: 0, reused: 3, createdBytes: 0, reusedBytes: 48 });
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0]!.objects.map((object) => ({
    observedWrite: object.writeDisposition,
    lifecycle: ticket29LifecycleDisposition(object.key),
  })), Array.from({ length: 3 }, () => ({ observedWrite: "reused", lifecycle: "created" })));
  assert.equal((await runTicket29MaterializationPage(dependencies, message)).disposition, "duplicate");
  assert.equal(commits.length, 1);
  const verified = await runTicket29MaterializationPage(dependencies, {
    ...message, attemptId: "ticket29:second", injectInterruption: false, proofMode: "idempotent",
  });
  assert.equal(verified.disposition, "completed");
  assert.deepEqual(verified.objects, { created: 0, reused: 3, createdBytes: 0, reusedBytes: 48 });
  assert.equal(commits.length, 2);
});
