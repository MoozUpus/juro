const internalDisclosurePatterns = [
  /\b(?:OPENAI_API_KEY|AI_PROVIDER_API_KEY|ANTHROPIC_API_KEY|IDENTITY_KEYRING|QDRANT_API_KEY)\b/u,
  /\b(?:searchOfficialLex|getOfficialLexDocument|getOfficialLexArticle|getOfficialLexStructure|find_juro_legal_sources|inspect_juro_legal_act|read_juro_legal_provisions|createActionPlanDraft|startExistingDocumentTemplate)\b/u,
  /\b(?:verifiedSources|sourceSpanId|tool_choice|web_search_call|system_message|developer_message)\b/u,
  /(?:system|developer)\s+(?:prompt|message|instructions?)\s+(?:is|says|contains|:)/iu,
  /(?:скрыт\p{L}*|внутренн\p{L}*)\s+(?:инструкц\p{L}*|инструмент\p{L}*|промпт\p{L}*)\s*:/iu,
  /(?:yashirin|ichki)\s+(?:ko.?rsatma|vosita|prompt)\s*:/iu,
  /authorization\s*:\s*bearer\s+[a-z0-9._-]+/iu,
];

const instructionInjectionPatterns = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/iu,
  /reveal\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)/iu,
  /(?:call|invoke|enumerate|list)\s+(?:the\s+)?(?:hidden|internal)\s+tools?/iu,
  /(?:игнорируй|забудь)\s+(?:все\s+)?(?:предыдущ\p{L}*|системн\p{L}*)\s+инструкц\p{L}*/iu,
  /(?:раскрой|покажи|перечисли)\s+(?:скрыт\p{L}*|системн\p{L}*|внутренн\p{L}*)\s+(?:промпт\p{L}*|инструкц\p{L}*|инструмент\p{L}*)/iu,
];

/**
 * A follow-up question must ask for facts, never assert law. These markers are
 * a safety boundary, not a topic vocabulary: they reject any phrasing that
 * names an act or a provision, so a question cannot smuggle an ungrounded legal
 * premise past the source gate that just rejected the answer itself.
 */
const legalPremisePattern = /(?:стать\p{L}*|модда|modda|кодекс\p{L}*|kodeks\p{L}*|закон\p{L}*|qonun\p{L}*|постановлен\p{L}*|qaror\p{L}*|пункт\p{L}*|band\p{L}*)/iu;

export function assertsLegalPremise(value: string): boolean {
  return legalPremisePattern.test(value.normalize("NFKC"));
}

export function containsSensitiveAgentContent(value: string): boolean {
  const normalized = value.normalize("NFKC");
  return [...internalDisclosurePatterns, ...instructionInjectionPatterns]
    .some((pattern) => pattern.test(normalized));
}

/** Plain text used by the server's claim-to-span comparison and renderer. */
export function plainGroundedText(value: string): string {
  return value.normalize("NFKC")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]*\)/gu, "$1")
    .replace(/```(?:[\p{L}\p{N}_+-]+)?\s*([\s\S]*?)```/gu, "$1")
    .replace(/<[^>]*>/gu, " ")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gmu, "")
    .replace(/[*_~`]+/gu, "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Comparison form for provider-authored prose. Punctuation and whitespace do
 * not make two otherwise identical legal statements distinct.
 */
export function groundedTextComparisonKey(value: string): string {
  return plainGroundedText(value)
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim();
}

/**
 * Returns only the part of a block description that is not already present in
 * its title. Providers occasionally put the complete provision into both
 * fields; rendering or concatenating both would repeat the same sentence.
 */
export function nonRepeatingLegalDetail(title: string, detail: string): string {
  const normalizedTitle = plainGroundedText(title);
  const normalizedDetail = plainGroundedText(detail);
  const titleKey = groundedTextComparisonKey(normalizedTitle);
  const detailKey = groundedTextComparisonKey(normalizedDetail);
  if (!titleKey || titleKey === detailKey) return "";

  // A long title can itself be the opening sentence of the explanation. Strip
  // that prefix by words so harmless punctuation differences do not defeat
  // the comparison, while short section labels such as "Риск" stay intact.
  if (titleKey.length >= 32 && detailKey.startsWith(`${titleKey} `)) {
    const titleWords = normalizedTitle.match(/[\p{L}\p{N}]+/gu) ?? [];
    const escapedWords = titleWords.map((word) =>
      word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
    );
    if (escapedWords.length > 0) {
      const prefix = new RegExp(
        `^\\s*${escapedWords.join("[\\p{P}\\p{S}\\s]+")}[\\p{P}\\p{S}\\s]*`,
        "iu",
      );
      const remainder = normalizedDetail.replace(prefix, "").trim();
      if (remainder) return remainder;
    }
  }
  return normalizedDetail;
}

/** Joins a structured title/detail pair without duplicating shared prose. */
export function nonRepeatingLegalText(title: string, detail: string): string {
  const normalizedTitle = plainGroundedText(title);
  const uniqueDetail = nonRepeatingLegalDetail(normalizedTitle, detail);
  if (!uniqueDetail) return normalizedTitle;
  const heading = normalizedTitle.replace(/[.!?…:;]+$/gu, "").trim();
  return `${heading}. ${uniqueDetail}`.trim();
}

/** Provider-authored links are allowed only when the request already owns the source URL. */
export function containsUnvalidatedHttpLink(
  value: string,
  allowedUrls: ReadonlySet<string>,
): boolean {
  const candidates = value.match(/https?:\/\/[^\s)<>{}\]"']+/giu) ?? [];
  return candidates.some((candidate) => {
    const trimmed = candidate.replace(/[.,;:!?]+$/gu, "");
    try {
      return !allowedUrls.has(new URL(trimmed).href);
    } catch {
      return true;
    }
  });
}

export function sanitizeClarificationQuestions(
  values: readonly string[],
  locale: "ru" | "uz",
): string[] {
  const seen = new Set<string>();
  const safe: string[] = [];
  for (const value of values) {
    const question = value.normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 300);
    const key = question.toLocaleLowerCase(locale);
    if (
      question.length < 8
      || containsSensitiveAgentContent(question)
      || assertsLegalPremise(question)
      || /https?:\/\/|juro-private:\/\//iu.test(question)
      || /\d/u.test(question)
      || seen.has(key)
    ) continue;
    seen.add(key);
    safe.push(/[?？]$/u.test(question) ? question : `${question}?`);
    if (safe.length >= 4) break;
  }
  return safe;
}
