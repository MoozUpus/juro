import assert from "node:assert/strict";
import test from "node:test";
import { openAiCompatibleJsonSchema } from "../lib/ai/openai-schema";
import { legalChatJsonSchema, restoreLegalSourceIds } from "../lib/ai/legal-chat-schema";

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
