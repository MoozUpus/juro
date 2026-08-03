/**
 * OpenAI Structured Outputs accepts a subset of JSON Schema. Zod's draft-7
 * export includes the draft marker and validation annotations that are not
 * part of the provider contract for every supported model. Keep the complete
 * structural grammar here; the caller still validates the returned value with
 * the original Zod parser, so application-level bounds are not weakened.
 */
export function openAiCompatibleJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
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
