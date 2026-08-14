import assert from "node:assert/strict";
import test from "node:test";

import { diffCorpusProvisions } from "../lib/legal-corpus/versioning";

test("version diff preserves new, modified, moved, renumbered and repealed provisions", () => {
  const diff = diffCorpusProvisions([
    { articleNumber: "1", title: "A", text: "original text", sequence: 1 },
    { articleNumber: "2", title: "B", text: "same body", sequence: 2 },
    { articleNumber: "3", title: "C", text: "repealed body", sequence: 3 },
  ], [
    { articleNumber: "1", title: "A", text: "amended text", sequence: 1 },
    { articleNumber: "4", title: "B", text: "same body", sequence: 2 },
    { articleNumber: "5", title: "D", text: "new body", sequence: 4 },
  ]);

  assert.equal(diff.suspiciousShrink, false);
  assert.deepEqual(diff.changes, [
    { articleNumber: "1", previousArticleNumber: "1", change: "modified" },
    { articleNumber: "4", previousArticleNumber: "2", change: "renumbered" },
    { articleNumber: "5", previousArticleNumber: null, change: "new" },
    { articleNumber: "3", previousArticleNumber: "3", change: "repealed" },
  ]);
});

test("version diff flags suspicious parser shrink instead of publishing it", () => {
  const diff = diffCorpusProvisions([
    { articleNumber: "1", title: null, text: "x".repeat(1_000), sequence: 1 },
  ], [
    { articleNumber: "1", title: null, text: "x".repeat(100), sequence: 1 },
  ]);
  assert.equal(diff.suspiciousShrink, true);
});
