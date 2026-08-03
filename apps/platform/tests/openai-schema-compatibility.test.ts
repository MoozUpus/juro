import assert from "node:assert/strict";
import test from "node:test";
import { openAiCompatibleJsonSchema } from "../lib/ai/openai-schema";

test("OpenAI schema adapter keeps structure while removing incompatible annotations", () => {
  const source = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    required: ["status", "url"],
    properties: {
      status: { type: "string", enum: ["ok", "failed"], minLength: 1, maxLength: 12 },
      url: { type: "string", format: "uri", maxLength: 2_000 },
      items: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string", pattern: "^[A-Z]+$" },
      },
    },
  };

  const result = openAiCompatibleJsonSchema(source) as typeof source;

  assert.deepEqual(source.properties.status, { type: "string", enum: ["ok", "failed"], minLength: 1, maxLength: 12 });
  assert.equal(result.$schema, undefined);
  assert.equal(result.additionalProperties, false);
  assert.deepEqual(result.required, ["status", "url"]);
  assert.deepEqual(result.properties.status, { type: "string", enum: ["ok", "failed"] });
  assert.deepEqual(result.properties.url, { type: "string" });
  assert.deepEqual(result.properties.items, { type: "array", items: { type: "string" } });
});
