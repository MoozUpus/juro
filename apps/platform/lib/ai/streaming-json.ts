/**
 * Extract complete object values from a named top-level JSON array while the
 * surrounding JSON document is still streaming. Incomplete or malformed
 * suffixes are ignored; callers must still parse and validate the final
 * document with its authoritative schema.
 */
export function completeStreamingJsonArrayObjects(
  text: string,
  propertyName: string,
  limit = 16,
): unknown[] {
  if (!propertyName || limit <= 0 || text.length > 512_000) return [];
  const propertyToken = JSON.stringify(propertyName);
  const propertyIndex = text.indexOf(propertyToken);
  if (propertyIndex < 0) return [];
  const colonIndex = text.indexOf(":", propertyIndex + propertyToken.length);
  if (colonIndex < 0) return [];
  const arrayIndex = text.indexOf("[", colonIndex + 1);
  if (arrayIndex < 0) return [];

  const values: unknown[] = [];
  let itemStart = -1;
  let objectDepth = 0;
  let arrayDepth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayIndex + 1; index < text.length && values.length < limit; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (itemStart < 0) itemStart = index;
      objectDepth += 1;
      continue;
    }
    if (character === "[") {
      if (itemStart >= 0) arrayDepth += 1;
      continue;
    }
    if (character === "]") {
      if (itemStart >= 0 && arrayDepth > 0) {
        arrayDepth -= 1;
        continue;
      }
      if (itemStart < 0) break;
    }
    if (character !== "}" || itemStart < 0) continue;
    objectDepth -= 1;
    if (objectDepth !== 0 || arrayDepth !== 0) continue;
    try {
      values.push(JSON.parse(text.slice(itemStart, index + 1)));
    } catch {
      return values;
    }
    itemStart = -1;
  }

  return values;
}
