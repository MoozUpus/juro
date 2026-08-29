import assert from "node:assert/strict";
import test from "node:test";
import { verifyAiPriceReferences } from "../lib/ai/provider-price-reference";

const checkedAt = new Date("2026-08-29T12:00:00.000Z");

function price(input: {
  id: string;
  model: "gpt-5.6-sol" | "gpt-5.6-terra";
  input: number;
  cached: number;
  output: number;
  effectiveFrom: string;
}) {
  return {
    id: input.id,
    provider: "openai",
    model: input.model,
    operation: "responses",
    inputMicrousdPerMillionTokens: input.input,
    outputMicrousdPerMillionTokens: input.output,
    cachedInputMicrousdPerMillionTokens: input.cached,
    effectiveFrom: input.effectiveFrom,
    sourceUrl: `https://developers.openai.com/api/docs/models/${input.model}`,
    createdAt: input.effectiveFrom,
  };
}

test("current model-specific OpenAI prices verify against the effective reference", () => {
  const result = verifyAiPriceReferences({
    now: checkedAt,
    prices: [
      price({
        id: "terra-current",
        model: "gpt-5.6-terra",
        input: 2_000_000,
        cached: 200_000,
        output: 12_000_000,
        effectiveFrom: "2026-07-30T00:00:00.000Z",
      }),
      price({
        id: "sol-current",
        model: "gpt-5.6-sol",
        input: 4_000_000,
        cached: 400_000,
        output: 20_000_000,
        effectiveFrom: "2026-08-21T00:00:00.000Z",
      }),
    ],
    usedPriceVersions: [],
  });
  assert.equal(result.status, "verified");
  assert.deepEqual(result.checks.map((check) => check.status), ["verified", "verified"]);
  assert.equal(result.historicalMispricedRequestCount, 0);
});

test("stale active and historically used rates remain fail-honest", () => {
  const staleTerra = price({
    id: "terra-stale",
    model: "gpt-5.6-terra",
    input: 2_500_000,
    cached: 250_000,
    output: 15_000_000,
    effectiveFrom: "2026-08-25T00:00:00.000Z",
  });
  const result = verifyAiPriceReferences({
    now: checkedAt,
    prices: [staleTerra],
    usedPriceVersions: [
      {
        priceVersionId: staleTerra.id,
        provider: staleTerra.provider,
        model: staleTerra.model,
        operation: staleTerra.operation,
        inputMicrousdPerMillionTokens: staleTerra.inputMicrousdPerMillionTokens,
        outputMicrousdPerMillionTokens: staleTerra.outputMicrousdPerMillionTokens,
        cachedInputMicrousdPerMillionTokens: staleTerra.cachedInputMicrousdPerMillionTokens,
        usageDay: "2026-07-29",
        requestCount: 1,
        firstUsedAt: "2026-07-29T12:00:00.000Z",
        lastUsedAt: "2026-07-29T12:00:00.000Z",
      },
      {
        priceVersionId: staleTerra.id,
        provider: staleTerra.provider,
        model: staleTerra.model,
        operation: staleTerra.operation,
        inputMicrousdPerMillionTokens: staleTerra.inputMicrousdPerMillionTokens,
        outputMicrousdPerMillionTokens: staleTerra.outputMicrousdPerMillionTokens,
        cachedInputMicrousdPerMillionTokens: staleTerra.cachedInputMicrousdPerMillionTokens,
        usageDay: "2026-08-25",
        requestCount: 4,
        firstUsedAt: "2026-08-25T12:00:00.000Z",
        lastUsedAt: "2026-08-26T12:00:00.000Z",
      },
    ],
  });
  assert.equal(result.status, "needs_review");
  assert.equal(result.checks.find((check) => check.model === "gpt-5.6-terra")?.status, "rate_mismatch");
  assert.equal(result.checks.find((check) => check.model === "gpt-5.6-sol")?.status, "missing");
  assert.equal(result.historicalMispricedRequestCount, 4);
  assert.deepEqual(result.historicalMismatches.map((mismatch) => mismatch.priceVersionId), ["terra-stale"]);
});

test("temporary Sol reference becomes review-due after the documented assurance window", () => {
  const result = verifyAiPriceReferences({
    now: new Date("2026-11-22T00:00:00.000Z"),
    prices: [
      price({
        id: "sol-promotion",
        model: "gpt-5.6-sol",
        input: 4_000_000,
        cached: 400_000,
        output: 20_000_000,
        effectiveFrom: "2026-08-21T00:00:00.000Z",
      }),
    ],
    usedPriceVersions: [],
  });
  assert.equal(result.checks.find((check) => check.model === "gpt-5.6-sol")?.status, "review_due");
  assert.equal(result.status, "needs_review");
});
