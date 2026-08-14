import assert from "node:assert/strict";
import test from "node:test";

import {
  detectArticleNumbers,
  detectDocumentAliases,
  normalizeLegalSearchQuery,
  normalizeUzbekLatin,
  transliterateUzbek,
} from "../lib/legal/legal-language";

test("Uzbek normalization keeps Latin official text separate from Cyrillic query transliteration", () => {
  assert.equal(normalizeUzbekLatin("O’ZBEKISTON"), "OʻZBEKISTON");
  assert.equal(
    transliterateUzbek("Ўзбекистон Республикасининг Меҳнат кодекси"),
    "oʻzbekiston respublikasining mehnat kodeksi",
  );
  assert.match(
    normalizeLegalSearchQuery("Меҳнат кодекси 12-моддаси", "uz"),
    /mehnat kodeksi 12-modda/iu,
  );
});

test("legal reference detection retains every explicit article number in order", () => {
  assert.deepEqual(
    detectArticleNumbers("статья 12 Трудового кодекса и 289-1-modda"),
    ["12", "289-1"],
  );
  assert.deepEqual(detectArticleNumbers("просто 2026 год"), []);
});

test("document aliases work for Russian, Latin Uzbek and Cyrillic Uzbek", () => {
  assert.deepEqual(detectDocumentAliases("Гражданский кодекс, статья 8"), ["civil_code"]);
  assert.deepEqual(detectDocumentAliases("Soliq kodeksi 12-modda"), ["tax_code"]);
  assert.deepEqual(detectDocumentAliases("Меҳнат кодекси 12-модда"), ["labor_code"]);
});
