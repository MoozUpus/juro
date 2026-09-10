import assert from "node:assert/strict";
import test from "node:test";
import { lexDocumentIsRepealed } from "../lib/legal/lex-document-status";

test("official repeal banners exclude obsolete law in every corpus language", () => {
  for (const text of ["Документ утратил силу 17.04.1998", "Hujjat kuchini yo‘qotgan&nbsp;17.04.1998",
    "Ҳужжат кучини йўқотган 17.04.1998", "Document has lost its force 17.04.1998"]) {
    assert.equal(lexDocumentIsRepealed(`<header id="doc_header"><span>${text}</span></header>`), true);
  }
});

test("repealing another instrument does not repeal the current document", () => {
  assert.equal(lexDocumentIsRepealed('<header id="doc_header">Закон от 10.09.2026</header><main>Документ утратил силу: предыдущий закон.</main>'), false);
});
