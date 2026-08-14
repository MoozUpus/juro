import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverLexDocumentLinks,
  languageVariantsFromLinks,
} from "../lib/legal-corpus/lex-discovery";
import {
  chunkLegalProvision,
  parseLegalProvisions,
} from "../lib/legal-corpus/provision-parser";

test("Lex discovery deduplicates canonical language variants and ignores off-origin links", () => {
  const links = discoverLexDocumentLinks([
    '<a href="/ru/docs/-111189">RU</a>',
    '<a href="https://lex.uz/uz/docs/-111189#section">UZ</a>',
    '<a href="/ru/docs/-111189">repeat</a>',
    '<a href="https://example.test/ru/docs/-111189">outside</a>',
  ].join("\n"));
  assert.deepEqual(links, [
    { canonicalDocumentId: "lexuz:111189", language: "ru", sourceUrl: "https://lex.uz/ru/docs/-111189" },
    { canonicalDocumentId: "lexuz:111189", language: "uz-Latn", sourceUrl: "https://lex.uz/uz/docs/-111189" },
  ]);
  assert.equal(languageVariantsFromLinks("lexuz:111189", links).length, 2);
});

test("provision parser keeps article structure and only splits genuinely large articles", () => {
  const provisions = parseLegalProvisions([
    "1-modda. Umumiy qoida",
    "Birinchi norma.",
    "",
    "289¹-modda. Maxsus qoida",
    "Ikkinchi norma.",
  ].join("\n"), "uz-Latn");
  assert.deepEqual(provisions.map((item) => item.articleNumber), ["1", "289-1"]);
  assert.equal(provisions[1]?.title, "Maxsus qoida");

  const large = { ...provisions[0]!, text: "A".repeat(5) + "\n\n" + "B".repeat(5) };
  assert.deepEqual(chunkLegalProvision(large, 8), ["AAAAA", "BBBBB"]);
});
