import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSearchReleaseMetadataParity,
  recordProvisionTemporalEvidence,
} from "../lib/legal-corpus/target-temporal";
import {
  importProvisionRendition,
  resolveProvisionRendition,
} from "../lib/legal-corpus/target-evidence";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";
import { MemoryEvidenceBucket, representativeProvision } from "./helpers/legal-target";

const asOf = (instant: string) => ({ kind: "timestamp" as const, instant });

test("temporal evidence rejects non-UTC offsets before SQL comparison", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const bucket = new MemoryEvidenceBucket();
  try {
    await importProvisionRendition({ db: d1, bucket }, representativeProvision);
    await assert.rejects(
      () => recordProvisionTemporalEvidence({ db: d1 }, {
        id: "offset-temporal-evidence",
        textRevisionId: representativeProvision.textRevisionId,
        provisionRenditionId: representativeProvision.provisionRenditionId,
        editorialValidFrom: "2026-01-01T05:00:00.000+05:00",
        editorialValidTo: null,
        applicability: {
          validFrom: "2026-01-01T05:00:00.000+05:00",
          validTo: null,
          evidenceUrl: representativeProvision.sourceUrl,
          evidenceKind: "official_timeline",
        },
        recordedAt: "2026-08-30T05:00:00.000+05:00",
      }),
      /invalid_string|Invalid/u,
    );
  } finally {
    sqlite.close();
  }
});

test("same-day publisher revisions remain distinct from delayed legal applicability", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const bucket = new MemoryEvidenceBucket();
  try {
    const first = {
      ...representativeProvision,
      textRevisionId: "revision-labor-code-ru-2026-01-01-1",
      provisionRenditionId: "rendition-labor-code-ru-2026-article-10-1",
      captureId: "lex-100-2026-01-01-1",
      publisherRevisionToken: "2026-01-01-1",
    };
    const second = {
      ...representativeProvision,
      textRevisionId: "revision-labor-code-ru-2026-01-01-2",
      provisionRenditionId: "rendition-labor-code-ru-2026-article-10-2",
      captureId: "lex-100-2026-01-01-2",
      publisherRevisionToken: "2026-01-01-2",
      provisionText: `${representativeProvision.provisionText} Second official revision.`,
      rawCapture: `${representativeProvision.rawCapture}\n<!-- second official revision -->`,
    };
    await importProvisionRendition({ db: d1, bucket }, first);
    await importProvisionRendition({ db: d1, bucket }, second);
    await recordProvisionTemporalEvidence({ db: d1 }, {
      id: "temporal-labor-10-1",
      textRevisionId: first.textRevisionId,
      provisionRenditionId: first.provisionRenditionId,
      editorialValidFrom: "2026-01-01T00:00:00.000Z",
      editorialValidTo: "2026-01-01T12:00:00.000Z",
      applicability: {
        validFrom: "2026-02-01T00:00:00.000Z",
        validTo: "2026-03-01T00:00:00.000Z",
        evidenceUrl: first.sourceUrl,
        evidenceKind: "commencement_clause",
      },
      recordedAt: "2026-08-30T00:00:00.000Z",
    });
    await recordProvisionTemporalEvidence({ db: d1 }, {
      id: "temporal-labor-10-2",
      textRevisionId: second.textRevisionId,
      provisionRenditionId: second.provisionRenditionId,
      editorialValidFrom: "2026-01-01T12:00:00.000Z",
      editorialValidTo: null,
      applicability: {
        validFrom: "2026-03-01T00:00:00.000Z",
        validTo: null,
        evidenceUrl: second.sourceUrl,
        evidenceKind: "commencement_clause",
      },
      recordedAt: "2026-08-30T00:00:00.000Z",
    });

    const revisions = sqlite.prepare(`SELECT publisher_revision_token AS token
      FROM legal_text_revisions ORDER BY publisher_revision_token`).all() as Array<{ token: string }>;
    assert.deepEqual(revisions.map(({ token }) => token), ["2026-01-01-1", "2026-01-01-2"]);
    await assert.rejects(
      () => resolveProvisionRendition({ db: d1, bucket }, first.provisionRenditionId,
        asOf("2026-01-15T00:00:00.000Z")),
      /SOURCE_UNAVAILABILITY/u,
    );
    assert.equal((await resolveProvisionRendition(
      { db: d1, bucket }, first.provisionRenditionId, asOf("2026-02-01T00:00:00.000Z"),
    )).provisionText, first.provisionText);
    await assert.rejects(
      () => resolveProvisionRendition({ db: d1, bucket }, first.provisionRenditionId,
        asOf("2026-03-01T00:00:00.000Z")),
      /SOURCE_UNAVAILABILITY/u,
    );
    assert.equal((await resolveProvisionRendition(
      { db: d1, bucket }, second.provisionRenditionId, asOf("2099-01-01T00:00:00.000Z"),
    )).provisionText, second.provisionText);
  } finally {
    sqlite.close();
  }
});

test("a temporal gap never qualifies historical evidence while a validated current pointer stays current-only", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const bucket = new MemoryEvidenceBucket();
  try {
    await importProvisionRendition({ db: d1, bucket }, representativeProvision);
    await recordProvisionTemporalEvidence({ db: d1 }, {
      id: "temporal-gap-labor-10",
      textRevisionId: representativeProvision.textRevisionId,
      provisionRenditionId: representativeProvision.provisionRenditionId,
      editorialValidFrom: "2026-01-01T00:00:00.000Z",
      editorialValidTo: null,
      applicabilityGap: {
        kind: "disputed",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
        evidenceUrl: representativeProvision.sourceUrl,
        reason: "The publication does not establish the commencement instant.",
      },
      currentPointer: {
        evidenceUrl: representativeProvision.sourceUrl,
        verifiedAt: "2026-08-30T00:00:00.000Z",
      },
      recordedAt: "2026-08-30T00:00:00.000Z",
    });

    assert.equal((await resolveProvisionRendition(
      { db: d1, bucket }, representativeProvision.provisionRenditionId,
      { kind: "current" },
    )).provisionText, representativeProvision.provisionText);
    await assert.rejects(
      () => resolveProvisionRendition(
        { db: d1, bucket }, representativeProvision.provisionRenditionId,
        asOf("2026-06-01T00:00:00.000Z"),
      ),
      /SOURCE_UNAVAILABILITY/u,
    );
    const gap = sqlite.prepare(`SELECT gap_kind AS kind,status FROM legal_temporal_coverage_gaps`).get() as {
      kind: string;
      status: string;
    };
    assert.equal(gap.kind, "disputed");
    assert.equal(gap.status, "open");
  } finally {
    sqlite.close();
  }
});

test("temporal replay rejects conflicting current-pointer or eligibility evidence", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const bucket = new MemoryEvidenceBucket();
  try {
    await importProvisionRendition({ db: d1, bucket }, representativeProvision);
    const evidence = {
      id: "temporal-pointer-replay",
      textRevisionId: representativeProvision.textRevisionId,
      provisionRenditionId: representativeProvision.provisionRenditionId,
      editorialValidFrom: "2026-01-01T00:00:00.000Z",
      editorialValidTo: null,
      applicability: {
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
        evidenceUrl: representativeProvision.sourceUrl,
        evidenceKind: "official_timeline" as const,
      },
      currentPointer: {
        evidenceUrl: representativeProvision.sourceUrl,
        verifiedAt: "2026-08-30T00:00:00.000Z",
      },
      recordedAt: "2026-08-30T00:00:00.000Z",
    };
    sqlite.prepare(`INSERT INTO legal_current_provision_pointers
      (provision_rendition_id,evidence_url,verified_at,recorded_at) VALUES (?,?,?,?)`).run(
      representativeProvision.provisionRenditionId,
      representativeProvision.sourceUrl,
      "2026-08-29T00:00:00.000Z",
      evidence.recordedAt,
    );
    await assert.rejects(
      () => recordProvisionTemporalEvidence({ db: d1 }, evidence),
      /LEGAL_TEMPORAL_IDENTITY_CONFLICT/u,
    );
  } finally {
    sqlite.close();
  }
});

test("AI Search datetime metadata must exactly match legal D1 release metadata", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const bucket = new MemoryEvidenceBucket();
  try {
    await importProvisionRendition({ db: d1, bucket }, representativeProvision);
    sqlite.exec(`INSERT INTO legal_corpus_snapshots
      (id,environment,corpus_hash,member_count,status,frozen_at,created_at)
      VALUES ('snapshot-temporal','development','${"a".repeat(64)}',1,'frozen',
        '2026-08-30T00:00:00.000Z','2026-08-30T00:00:00.000Z');
      INSERT INTO legal_search_releases
      (id,environment,capability,corpus_snapshot_id,status,item_count,retrieval_policy_version,
        configuration_identity,sealed_at,created_at)
      VALUES ('release-temporal','development','history','snapshot-temporal','draft',1,
        'policy-v1','config-v1',NULL,'2026-08-30T00:00:00.000Z');
      INSERT INTO legal_search_release_items
      (search_release_id,provision_rendition_id,canonical_chunk_id,item_key,r2_key,byte_count,sha256,
        language,document_type,valid_from,valid_to)
      VALUES ('release-temporal','${representativeProvision.provisionRenditionId}',
        'chunk-temporal','search-releases/release-temporal/history/00/item.md',
        'search-releases/release-temporal/history/00/item.md',
        10,'${"b".repeat(64)}','uz-Latn','code','2026-02-01T00:00:00.000Z',NULL);`);

    const exact = [{
      itemKey: "search-releases/release-temporal/history/00/item.md",
      language: "uz-Latn" as const,
      documentType: "code",
      validFrom: "2026-02-01T00:00:00.000Z",
      validTo: null,
    }];
    assert.deepEqual(await assertSearchReleaseMetadataParity({ db: d1 }, "release-temporal", exact), {
      expectedCount: 1,
      providerCount: 1,
      mismatches: [],
    });
    await assert.rejects(
      () => assertSearchReleaseMetadataParity({ db: d1 }, "release-temporal", [{
        ...exact[0]!, validFrom: "2026-01-01T00:00:00.000Z",
      }]),
      /SEARCH_RELEASE_METADATA_MISMATCH/u,
    );
  } finally {
    sqlite.close();
  }
});
