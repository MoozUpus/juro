import assert from "node:assert/strict";
import test from "node:test";

import {
  createOfficialEvidenceClient,
  handleOfficialEvidenceRequest,
  importProvisionRendition,
} from "../lib/legal-corpus/target-evidence";
import { recordProvisionTemporalEvidence } from "../lib/legal-corpus/target-temporal";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";
import { MemoryEvidenceBucket, representativeProvision } from "./helpers/legal-target";

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
    assert.equal(eligibility.reasons, '["TEXTUAL_AUTHORITY_UNKNOWN"]');
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
