import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverLexDocumentLinks,
  discoverLexRevisionHistory,
  languageVariantsFromLinks,
  parseLexDocumentEffectivity,
  parseLexDocumentUrl,
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

test("Lex revision discovery keeps only same-document ONDATE history newest first", () => {
  const current = parseLexDocumentUrl("https://lex.uz/ru/docs/145261");
  assert.ok(current);
  const history = discoverLexRevisionHistory(`
    <div class="dropdown-menu__item lx_date_selected stopProp">30.04.2023</div>
    <div class="dropdown-menu__item lx_date_link" onclick="lxOpenUrl('/ru/docs/145261?ONDATE=18.05.2022')">18.05.2022</div>
    <div class="dropdown-menu__item lx_date_link" onclick="lxOpenUrl('/ru/docs/145261?ONDATE=10.01.2018 04')">10.01.2018 04</div>
    <div class="dropdown-menu__item lx_date_link" onclick="lxOpenUrl('/ru/docs/145261?ONDATE2=18.05.2022&action=compare')">compare</div>
    <div class="dropdown-menu__item lx_date_link" onclick="lxOpenUrl('/ru/docs/999?ONDATE=01.01.2020')">other</div>
  `, current);
  assert.equal(history.currentRevisionDate, "2023-04-30");
  assert.deepEqual(history.revisions, [
    {
      canonicalDocumentId: "lexuz:145261", language: "ru",
      sourceUrl: "https://lex.uz/ru/docs/145261?ONDATE=18.05.2022",
      revisionDate: "2022-05-18",
    },
    {
      canonicalDocumentId: "lexuz:145261", language: "ru",
      sourceUrl: "https://lex.uz/ru/docs/145261?ONDATE=10.01.2018%2004",
      revisionDate: "2018-01-10",
    },
  ]);
});

test("Lex effectivity is derived from official visible status, never fetch time", () => {
  assert.deepEqual(parseLexDocumentEffectivity(`
    <div>Дата вступления в силу</div><div>01.04.1996</div>
    <table><tr><td>Акт утратил силу&nbsp;30.04.2023</td></tr></table>
  `), { status: "repealed", validFrom: "1996-04-01", validTo: "2023-04-30" });
  assert.deepEqual(parseLexDocumentEffectivity(`
    <div>Дата вступления в силу</div><div>08.11.2026</div>
    <div>Акт еще не вступил в силу</div>
  `), { status: "unknown", validFrom: "2026-11-08", validTo: null });
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
