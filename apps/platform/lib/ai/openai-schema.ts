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
    const entries: Array<[string, unknown]> = [];
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (unsupportedAnnotations.has(key)) continue;
      const providerKey = key === "oneOf" ? "anyOf" : key;
      const visited = visit(nested);
      if (providerKey === "allOf" && Array.isArray(visited)
        && visited.every((entry) => entry && typeof entry === "object"
          && Object.keys(entry as Record<string, unknown>).length === 0)) continue;
      entries.push([providerKey, visited]);
    }
    return Object.fromEntries(entries);
  };
  return visit(schema) as Record<string, unknown>;
}
