import { DOCUMENT_CATEGORIES } from "./categories";
import { DOCUMENT_REGISTRY } from "./catalog";
import type { RegistryValidationResult } from "./types";

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  values.forEach((value) => (seen.has(value) ? duplicate.add(value) : seen.add(value)));
  return [...duplicate].sort();
}

export function validateDocumentRegistry(): RegistryValidationResult {
  const categorySlugs = new Set<string>(DOCUMENT_CATEGORIES.map((category) => category.slug));
  const routes = DOCUMENT_REGISTRY.map((document) => `${document.categorySlug}/${document.code}`);
  const invalidCodes = DOCUMENT_REGISTRY.filter((document) => {
    if (!/^\d{7}$/.test(document.code)) return true;
    if (`${document.categoryCode}${document.subcategoryCode}${document.documentCode}` !== document.code) return true;
    return !categorySlugs.has(document.categorySlug);
  }).map((document) => document.code);
  const result: RegistryValidationResult = {
    duplicateCodes: duplicates(DOCUMENT_REGISTRY.map((document) => document.code)),
    duplicateRoutes: duplicates(routes),
    invalidCodes,
    missingRuTitles: DOCUMENT_REGISTRY.filter((document) => !document.titleRu.trim()).map((document) => document.code),
    missingUzTitles: DOCUMENT_REGISTRY.filter((document) => !document.titleUz.trim()).map((document) => document.code),
    valid: false,
  };
  result.valid = result.duplicateCodes.length === 0 && result.duplicateRoutes.length === 0 && result.invalidCodes.length === 0 && result.missingRuTitles.length === 0;
  return result;
}

export function assertDocumentRegistry(): void {
  const result = validateDocumentRegistry();
  if (!result.valid) throw new Error(`Document registry is invalid: ${JSON.stringify(result)}`);
}
