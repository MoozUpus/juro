import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createOfficialEvidenceClient,
  handleOfficialEvidenceRequest,
  importProvisionRendition,
  importProvisionRevision,
} from "../lib/legal-corpus/target-evidence";
import { recordProvisionTemporalEvidence } from "../lib/legal-corpus/target-temporal";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";
import { MemoryEvidenceBucket, representativeProvision } from "./helpers/legal-target";

const migrationCutoff = "2026-08-31T06:26:27.225Z";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function migrationProvision<T extends Record<string, unknown> = Record<never, never>>(
  overrides?: T,
) {
  const merged = { ...representativeProvision, ...overrides };
  return {
    ...merged,
    renditionStatus: "active" as const,
    sourceRawSha256: sha256(merged.rawCapture),
    sourceNormalizedSha256: sha256(merged.normalizedRevision),
    sourceProvisionSha256: sha256(merged.provisionText),
    migrationRunId: "ticket-12-current-20260831t062627z",
    cutoffAt: migrationCutoff,
    editorialValidity: {
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: null,
      recordedAt: migrationCutoff,
    },
    applicability: {
      id: `applicability:${merged.provisionRenditionId}`,
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: null,
      evidenceUrl: merged.sourceUrl,
      evidenceKind: "official_timeline" as const,
      recordedAt: migrationCutoff,
    },
    currentPointer: {
      evidenceUrl: merged.sourceUrl,
      verifiedAt: migrationCutoff,
      recordedAt: migrationCutoff,
    },
  };
}

async function markCurrent(
  db: D1Database,
  value: {
    textRevisionId: string;
    provisionRenditionId: string;
    sourceUrl: string;
    capturedAt: string;
  },
): Promise<void> {
  await recordProvisionTemporalEvidence({ db }, {
    id: `current-${value.provisionRenditionId}`,
    textRevisionId: value.textRevisionId,
    provisionRenditionId: value.provisionRenditionId,
    editorialValidFrom: value.capturedAt,
    editorialValidTo: null,
    applicability: {
      validFrom: value.capturedAt,
      validTo: null,
      evidenceUrl: value.sourceUrl,
      evidenceKind: "official_timeline",
    },
    currentPointer: { evidenceUrl: value.sourceUrl, verifiedAt: value.capturedAt },
    recordedAt: value.capturedAt,
  });
}

test("one provision imports idempotently and resolves only from hash-verified R2 evidence", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    const first = await importProvisionRendition({ db: d1, bucket }, representativeProvision);
    const second = await importProvisionRendition({ db: d1, bucket }, representativeProvision);
    assert.deepEqual(second, first);
    const objectCountBeforeConflict = bucket.objects.size;
    await assert.rejects(
      () => importProvisionRendition({ db: d1, bucket }, {
        ...representativeProvision,
        legalInstrumentId: "instrument-conflicting-alias",
        officialExpressionId: "expression-conflicting-alias",
        textRevisionId: "revision-conflicting-alias",
        provisionConceptId: "concept-conflicting-alias",
        provisionRenditionId: "rendition-conflicting-alias",
        captureId: "capture-conflicting-alias",
      }),
      /LEGAL_EVIDENCE_IDENTITY_CONFLICT/u,
      "one publisher instrument token cannot acquire a second incidental identifier",
    );
    assert.equal(bucket.objects.size, objectCountBeforeConflict);
    assert.deepEqual([...bucket.objects.keys()].sort(), [
      "corpus/normalized/revision-labor-code-ru-2026-01-01.json",
      "corpus/provisions/revision-labor-code-ru-2026-01-01/rendition-labor-code-ru-2026-article-10.json",
      "corpus/raw/lex/lex-100-2026-01-01/source.html",
    ]);
    const normalized = bucket.objects.get(
      "corpus/normalized/revision-labor-code-ru-2026-01-01.json",
    );
    assert.equal(
      new TextDecoder().decode(normalized?.bytes),
      representativeProvision.normalizedRevision,
      "a Text Revision must retain the byte-exact normalized legal text",
    );

    const service = {
      fetch(input: RequestInfo | URL, init?: RequestInit) {
        return handleOfficialEvidenceRequest(new Request(input, init), {
          APP_ENV: "development",
          LEGAL_DB: d1,
          LEGAL_EVIDENCE_BUCKET: bucket,
        });
      },
    } as Fetcher;
    const resolved = await createOfficialEvidenceClient({
      service,
      environment: "development",
    }).resolve(representativeProvision.provisionRenditionId);

    assert.equal(resolved.provisionText, representativeProvision.provisionText);
    assert.deepEqual(resolved.officialCitation, {
      label: "Трудовой кодекс Республики Узбекистан — Article 10",
      url: representativeProvision.sourceUrl,
    });
    assert.equal(resolved.evidence.provisionRenditionId, representativeProvision.provisionRenditionId);
    assert.match(resolved.evidence.sha256, /^[a-f0-9]{64}$/u);

    const bodyColumns = sqlite.prepare(`SELECT name FROM pragma_table_info('legal_provision_renditions')
      WHERE lower(name) IN ('content_text','provision_text','exact_quote','body_text')`).all();
    assert.deepEqual(bodyColumns, []);
  } finally {
    sqlite.close();
  }
});

test("source article titles are retained exactly when official table text exceeds ordinary title length", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  const articleTitle = `Official annex cell: ${"legal table content ".repeat(550)}final cell`;
  try {
    await importProvisionRendition({ db: d1, bucket }, {
      ...representativeProvision,
      articleTitle,
    });

    const stored = sqlite.prepare(`SELECT article_title AS articleTitle
      FROM legal_provision_renditions WHERE id=?`)
      .get(representativeProvision.provisionRenditionId) as { articleTitle: string };
    assert.equal(stored.articleTitle, articleTitle);
  } finally {
    sqlite.close();
  }
});

test("a Russian translation is presented while its material proposition resolves to controlling Uzbek", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    const controlling = {
      ...representativeProvision,
      officialExpressionId: "expression-labor-code-uz-latn",
      textRevisionId: "revision-labor-code-uz-latn-2026-01-01",
      provisionRenditionId: "rendition-labor-code-uz-latn-2026-article-10",
      captureId: "lex-100-uz-latn-2026-01-01",
      languageTag: "uz-Latn" as const,
      script: "Latn" as const,
      textualAuthority: "controlling" as const,
      origin: "certified_original" as const,
      controllingOnConflict: true,
      derivedFromExpressionId: null,
      authorityEvidence: {
        kind: "publisher_certification" as const,
        sourceUrl: "https://lex.uz/docs/100",
        recordedAt: "2026-08-30T00:00:00.000Z",
      },
      provisionText: "10-modda. Mehnat shartnomasi faqat qonunda belgilangan asoslar bo'yicha bekor qilinadi.",
      rawCapture: "<html><body>10-modda. Mehnat shartnomasi faqat qonunda belgilangan asoslar bo'yicha bekor qilinadi.</body></html>",
      sourceUrl: "https://lex.uz/docs/100",
    };
    await importProvisionRendition({ db: d1, bucket }, controlling);
    const disagreeingTranslation = {
      ...representativeProvision,
      provisionText: "Статья 10. Перевод ошибочно утверждает, что прекращение разрешено всегда.",
      rawCapture: "<html><body>Статья 10. Перевод ошибочно утверждает, что прекращение разрешено всегда.</body></html>",
    };
    await importProvisionRendition({ db: d1, bucket }, disagreeingTranslation);
    await markCurrent(d1, controlling);
    await markCurrent(d1, disagreeingTranslation);

    const service = {
      fetch(input: RequestInfo | URL, init?: RequestInit) {
        return handleOfficialEvidenceRequest(new Request(input, init), {
          APP_ENV: "development",
          LEGAL_DB: d1,
          LEGAL_EVIDENCE_BUCKET: bucket,
        });
      },
    } as Fetcher;
    const result = await createOfficialEvidenceClient({
      service,
      environment: "development",
    }).resolveControlling(representativeProvision.provisionRenditionId);

    assert.equal(result.controlling.provisionText, controlling.provisionText);
    assert.equal(result.controlling.languageTag, "uz-Latn");
    assert.equal(result.controlling.textualAuthority, "controlling");
    assert.equal(result.translation?.provisionText, disagreeingTranslation.provisionText);
    assert.equal(result.translation?.textualAuthority, "official_translation");
    assert.equal(result.translationLabel, "Official Translation");
    assert.equal(result.materialCitation.url, controlling.sourceUrl);
  } finally {
    sqlite.close();
  }
});

test("historical Uzbek Cyrillic authority evidence controls despite a misleading route prefix", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    const cyrillic = {
      ...representativeProvision,
      officialExpressionId: "expression-labor-code-uz-cyrl",
      textRevisionId: "revision-labor-code-uz-cyrl-1998-05-01-1",
      provisionRenditionId: "rendition-labor-code-uz-cyrl-1998-article-10",
      captureId: "lex-100-uz-cyrl-1998-05-01-1",
      publisherRevisionToken: "1998-05-01-1",
      languageTag: "uz-Cyrl" as const,
      script: "Cyrl" as const,
      textualAuthority: "controlling" as const,
      origin: "adopted_original" as const,
      controllingOnConflict: true,
      derivedFromExpressionId: null,
      authorityEvidence: {
        kind: "adoption_record" as const,
        sourceUrl: "https://lex.uz/ru/docs/101",
        recordedAt: "2026-08-30T00:00:00.000Z",
      },
      provisionText: "10-модда. Назорат қилувчи тарихий матн.",
      rawCapture: "<html><body>10-модда. Назорат қилувчи тарихий матн.</body></html>",
      sourceUrl: "https://lex.uz/ru/docs/101",
    };
    const russian = {
      ...representativeProvision,
      legalInstrumentId: cyrillic.legalInstrumentId,
      provisionConceptId: cyrillic.provisionConceptId,
      derivedFromExpressionId: cyrillic.officialExpressionId,
    };
    await importProvisionRendition({ db: d1, bucket }, cyrillic);
    await importProvisionRendition({ db: d1, bucket }, russian);
    await markCurrent(d1, cyrillic);
    await markCurrent(d1, russian);

    const result = await (async () => {
      const service = {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          return handleOfficialEvidenceRequest(new Request(input, init), {
            APP_ENV: "development",
            LEGAL_DB: d1,
            LEGAL_EVIDENCE_BUCKET: bucket,
          });
        },
      } as Fetcher;
      return createOfficialEvidenceClient({ service, environment: "development" })
        .resolveControlling(russian.provisionRenditionId);
    })();

    assert.equal(result.controlling.languageTag, "uz-Cyrl");
    assert.equal(result.controlling.script, "Cyrl");
    assert.equal(result.materialCitation.url, "https://lex.uz/ru/docs/101");
  } finally {
    sqlite.close();
  }
});

test("unknown textual authority is ineligible and cannot silently become controlling evidence", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    const unknown = {
      ...representativeProvision,
      officialExpressionId: "expression-labor-code-unknown",
      textRevisionId: "revision-labor-code-unknown",
      provisionRenditionId: "rendition-labor-code-unknown",
      captureId: "lex-100-unknown",
      textualAuthority: "unknown" as const,
      origin: "unknown" as const,
      publicationStatus: "unknown" as const,
      controllingOnConflict: false,
      derivedFromExpressionId: null,
      authorityEvidence: null,
    };
    await importProvisionRendition({ db: d1, bucket }, unknown);
    const service = {
      fetch(input: RequestInfo | URL, init?: RequestInit) {
        return handleOfficialEvidenceRequest(new Request(input, init), {
          APP_ENV: "development",
          LEGAL_DB: d1,
          LEGAL_EVIDENCE_BUCKET: bucket,
        });
      },
    } as Fetcher;
    await assert.rejects(
      () => createOfficialEvidenceClient({ service, environment: "development" })
        .resolveControlling(unknown.provisionRenditionId),
      /SOURCE_UNAVAILABILITY/u,
    );
    const eligibility = sqlite.prepare(`SELECT status,reason_codes_json AS reasons
      FROM legal_official_eligibility WHERE subject_id=?`).get(
      unknown.provisionRenditionId,
    ) as { status: string; reasons: string };
    assert.equal(eligibility.status, "ineligible");
    assert.equal(
      eligibility.reasons,
      '["TEXTUAL_AUTHORITY_UNKNOWN","PUBLICATION_STATUS_UNKNOWN","ORIGIN_UNKNOWN"]',
    );
  } finally {
    sqlite.close();
  }
});

test("immutable evidence rejects a different-byte overwrite", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    await importProvisionRendition({ db: d1, bucket }, representativeProvision);
    await assert.rejects(
      () => importProvisionRendition({ db: d1, bucket }, {
        ...representativeProvision,
        provisionText: `${representativeProvision.provisionText} Изменено.`,
      }),
      (error: unknown) => error instanceof Error
        && error.message === "IMMUTABLE_EVIDENCE_CONFLICT",
    );
  } finally {
    sqlite.close();
  }
});

test("a mismatched declared source-normalized hash is rejected before evidence is written", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    await assert.rejects(
      () => importProvisionRendition({ db: d1, bucket }, {
        ...representativeProvision,
        sourceNormalizedSha256: "0".repeat(64),
      }),
      (error: unknown) => error instanceof Error
        && error.message === "SOURCE_UNAVAILABILITY",
    );
    assert.equal(bucket.objects.size, 0);
    const rows = sqlite.prepare("SELECT COUNT(*) AS count FROM legal_evidence_locators").get() as {
      count: number;
    };
    assert.equal(rows.count, 0);
  } finally {
    sqlite.close();
  }
});

test("a mismatched declared raw-source hash is rejected before evidence is written", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    await assert.rejects(
      () => importProvisionRendition({ db: d1, bucket }, {
        ...representativeProvision,
        sourceRawSha256: "0".repeat(64),
      }),
      /SOURCE_UNAVAILABILITY/u,
    );
    assert.equal(bucket.objects.size, 0);
  } finally {
    sqlite.close();
  }
});

test("a mismatched declared provision hash is rejected before evidence is written", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    await assert.rejects(
      () => importProvisionRendition({ db: d1, bucket }, {
        ...representativeProvision,
        sourceProvisionSha256: "0".repeat(64),
      }),
      /SOURCE_UNAVAILABILITY/u,
    );
    assert.equal(bucket.objects.size, 0);
  } finally {
    sqlite.close();
  }
});

test("a current rendition retains source status and verified temporal provenance", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  const verifiedAt = "2026-08-31T06:26:27.225Z";
  try {
    const temporalInput = {
      ...representativeProvision,
      renditionStatus: "active" as const,
      sourceProvisionSha256: createHash("sha256")
        .update(representativeProvision.provisionText)
        .digest("hex"),
      editorialValidity: {
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
        recordedAt: verifiedAt,
      },
      applicability: {
        id: `applicability:${representativeProvision.provisionRenditionId}`,
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
        evidenceUrl: representativeProvision.sourceUrl,
        evidenceKind: "official_timeline" as const,
        recordedAt: verifiedAt,
      },
      currentPointer: {
        evidenceUrl: representativeProvision.sourceUrl,
        verifiedAt,
        recordedAt: verifiedAt,
      },
    };
    await importProvisionRendition({ db: d1, bucket }, temporalInput);
    await importProvisionRendition({ db: d1, bucket }, temporalInput);

    assert.equal((sqlite.prepare(`SELECT status FROM legal_provision_renditions WHERE id=?`)
      .get(representativeProvision.provisionRenditionId) as { status: string }).status, "active");
    const validity = sqlite.prepare(`SELECT valid_from AS validFrom,valid_to AS validTo
      FROM legal_text_revision_validity WHERE text_revision_id=?`)
      .get(representativeProvision.textRevisionId) as { validFrom: string; validTo: string | null };
    assert.equal(validity.validFrom, "2026-01-01T00:00:00.000Z");
    assert.equal(validity.validTo, null);
    assert.equal((sqlite.prepare(`SELECT evidence_kind AS evidenceKind
      FROM legal_applicability_periods WHERE provision_rendition_id=?`)
      .get(representativeProvision.provisionRenditionId) as { evidenceKind: string }).evidenceKind,
    "official_timeline");
    assert.equal((sqlite.prepare(`SELECT verified_at AS verifiedAt
      FROM legal_current_provision_pointers WHERE provision_rendition_id=?`)
      .get(representativeProvision.provisionRenditionId) as { verifiedAt: string }).verifiedAt,
    verifiedAt);
    assert.equal((sqlite.prepare(`SELECT COUNT(*) AS count FROM legal_applicability_periods`)
      .get() as { count: number }).count, 1);
  } finally {
    sqlite.close();
  }
});

test("unknown applicability is explicit and the source rendition status cannot drift on replay", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  const unknown = {
    ...representativeProvision,
    renditionStatus: "active" as const,
    temporalGap: {
      id: `gap:${representativeProvision.provisionRenditionId}`,
      kind: "unknown" as const,
      evidenceUrl: representativeProvision.sourceUrl,
      reason: "The cutoff source does not establish a verified applicability interval.",
      recordedAt: "2026-08-31T06:26:27.225Z",
    },
    currentPointer: {
      evidenceUrl: representativeProvision.sourceUrl,
      verifiedAt: "2026-08-31T06:26:27.225Z",
      recordedAt: "2026-08-31T06:26:27.225Z",
    },
  };
  try {
    await importProvisionRendition({ db: d1, bucket }, unknown);
    assert.equal((sqlite.prepare(`SELECT status FROM legal_provision_renditions WHERE id=?`)
      .get(representativeProvision.provisionRenditionId) as { status: string }).status, "active");
    assert.equal((sqlite.prepare(`SELECT gap_kind AS gapKind,status FROM legal_temporal_coverage_gaps
      WHERE provision_rendition_id=?`).get(representativeProvision.provisionRenditionId) as {
      gapKind: string;
      status: string;
    }).gapKind, "unknown");
    assert.deepEqual(sqlite.prepare(`SELECT capability,status,reason_codes_json AS reasons
      FROM legal_official_eligibility WHERE subject_id=? ORDER BY capability`)
      .all(representativeProvision.provisionRenditionId).map((row) => ({ ...row })), [
      {
        capability: "as_of",
        status: "gap",
        reasons: '["TEMPORAL_UNKNOWN"]',
      },
      {
        capability: "current",
        status: "eligible",
        reasons: "[]",
      },
    ]);
    await assert.rejects(
      () => importProvisionRendition({ db: d1, bucket }, { ...unknown, renditionStatus: "unknown" }),
      /LEGAL_EVIDENCE_IDENTITY_CONFLICT/u,
    );
  } finally {
    sqlite.close();
  }
});

test("a complete revision import shares verified source evidence and restarts idempotently", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  const secondProvision = {
    ...representativeProvision,
    provisionConceptId: "concept-labor-code-article-11",
    publisherProvisionToken: "article-11",
    provisionRenditionId: "rendition-labor-code-ru-2026-article-11",
    articleNumber: "11",
    articleTitle: "Срок трудового договора",
    provisionSequence: 11,
    provisionText: "Статья 11. Срок трудового договора определяется законом.",
  };
  try {
    const first = await importProvisionRevision(
      { db: d1, bucket },
      [migrationProvision(), migrationProvision(secondProvision)],
    );
    assert.equal(bucket.putCalls, 4, "shared revision evidence is written once per import");
    const repeated = await importProvisionRevision(
      { db: d1, bucket },
      [migrationProvision(), migrationProvision(secondProvision)],
    );
    assert.deepEqual(repeated, first);
    assert.equal(first.provisionCount, 2);
    assert.equal(bucket.putCalls, 8, "restart repeats only create-only object checks");
    assert.equal(bucket.objects.size, 4, "one raw, one normalized, and two rendition objects");
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM legal_text_revisions").get() as {
      count: number;
    }).count, 1);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM legal_provision_renditions").get() as {
      count: number;
    }).count, 2);
    const cutoff = sqlite.prepare(`SELECT migration_run_id AS migrationRunId,
      cutoff_at AS cutoffAt FROM legal_migration_cutoffs WHERE scope='current'`).get();
    assert.deepEqual({ ...cutoff }, {
      migrationRunId: "ticket-12-current-20260831t062627z",
      cutoffAt: migrationCutoff,
    });
  } finally {
    sqlite.close();
  }
});

test("revision replay verifies an existing object when a remote conditional put throws", async () => {
  class ThrowingConditionalBucket extends MemoryEvidenceBucket {
    override async put(
      key: string,
      value: Uint8Array,
      options: Parameters<MemoryEvidenceBucket["put"]>[2],
    ) {
      if (this.objects.has(key)) throw new Error("REMOTE_PRECONDITION_TRANSPORT_ERROR");
      return super.put(key, value, options);
    }
  }
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new ThrowingConditionalBucket();
  try {
    const first = await importProvisionRevision(
      { db: d1, bucket },
      [migrationProvision(), migrationProvision({
        ...representativeProvision,
        provisionConceptId: "concept-labor-code-article-12",
        publisherProvisionToken: "article-12",
        provisionRenditionId: "rendition-labor-code-ru-2026-article-12",
        articleNumber: "12",
        provisionSequence: 12,
        provisionText: "Статья 12. Проверка повторного импорта.",
      })],
    );
    const repeated = await importProvisionRevision(
      { db: d1, bucket },
      [migrationProvision()],
    );
    assert.equal(first.provisionCount, 2);
    assert.equal(repeated.provisionCount, 1);
  } finally {
    sqlite.close();
  }
});

test("current revision migration requires explicit byte and cutoff-pinned temporal evidence", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    await assert.rejects(
      () => importProvisionRevision({ db: d1, bucket }, [representativeProvision]),
      /Invalid input/u,
    );
    await assert.rejects(
      () => importProvisionRevision({ db: d1, bucket }, [{
        ...migrationProvision(),
        currentPointer: {
          ...migrationProvision().currentPointer,
          verifiedAt: "2026-08-31T06:26:27.226Z",
        },
      }]),
      /cutoff/u,
    );
    await assert.rejects(
      () => importProvisionRevision({ db: d1, bucket }, [{
        ...migrationProvision(),
        applicability: {
          ...migrationProvision().applicability,
          validFrom: "2026-02-01T00:00:00.000Z",
          validTo: "2026-01-01T00:00:00.000Z",
        },
      }]),
      /non-empty interval/u,
    );
    assert.equal(bucket.objects.size, 0);
  } finally {
    sqlite.close();
  }
});

test("current revision migration rejects a page larger than the D1 checkpoint budget", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    const input = migrationProvision();
    await assert.rejects(
      () => importProvisionRevision({ db: d1, bucket }, Array.from({ length: 49 }, () => input)),
      /Too big/u,
    );
    assert.equal(bucket.objects.size, 0);
  } finally {
    sqlite.close();
  }
});

test("replay rejects drift in immutable canonical and provenance metadata", async () => {
  const changes = [
    { canonicalInstrumentTitle: "Changed canonical title" },
    { documentType: "changed-type" },
    { canonicalInstrumentUrl: "https://lex.uz/docs/101" },
    { origin: "unknown" as const },
    { publicationStatus: "withdrawn" as const },
    { capturedAt: "2026-08-29T00:00:00.000Z" },
  ];
  for (const change of changes) {
    const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
      new URL("../legal-drizzle/", import.meta.url),
    );
    const bucket = new MemoryEvidenceBucket();
    try {
      await importProvisionRendition({ db: d1, bucket }, representativeProvision);
      await assert.rejects(
        () => importProvisionRendition({ db: d1, bucket }, {
          ...representativeProvision,
          ...change,
        }),
        /LEGAL_EVIDENCE_IDENTITY_CONFLICT/u,
      );
    } finally {
      sqlite.close();
    }
  }
});

test("separate revision calls cannot mix immutable current-baseline migration runs", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  const input = migrationProvision();
  try {
    await importProvisionRevision({ db: d1, bucket }, [input]);
    const objectCount = bucket.objects.size;
    await assert.rejects(
      () => importProvisionRevision({ db: d1, bucket }, [{
        ...input,
        migrationRunId: "ticket-12-current-later-run",
      }]),
      /LEGAL_EVIDENCE_IDENTITY_CONFLICT/u,
    );
    assert.equal(bucket.objects.size, objectCount);
  } finally {
    sqlite.close();
  }
});

test("current eligibility rejects superseded, withdrawn, unknown-origin, and unproven authority", async () => {
  const unsafe = [
    { change: { renditionStatus: "historical" as const }, reason: "RENDITION_STATUS_HISTORICAL" },
    { change: { renditionStatus: "repealed" as const }, reason: "RENDITION_STATUS_REPEALED" },
    { change: { publicationStatus: "withdrawn" as const }, reason: "PUBLICATION_STATUS_WITHDRAWN" },
    { change: { origin: "unknown" as const }, reason: "ORIGIN_UNKNOWN" },
    { change: { authorityEvidence: null }, reason: "AUTHORITY_EVIDENCE_MISSING" },
  ];
  for (const { change, reason } of unsafe) {
    const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
      new URL("../legal-drizzle/", import.meta.url),
    );
    const bucket = new MemoryEvidenceBucket();
    try {
      await importProvisionRendition({ db: d1, bucket }, {
        ...representativeProvision,
        ...change,
        applicability: {
          id: `applicability:${representativeProvision.provisionRenditionId}`,
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: null,
          evidenceUrl: representativeProvision.sourceUrl,
          evidenceKind: "official_timeline" as const,
          recordedAt: migrationCutoff,
        },
        currentPointer: {
          evidenceUrl: representativeProvision.sourceUrl,
          verifiedAt: migrationCutoff,
          recordedAt: migrationCutoff,
        },
      });
      const eligibility = sqlite.prepare(`SELECT status,reason_codes_json AS reasons
        FROM legal_official_eligibility
        WHERE subject_id=? AND capability='current'`)
        .get(representativeProvision.provisionRenditionId) as {
        status: string;
        reasons: string;
      };
      assert.equal(eligibility.status, "ineligible");
      assert.ok((JSON.parse(eligibility.reasons) as string[]).includes(reason));
    } finally {
      sqlite.close();
    }
  }
});

test("shared target creation provenance is independent of revision import order", async () => {
  const first = migrationProvision();
  const second = migrationProvision({
    textRevisionId: "revision-labor-code-ru-2026-02-01",
    provisionRenditionId: "rendition-labor-code-ru-2026-02-article-10",
    captureId: "lex-100-2026-02-01",
    publisherRevisionToken: "2026-02-01",
    capturedAt: "2026-08-30T01:00:00.000Z",
  });
  const forward = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const reverse = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const forwardBucket = new MemoryEvidenceBucket();
  const reverseBucket = new MemoryEvidenceBucket();
  try {
    for (const input of [first, second]) {
      await importProvisionRevision({ db: forward.d1, bucket: forwardBucket }, [input]);
    }
    for (const input of [second, first]) {
      await importProvisionRevision({ db: reverse.d1, bucket: reverseBucket }, [input]);
    }
    const provenanceSql = `SELECT 'instrument' AS kind,id,created_at AS createdAt
      FROM legal_instruments UNION ALL
      SELECT 'expression',id,created_at FROM legal_official_expressions UNION ALL
      SELECT 'concept',id,created_at FROM legal_provision_concepts ORDER BY kind,id`;
    const forwardRows = forward.sqlite.prepare(provenanceSql).all().map((row) => ({ ...row }));
    const reverseRows = reverse.sqlite.prepare(provenanceSql).all().map((row) => ({ ...row }));
    assert.deepEqual(forwardRows, reverseRows);
    assert.ok(forwardRows.every((row) => row.createdAt === migrationCutoff));
  } finally {
    forward.sqlite.close();
    reverse.sqlite.close();
  }
});

test("revision migration restarts identically after a partial R2 write failure", async () => {
  class FailAfterSharedEvidenceBucket extends MemoryEvidenceBucket {
    failed = false;

    override async put(
      key: string,
      value: Uint8Array,
      options: Parameters<MemoryEvidenceBucket["put"]>[2],
    ) {
      if (!this.failed && this.putCalls === 2) {
        this.failed = true;
        throw new Error("INJECTED_PARTIAL_WRITE_FAILURE");
      }
      return super.put(key, value, options);
    }
  }
  const firstInput = migrationProvision();
  const secondInput = migrationProvision({
    provisionConceptId: "concept-labor-code-article-13",
    publisherProvisionToken: "article-13",
    provisionRenditionId: "rendition-labor-code-ru-2026-article-13",
    articleNumber: "13",
    provisionSequence: 13,
    provisionText: "Статья 13. Проверка возобновления после частичной ошибки.",
  });
  const interrupted = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const clean = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const interruptedBucket = new FailAfterSharedEvidenceBucket();
  const cleanBucket = new MemoryEvidenceBucket();
  try {
    await assert.rejects(
      () => importProvisionRevision(
        { db: interrupted.d1, bucket: interruptedBucket },
        [firstInput, secondInput],
      ),
      /INJECTED_PARTIAL_WRITE_FAILURE/u,
    );
    const restarted = await importProvisionRevision(
      { db: interrupted.d1, bucket: interruptedBucket },
      [firstInput, secondInput],
    );
    const expected = await importProvisionRevision(
      { db: clean.d1, bucket: cleanBucket },
      [firstInput, secondInput],
    );
    assert.deepEqual(restarted, expected);
    assert.deepEqual(
      [...interruptedBucket.objects.entries()],
      [...cleanBucket.objects.entries()],
    );
    const inventorySql = `SELECT id FROM legal_evidence_locators
      UNION ALL SELECT id FROM legal_instruments
      UNION ALL SELECT id FROM legal_official_expressions
      UNION ALL SELECT id FROM legal_text_revisions
      UNION ALL SELECT id FROM legal_provision_concepts
      UNION ALL SELECT id FROM legal_provision_renditions
      UNION ALL SELECT id FROM legal_applicability_periods
      UNION ALL SELECT id FROM legal_official_eligibility ORDER BY id`;
    assert.deepEqual(
      interrupted.sqlite.prepare(inventorySql).all(),
      clean.sqlite.prepare(inventorySql).all(),
    );
  } finally {
    interrupted.sqlite.close();
    clean.sqlite.close();
  }
});

for (const corruption of ["missing", "size", "content", "source-hash"] as const) {
  test(`${corruption} evidence corruption becomes Source Unavailability`, async () => {
    const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
      new URL("../legal-drizzle/", import.meta.url),
    );
    const bucket = new MemoryEvidenceBucket();
    try {
      const imported = await importProvisionRendition(
        { db: d1, bucket },
        representativeProvision,
      );
      const stored = bucket.objects.get(imported.provisionLocator.r2Key)!;
      if (corruption === "missing") {
        bucket.objects.delete(imported.provisionLocator.r2Key);
      } else if (corruption === "size") {
        const changed = new Uint8Array(stored.bytes.byteLength + 1);
        changed.set(stored.bytes);
        changed[changed.byteLength - 1] = 1;
        stored.bytes = changed;
      } else if (corruption === "content") {
        stored.bytes[0] = stored.bytes[0] === 123 ? 91 : 123;
      } else {
        sqlite.exec("DROP TRIGGER legal_evidence_locators_no_update");
        sqlite.prepare(`UPDATE legal_evidence_locators
          SET source_normalized_sha256=? WHERE id=?`).run(
          "0".repeat(64),
          imported.provisionLocator.id,
        );
      }

      const service = {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          return handleOfficialEvidenceRequest(new Request(input, init), {
            APP_ENV: "development",
            LEGAL_DB: d1,
            LEGAL_EVIDENCE_BUCKET: bucket,
          });
        },
      } as Fetcher;
      await assert.rejects(
        () => createOfficialEvidenceClient({
          service,
          environment: "development",
        }).resolve(representativeProvision.provisionRenditionId),
        (error: unknown) => error instanceof Error
          && error.message === "SOURCE_UNAVAILABILITY",
      );
    } finally {
      sqlite.close();
    }
  });
}
