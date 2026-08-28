import assert from "node:assert/strict";
import test from "node:test";
import { createLegalAgentTools, issueLegalAgentToolCapability } from "../lib/ai/legal-agent-tools";
import type { LegalSourceContext } from "../lib/ai/provider";

const source: LegalSourceContext = {
  id: "direct:lex:ru:111189:abc", actTitle: "Гражданский кодекс", actIdentifier: "111189",
  officialUrl: "https://lex.uz/ru/docs/111189", revisionDate: null, lastCheckedAt: "2026-08-13T00:00:00.000Z",
  locale: "ru", publishedAt: null, sourceType: "lex", status: "verified", verificationState: "direct_validated",
  verifiedAt: "2026-08-13T00:00:00.000Z", contentSha256: "a".repeat(64), article: "Статья 10",
  excerpt: null, effectiveDate: null, applicabilityStatus: "current",
  spans: [{ id: "span:1", article: "Статья 10", paragraph: null, text: "Статья 10. Защита гражданских прав осуществляется судом.", textSha256: "b".repeat(64), quality: "high" }],
  sourceQuality: { passed: true, title: true, sufficientText: true, clean: true, locale: true, canonicalUrl: true, structured: true },
};

function readCapability(maxReadCalls = 4) {
  return issueLegalAgentToolCapability({
    locale: "ru",
    allowedOperations: ["search_official_sources", "read_official_document"],
    maxReadCalls,
  });
}

test("typed Lex tools reject non-Lex URLs before a network adapter is called", async () => {
  let calls = 0;
  const tools = createLegalAgentTools({ document: async () => { calls += 1; throw new Error("unexpected"); } }, readCapability());
  await assert.rejects(() => tools.getOfficialLexDocument({ url: "https://advice.uz/ru/documents/1", locale: "ru" }));
  await assert.rejects(() => tools.getOfficialLexDocument({ url: "https://example.com/law", locale: "ru" }));
  assert.equal(calls, 0);
});

test("document, article and structure tools expose only validated packet IDs and spans", async () => {
  const tools = createLegalAgentTools({ document: async () => ({ source, evidence: { sourceId: source.id, sourceKind: "lex", canonicalUrl: source.officialUrl, contentSha256: "a".repeat(64), retrievedAt: source.verifiedAt!, validatedAt: source.verifiedAt!, validationStatus: "validated" } }) }, readCapability());
  const document = await tools.getOfficialLexDocument({ url: source.officialUrl, locale: "ru" });
  assert.equal(document.canonicalUrl, source.officialUrl);
  const article = await tools.getOfficialLexArticle({ url: source.officialUrl, locale: "ru", articleOrAnchor: "статья 10" });
  assert.equal(article.spans.length, 1);
  const structure = await tools.getOfficialLexStructure({ url: source.officialUrl, locale: "ru" });
  assert.deepEqual(structure.articles, ["Статья 10"]);
});

test("case-plan and document-template tools require confirmation and do not mutate", () => {
  const available = DOCUMENT_TEMPLATE_FIXTURE();
  const tools = createLegalAgentTools({}, issueLegalAgentToolCapability({
    locale: "ru",
    allowedOperations: ["draft_action_plan", "open_document_template"],
    allowedCaseIds: ["00000000-0000-4000-8000-000000000001"],
    allowedTemplateIds: [available],
  }));
  const plan = tools.createActionPlanDraft({ caseContext: { caseId: "00000000-0000-4000-8000-000000000001", title: "Спор", summary: "" }, proposedSteps: [{ title: "Подготовить доказательства", description: "" }] });
  assert.equal(plan.persisted, false);
  assert.equal(plan.confirmationRequired, true);
  const handoff = tools.startExistingDocumentTemplate({ templateId: available, locale: "ru" });
  assert.equal(handoff.documentCreated, false);
  assert.equal(handoff.confirmationRequired, true);
});

test("request capabilities enforce locale, operation, resource and read-call bounds", async () => {
  const tools = createLegalAgentTools({
    document: async () => ({ source, evidence: { sourceId: source.id, sourceKind: "lex", canonicalUrl: source.officialUrl, contentSha256: "a".repeat(64), retrievedAt: source.verifiedAt!, validatedAt: source.verifiedAt!, validationStatus: "validated" } }),
  }, readCapability(1));
  await tools.getOfficialLexDocument({ url: source.officialUrl, locale: "ru" });
  await assert.rejects(
    () => tools.getOfficialLexDocument({ url: source.officialUrl, locale: "ru" }),
    /LEGAL_OPERATION_NOT_AVAILABLE/u,
  );
  await assert.rejects(
    () => tools.searchOfficialLex({ query: "договор аренды", locale: "uz", limit: 1 }),
    /LEGAL_OPERATION_NOT_AVAILABLE/u,
  );
  assert.throws(
    () => tools.startExistingDocumentTemplate({ templateId: DOCUMENT_TEMPLATE_FIXTURE(), locale: "ru" }),
    /LEGAL_OPERATION_NOT_AVAILABLE/u,
  );
});

function DOCUMENT_TEMPLATE_FIXTURE(): string {
  // A stable published seed from the existing JURO registry.
  return "0101001";
}
