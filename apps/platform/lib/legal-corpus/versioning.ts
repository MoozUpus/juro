import { normalizeArticleNumber } from "../legal/legal-language";

export type CorpusProvisionSnapshot = {
  articleNumber: string | null;
  title: string | null;
  text: string;
  sequence: number;
};

export type CorpusProvisionChange =
  | "new"
  | "modified"
  | "repealed"
  | "renumbered"
  | "moved"
  | "metadata_changed"
  | "unchanged";

export type CorpusVersionDiff = {
  suspiciousShrink: boolean;
  changes: Array<{
    articleNumber: string | null;
    previousArticleNumber: string | null;
    change: CorpusProvisionChange;
  }>;
};

const SUSPICIOUS_SHRINK_RATIO = 0.55;

function normalizedNumber(value: string | null): string | null {
  if (!value) return null;
  return normalizeArticleNumber(value) || value.trim();
}

function textFingerprint(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function totalText(snapshot: readonly CorpusProvisionSnapshot[]): number {
  return snapshot.reduce((sum, provision) => sum + textFingerprint(provision.text).length, 0);
}

/**
 * Compares provision snapshots without deleting historical rows. A parser that
 * suddenly loses almost half of a document is reported as suspicious so the
 * ingestion run can halt before publishing or reindexing it.
 */
export function diffCorpusProvisions(
  previous: readonly CorpusProvisionSnapshot[],
  next: readonly CorpusProvisionSnapshot[],
): CorpusVersionDiff {
  const previousByNumber = new Map(
    previous.map((provision) => [normalizedNumber(provision.articleNumber), provision]),
  );
  const consumedPrevious = new Set<CorpusProvisionSnapshot>();
  const changes: CorpusVersionDiff["changes"] = [];

  for (const provision of next) {
    const articleNumber = normalizedNumber(provision.articleNumber);
    const direct = previousByNumber.get(articleNumber);
    if (direct) {
      consumedPrevious.add(direct);
      const textChanged = textFingerprint(direct.text) !== textFingerprint(provision.text);
      const moved = direct.sequence !== provision.sequence;
      changes.push({
        articleNumber,
        previousArticleNumber: articleNumber,
        change: textChanged ? "modified" : moved ? "moved" : "unchanged",
      });
      continue;
    }

    const renumbered = previous.find((candidate) =>
      !consumedPrevious.has(candidate)
      && textFingerprint(candidate.text) === textFingerprint(provision.text),
    );
    if (renumbered) {
      consumedPrevious.add(renumbered);
      changes.push({
        articleNumber,
        previousArticleNumber: normalizedNumber(renumbered.articleNumber),
        change: "renumbered",
      });
      continue;
    }

    changes.push({ articleNumber, previousArticleNumber: null, change: "new" });
  }

  for (const provision of previous) {
    if (consumedPrevious.has(provision)) continue;
    const number = normalizedNumber(provision.articleNumber);
    if (next.some((candidate) => normalizedNumber(candidate.articleNumber) === number)) continue;
    changes.push({ articleNumber: number, previousArticleNumber: number, change: "repealed" });
  }

  const oldLength = totalText(previous);
  const newLength = totalText(next);
  return {
    suspiciousShrink: oldLength > 0 && newLength / oldLength < SUSPICIOUS_SHRINK_RATIO,
    changes,
  };
}
