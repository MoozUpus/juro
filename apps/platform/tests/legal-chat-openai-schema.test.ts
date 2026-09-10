import assert from "node:assert/strict";
import test from "node:test";
import { openAiCompatibleJsonSchema } from "../lib/ai/openai-schema";
import { legalChatJsonSchema, legalChatJsonSchemaForCoverage, parseLegalChatResponse,
  restoreLegalSourceIds } from "../lib/ai/legal-chat-schema";

function assertStructuredOutputObjectRules(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertStructuredOutputObjectRules(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const properties = record.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    const propertyNames = Object.keys(properties as Record<string, unknown>).sort();
    const required = Array.isArray(record.required) ? record.required.map(String).sort() : [];
    assert.equal(record.additionalProperties, false, `${path} must forbid undeclared properties`);
    assert.deepEqual(required, propertyNames, `${path} must require each declared provider field`);
  }
  for (const [key, nested] of Object.entries(record)) {
    assertStructuredOutputObjectRules(nested, `${path}.${key}`);
  }
}

test("legal-chat schema is valid for OpenAI Structured Outputs and excludes server-owned fields", () => {
  const schema = openAiCompatibleJsonSchema(legalChatJsonSchema) as Record<string, unknown>;
  const properties = schema.properties as Record<string, unknown>;

  assert.equal("sourceAccessMode" in properties, false);
  assert.equal("sourcesRetrievedAt" in properties, false);
  assert.equal("sourceValidationStatus" in properties, false);
  for (const field of ["sources", "answer", "assumptions", "requiredDocuments", "successOutlook", "language", "jurisdiction", "answerMode", "reasoningMode", "legalDatabaseAsOf"]) {
    assert.equal(field in properties, false, `${field} is derived from validated request context`);
  }
  assert.equal(Object.keys(properties)[0], "confirmedFindings");
  assert.ok("summary" in properties && "summarySourceIds" in properties);
  assertStructuredOutputObjectRules(schema);
});

test("compact source aliases resolve only within their own request and preserve unknown ids for rejection", () => {
  assert.deepEqual(restoreLegalSourceIds(["s1", "s2", "s99"], [{id: "evidence-a"}, {id: "evidence-b"}]),
    ["evidence-a", "evidence-b", "s99"]);
  assert.deepEqual(restoreLegalSourceIds(["s1"], [{id: "different-evidence"}]), ["different-evidence"]);
});

test("coverage schema requires an explicit entry for every independent requirement", () => {
  const schema = openAiCompatibleJsonSchema(legalChatJsonSchemaForCoverage([
    {id: "original-rule"}, {id: "additional-rule"},
  ])) as Record<string, unknown>;
  assertStructuredOutputObjectRules(schema);
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(properties.coverage!.required, ["r1", "r2"]);
  const finding = properties.confirmedFindings!.items as Record<string, unknown>;
  assert.equal("requirementIds" in (finding.properties as object), false);
});

test("coverage slots restore all equivalent scopes while rejecting missing or invented finding indices", () => {
  const context = {locale: "en" as const, answerMode: "short" as const, reasoningMode: "fast" as const,
    legalDatabaseAsOf: "2026-09-11", sources: [{id: "verified-evidence"}],
    coverageRequirements: [{id: "original-rule"}, {id: "additional-rule"}, {id: "separate-forum"}]};
  const answer = {responseKind: "answer", summary: "Registration is required.", summarySourceIds: ["s1"],
    confirmedFindings: [{title: "Registration", explanation: "Registration is required.",
      sourceIds: ["s1"], answerRole: "governing_rule"}],
    coverage: {r1: [0], r2: [0], r3: []}, clarificationQuestions: [], risks: [], actionPlan: [],
    deadlines: [], urgency: "normal", suggestedDocument: null, suggestLawyer: false};
  const parsed = parseLegalChatResponse(answer, context);
  assert.deepEqual(parsed.confirmedFindings[0]!.requirementIds, ["original-rule", "additional-rule"]);
  assert.deepEqual(parsed.confirmedFindings[0]!.sourceIds, ["verified-evidence"]);
  assert.equal("coverage" in parsed, false);
  assert.throws(() => parseLegalChatResponse({...answer, coverage: {r1: [0], r2: [0]}}, context));
  assert.throws(() => parseLegalChatResponse({...answer, coverage: {r1: [0], r2: [1], r3: []}}, context),
    /ANSWER_COVERAGE_FINDING_UNAVAILABLE/u);
  assert.throws(() => parseLegalChatResponse({...answer, coverage: {...answer.coverage, r4: [0]}}, context));
});
