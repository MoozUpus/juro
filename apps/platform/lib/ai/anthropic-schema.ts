/**
 * Anthropic structured outputs accept JSON Schema, but provider support for
 * annotation constraints is narrower than the Zod draft-7 output used by the
 * OpenAI Responses API. Keep the structural contract and enum/const rules;
 * enforce length, URL and other presentation constraints with the original
 * Zod parser after the response is returned.
 */
export function anthropicCompatibleJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const unsupportedAnnotations = new Set([
    "$schema",
    "format",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "minimum",
    "maximum",
    "multipleOf",
    "pattern",
    "default",
  ]);
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !unsupportedAnnotations.has(key))
        .map(([key, nested]) => [key, visit(nested)]),
    );
  };
  return visit(schema) as Record<string, unknown>;
}
