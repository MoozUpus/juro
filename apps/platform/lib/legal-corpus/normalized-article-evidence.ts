import { completeArticleText } from "../legal/article-context";
import { normalizedLegalSourceSnapshotSchema } from "../legal/source-parser";
import type { LegalEvidenceBucket, ResolvedOfficialEvidence } from "./target-evidence";

/** Request-local recovery from the exact accepted parent snapshot. No lookup
 * result or live page can replace the parent hash anchored by the rendition. */
export function createNormalizedArticleEvidenceReader(bucket: Pick<LegalEvidenceBucket, "get">) {
  let reservedBytes = 0;
  const snapshots = new Map<string, Promise<{
    snapshot: ReturnType<typeof normalizedLegalSourceSnapshotSchema.parse>;
    r2Key: string; byteCount: number; sha256: string;
  } | null>>();
  return async (original: ResolvedOfficialEvidence, article: string,
    sourceRevisionId: string = original.textRevisionId): Promise<ResolvedOfficialEvidence | null> => {
    if (!/:\s*$/u.test(original.provisionText)) return null;
    const r2Key = `corpus/normalized/${sourceRevisionId}.json`;
    const sha256 = original.evidence.sourceNormalizedSha256;
    const key = `${r2Key}:${sha256}`;
    let pending = snapshots.get(key);
    if (!pending) {
      if (snapshots.size >= 3) return null;
      pending = (async () => {
        const startedAt = Date.now();
        try {
          const object = await bucket.get(r2Key);
          if (!object || object.size > 4_000_000 || reservedBytes + object.size > 8_000_000) return null;
          reservedBytes += object.size;
          const bytes = await object.bytes();
          if (bytes.byteLength !== object.size) return null;
          const actual = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
          if ([...new Uint8Array(actual)].map(byte => byte.toString(16).padStart(2, "0")).join("") !== sha256) return null;
          const snapshot = normalizedLegalSourceSnapshotSchema.parse(JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
          console.info(JSON.stringify({event: "legal.normalized_article_snapshot_verified",
            byteCount: bytes.byteLength, elapsedMs: Date.now() - startedAt}));
          return {snapshot, r2Key, byteCount: bytes.byteLength, sha256};
        } catch { return null; }
      })();
      snapshots.set(key, pending);
    }
    const parent = await pending;
    if (!parent || parent.snapshot.source.sourceKind !== "lex"
      || parent.snapshot.source.canonicalUrl !== original.officialCitation.url
      || ({ru: "ru", uz: "uz-Latn", uzc: "uz-Cyrl", en: "en"} as const)[parent.snapshot.source.locale] !== original.languageTag) return null;
    const context = completeArticleText(parent.snapshot.blocks, article, original.provisionText);
    if (!context) return null;
    console.info(JSON.stringify({event: "legal.article_context_resolved",
      originalCharacters: original.provisionText.length, contextCharacters: context.text.length}));
    return {...original, provisionText: context.text, evidence: {...original.evidence,
      r2Key: parent.r2Key, byteCount: parent.byteCount, sha256: parent.sha256}};
  };
}
