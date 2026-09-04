import assert from "node:assert/strict";
import { link, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  TICKET29_SOURCE_PAGE_SIZE,
  TICKET29_MATERIALIZATION_PAGE_SIZE,
  buildBodyFreeMaterializationRecord,
  immutableEvidencePut,
  reconstructMaterializedCorpus,
  runTicket29MaterializationPage,
  ticket29AccountingTotalsMatch,
  ticket29ControlReplayMatches,
  ticket29LifecycleDisposition,
  ticket29EvidenceKey,
  ticket29ManifestRoot,
  ticket29PlanSourcePageInParallel,
  ticket29WritePlanPagesInParallel,
  ticket29QueueMessageSchema,
  ticket29Sha256,
  ticket29StageDecision,
  ticket29TargetPublisherRevisionToken,
  type Ticket29BodyFreeRecord,
  type Ticket29EvidenceDescriptor,
} from "../lib/legal-corpus/complete-corpus-materialization";
import { assertTicket29DistinctArtifactPaths } from "../scripts/ticket29-isolated-artifact-paths";

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
  assert.equal(ticket29LifecycleDisposition("legal-corpus/complete-v1/raw-capture/hash.bin"), "created");
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
    `legal-corpus/complete-v1/provision-rendition/${contentSha256}.txt`);
  assert.equal(record.rawObjectKey,
    `legal-corpus/complete-v1/raw-capture/${"3".repeat(64)}.bin`);
  assert.equal(record.normalizedObjectKey,
    `legal-corpus/complete-v1/normalized-revision/${"4".repeat(64)}.json`);
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
  let committed: Ticket29BodyFreeRecord | undefined;
  const result = await runTicket29MaterializationPage({ bucket,
    loadPlan: async () => planBytes,
    loadSource: async () => [{ ...plan[0]!, sourceDocumentId: "document", sourceVersionId: "version",
      rawBytes, normalizedBytes, officialBytes, language: "en" as const, script: "Latn" as const,
      ordinal: 1, validFrom: "2026-01-01T00:00:00.000Z", validTo: null,
      currentEligible: true, historicalEligible: true, temporalGap: false }],
    findReceipt: async () => null,
    verifyRetainedObject: async (locator) => retainedBytes.get(locator.key)!,
    commitPage: async (value) => { committed = value.records[0]; },
  }, { schemaVersion: 1, kind: "materialize-page", runId: "run", attemptId: "first",
    planKey: ticket29EvidenceKey("plan", pageSha256, "application/json;charset=utf-8"),
    offset: 0, length: planBytes.byteLength, pageSha256, injectInterruption: false,
    proofMode: "interrupted" });
  assert.equal(bucket.putCalls, 0);
  assert.equal(result.objects.created, 0);
  assert.equal(result.objects.reused, 3);
  assert.equal(committed?.provisionObjectKey, "corpus/provisions/accepted");
  assert.equal(committed?.provisionObjectSha256, renditionSha256);
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
    rawObjectKey: `legal-corpus/complete-v1/raw-capture/${"6".repeat(64)}.bin`,
    normalizedObjectKey: `legal-corpus/complete-v1/normalized-revision/${"7".repeat(64)}.json`,
    provisionObjectKey: `legal-corpus/complete-v1/provision-rendition/${"3".repeat(64)}.txt`,
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
    rawObjectKey: `legal-corpus/complete-v1/raw-capture/${"3".repeat(64)}.bin`,
    normalizedObjectKey: `legal-corpus/complete-v1/normalized-revision/${normalizedHash}.json`,
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

test("Ticket 29 queue messages are identifiers-only", () => {
  assert.equal(ticket29QueueMessageSchema.parse({
    schemaVersion: 1,
    kind: "materialize-page",
    runId: "ticket29:cutoff-20260831",
    attemptId: "ticket29:first",
    planKey: "legal-corpus/complete-v1/plans/plan.jsonl",
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
