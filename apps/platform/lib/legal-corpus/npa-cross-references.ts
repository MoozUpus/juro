import { NPA_FUTURE_TARGETS, NPA_MASTER_TARGETS } from "./npa-master-registry";

export type ExtractedNpaCrossReference = Readonly<{
  relationType: "refers_to";
  targetDocumentKey: string | null;
  targetArticle: string | null;
  rawReference: string;
  resolutionStatus: "resolved" | "unresolved" | "ambiguous";
}>;

const ARTICLE = "[0-9]+(?:[-.][0-9]+)*";

function unique<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function trimmedReference(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 1_000);
}

function escapedTitle(title: string): string {
  return title.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
}

/**
 * Extracts only explicit statutory references.  It intentionally leaves a
 * citation unresolved if the named act is not one of the bounded JURO target
 * acts; retrieval can then preserve the reference without inventing a link.
 */
export function extractNpaCrossReferences(input: {
  text: string;
  sourceDocumentKey: string;
}): ExtractedNpaCrossReference[] {
  const found: ExtractedNpaCrossReference[] = [];
  const selfPatterns = [
    new RegExp(`стать(?:я|и|е|ей|ёй|ю)\\s+(${ARTICLE})\\s+(?:настоящ(?:его|ем|им|ей)\\s+(?:закона|кодекса|конституции))`, "giu"),
    new RegExp(`ушбу\\s+(?:қонун|қонуни|кодекс|кодексининг)\\s+(${ARTICLE})[- ]?модда`, "giu"),
  ];
  for (const pattern of selfPatterns) {
    for (const match of input.text.matchAll(pattern)) {
      found.push({
        relationType: "refers_to",
        targetDocumentKey: input.sourceDocumentKey,
        targetArticle: match[1] ?? null,
        rawReference: trimmedReference(match[0]),
        resolutionStatus: "resolved",
      });
    }
  }

  for (const target of [...NPA_MASTER_TARGETS, ...NPA_FUTURE_TARGETS]) {
    const titles = [target.titleRu, ...(target.titleAliases ?? [])];
    for (const title of titles) {
      const pattern = new RegExp(
        `(?:стать(?:я|и|е|ей|ёй|ю)\\s+(${ARTICLE})\\s+)?${escapedTitle(title)}`,
        "giu",
      );
      for (const match of input.text.matchAll(pattern)) {
        found.push({
          relationType: "refers_to",
          targetDocumentKey: target.documentKey,
          targetArticle: match[1] ?? null,
          rawReference: trimmedReference(match[0]),
          resolutionStatus: "resolved",
        });
      }
    }
  }
  return unique(found, (reference) => [
    reference.targetDocumentKey ?? "", reference.targetArticle ?? "", reference.rawReference,
  ].join("\n"));
}
