import type {
  LegalEvidenceBucket,
  LegalEvidenceObject,
} from "../../lib/legal-corpus/target-evidence";
import { importProvisionRendition } from "../../lib/legal-corpus/target-evidence";
import { recordProvisionTemporalEvidence } from "../../lib/legal-corpus/target-temporal";

export class MemoryEvidenceBucket implements LegalEvidenceBucket {
  readonly objects = new Map<string, { bytes: Uint8Array; customMetadata: Record<string, string> }>();
  putCalls = 0;

  async head(key: string): Promise<LegalEvidenceObject | null> {
    const stored = this.objects.get(key);
    return stored ? this.object(key, stored) : null;
  }

  async get(key: string): Promise<LegalEvidenceObject | null> {
    const stored = this.objects.get(key);
    return stored ? this.object(key, stored) : null;
  }

  async put(
    key: string,
    value: Uint8Array,
    options: { onlyIf: { etagDoesNotMatch: "*" }; customMetadata: Record<string, string> },
  ): Promise<LegalEvidenceObject | null> {
    this.putCalls += 1;
    if (this.objects.has(key) && options.onlyIf.etagDoesNotMatch === "*") return null;
    const stored = { bytes: value.slice(), customMetadata: { ...options.customMetadata } };
    this.objects.set(key, stored);
    return this.object(key, stored);
  }

  private object(
    key: string,
    stored: { bytes: Uint8Array; customMetadata: Record<string, string> },
  ): LegalEvidenceObject {
    return {
      key,
      size: stored.bytes.byteLength,
      customMetadata: { ...stored.customMetadata },
      bytes: async () => stored.bytes.slice(),
    };
  }
}

export const representativeProvision = {
  legalInstrumentId: "instrument-labor-code",
  publisherInstrumentToken: "lex-document-100",
  officialExpressionId: "expression-labor-code-ru",
  textRevisionId: "revision-labor-code-ru-2026-01-01",
  provisionConceptId: "concept-labor-code-article-10",
  publisherProvisionToken: "article-10",
  provisionRenditionId: "rendition-labor-code-ru-2026-article-10",
  captureId: "lex-100-2026-01-01",
  publisherRevisionToken: "2026-01-01",
  languageTag: "ru",
  script: "Cyrl",
  textualAuthority: "official_translation",
  origin: "official_publisher",
  publicationStatus: "official",
  controllingOnConflict: false,
  derivedFromExpressionId: "expression-labor-code-uz-latn",
  authorityEvidence: {
    kind: "official_publication",
    sourceUrl: "https://lex.uz/ru/docs/100",
    recordedAt: "2026-08-30T00:00:00.000Z",
  },
  canonicalInstrumentTitle: "Трудовой кодекс Республики Узбекистан",
  actTitle: "Трудовой кодекс Республики Узбекистан",
  documentType: "code",
  articleNumber: "10",
  articleTitle: "Прекращение трудового договора",
  provisionSequence: 10,
  provisionText: "Статья 10. Трудовой договор прекращается только по основаниям, установленным законом.",
  normalizedRevision: `${JSON.stringify({
    schemaVersion: 1,
    text: "Статья 10. Трудовой договор прекращается только по основаниям, установленным законом.",
  })}\n`,
  rawCapture: "<html><body>Статья 10. Трудовой договор прекращается только по основаниям, установленным законом.</body></html>",
  sourceUrl: "https://lex.uz/ru/docs/100",
  canonicalInstrumentUrl: "https://lex.uz/docs/100",
  capturedAt: "2026-08-30T00:00:00.000Z",
} as const;

export async function importCurrentRepresentativeProvision(dependencies: {
  db: D1Database;
  bucket: LegalEvidenceBucket;
}) {
  const imported = await importProvisionRendition(dependencies, representativeProvision);
  await recordProvisionTemporalEvidence({ db: dependencies.db }, {
    id: `temporal:${representativeProvision.provisionRenditionId}`,
    textRevisionId: representativeProvision.textRevisionId,
    provisionRenditionId: representativeProvision.provisionRenditionId,
    editorialValidFrom: "2026-01-01T00:00:00.000Z",
    editorialValidTo: null,
    applicability: {
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: null,
      evidenceUrl: representativeProvision.sourceUrl,
      evidenceKind: "official_timeline",
    },
    currentPointer: {
      evidenceUrl: representativeProvision.sourceUrl,
      verifiedAt: representativeProvision.capturedAt,
    },
    recordedAt: representativeProvision.capturedAt,
  });
  return imported;
}
