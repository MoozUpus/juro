import assert from "node:assert/strict";
import test from "node:test";

import { openAiCompatibleJsonSchema } from "../lib/ai/openai-schema";
import {
  classifyTargetPrivateNames,
  handleTargetReasoningServiceRequest,
  parseTargetInterpretationProviderOutput,
  selectTargetProvisions,
  targetInterpretationJsonSchema,
  TARGET_PRIVATE_NAME_CLASSIFICATION_PATH,
  TARGET_PROVISION_SELECTION_PATH,
} from "../lib/legal-corpus/target-reasoning-service";

test("question interpretation uses the strict provider schema subset and normalizes nullable optionals", () => {
  const providerSchema = openAiCompatibleJsonSchema(targetInterpretationJsonSchema);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    assert.equal("oneOf" in object, false);
    assert.equal("allOf" in object, false);
    if (object.type === "object" && object.properties && typeof object.properties === "object") {
      assert.deepEqual(new Set(object.required as string[]),
        new Set(Object.keys(object.properties as Record<string, unknown>)));
    }
    Object.values(object).forEach(visit);
  };
  visit(providerSchema);
  const parsed = parseTargetInterpretationProviderOutput({
    id: "plan-provider",
    originalLanguage: "ru",
    answerLanguage: "ru",
    readings: [{ id: "reading", statement: "Трудовой договор",
      requirements: [{ id: "requirement", statement: "Порядок заключения" }] }],
    formulations: [{ id: "formulation", text: "порядок заключения трудового договора",
      legalTitleSpans: [], privateNameSpans: [], readingIds: ["reading"],
      requirementIds: ["requirement"], kind: "legal_register" }],
    missingCaseFacts: [], temporalEndpoint: null, comparison: null,
  });
  assert.equal("temporalEndpoint" in parsed, false);
  assert.equal("comparison" in parsed, false);
});

async function computeFormulationSha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode([
    "juro.private-name-classification.v1",
    text.normalize("NFC"),
  ].join("\n")));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

test("local PII attestation is hash-bound and preserves only declared legal titles", async () => {
  const text = "Companies Act protects John and Иван Петров.";
  const formulationSha256 = await computeFormulationSha256(text);
  const result = await classifyTargetPrivateNames({
    text,
    formulationSha256,
    legalTitleSpans: ["Companies Act"],
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.privateNameSpans, ["John", "Иван Петров"]);
  assert.equal(result.privateNameSpans.includes("Companies Act"), false);

  const mismatch = await classifyTargetPrivateNames({
    text,
    formulationSha256: "0".repeat(64),
    legalTitleSpans: ["Companies Act"],
  });
  assert.equal(mismatch.status, "uncertain");
});

const plan = {
  id: "plan-general",
  originalLanguage: "en",
  answerLanguage: "en",
  readings: [{
    id: "reading-one",
    statement: "First plausible reading",
    requirements: [{ id: "requirement-one", statement: "First governing rule" }],
  }, {
    id: "reading-two",
    statement: "Second plausible reading",
    requirements: [{ id: "requirement-two", statement: "Second governing rule" }],
  }],
  formulations: [{
    id: "formulation-one",
    text: "first governing rule",
    privateNameSpans: [],
    readingIds: ["reading-one"],
    requirementIds: ["requirement-one"],
    kind: "exact" as const,
  }, {
    id: "formulation-two",
    text: "second governing rule",
    privateNameSpans: [],
    readingIds: ["reading-two"],
    requirementIds: ["requirement-two"],
    kind: "legal_register" as const,
  }],
  missingCaseFacts: [],
};

function revalidatedCandidate(itemKey: string, requirementIds: string[], score: number) {
  return {
    candidate: {
      itemKey,
      instanceId: "instance-one",
      shardId: "shard-one",
      formulationId: "formulation-one",
      readingIds: ["reading-one", "reading-two"],
      requirementIds,
      vectorRank: 1,
      vectorScore: score,
      keywordRank: 1,
      keywordScore: score,
      fusionScore: score,
    },
    canonicalChunkId: `chunk-${itemKey}`,
    provisionRenditionId: `rendition-${itemKey}`,
    textRevisionId: `revision-${itemKey}`,
    provisionConceptId: `concept-${itemKey}`,
    languageFamily: "en" as const,
    textualAuthority: "controlling" as const,
  };
}

test("provision selection covers every requirement with revalidated candidates or requests one repair", () => {
  const selected = selectTargetProvisions({
    plan,
    candidates: [
      revalidatedCandidate("item-one", ["requirement-one"], 0.9),
      revalidatedCandidate("item-two", ["requirement-two"], 0.8),
    ],
    repairAttempted: false,
  });
  assert.equal(selected.outcome, "selected");
  if (selected.outcome === "selected") {
    assert.deepEqual(selected.propositions.map(({ requirementId }) => requirementId), [
      "requirement-one", "requirement-two",
    ]);
    assert.deepEqual(selected.selections.map(({ itemKey }) => itemKey), ["item-one", "item-two"]);
  }

  const repair = selectTargetProvisions({
    plan,
    candidates: [revalidatedCandidate("item-one", ["requirement-one"], 0.9)],
    repairAttempted: false,
  });
  assert.equal(repair.outcome, "repair");
  if (repair.outcome === "repair") {
    assert.deepEqual(repair.repairFormulation.requirementIds, ["requirement-two"]);
  }
});

test("reasoning routes require the exact private service boundary", async () => {
  const body = {
    plan,
    candidates: [
      revalidatedCandidate("item-one", ["requirement-one"], 0.9),
      revalidatedCandidate("item-two", ["requirement-two"], 0.8),
    ],
    repairAttempted: false,
  };
  const accepted = await handleTargetReasoningServiceRequest(new Request(
    `http://legal-corpus.internal${TARGET_PROVISION_SELECTION_PATH}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-juro-service-binding": "target-retrieval-runtime-v1",
        "x-juro-legal-environment": "staging",
      },
      body: JSON.stringify(body),
    },
  ), { APP_ENV: "staging" });
  assert.equal(accepted.status, 200);

  const publicRequest = await handleTargetReasoningServiceRequest(new Request(
    `https://app.juro.uz${TARGET_PRIVATE_NAME_CLASSIFICATION_PATH}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  ), { APP_ENV: "production" });
  assert.equal(publicRequest.status, 404);
});
