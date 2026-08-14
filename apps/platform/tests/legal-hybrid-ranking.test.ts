import assert from "node:assert/strict";
import test from "node:test";

import {
  rankSparseBm25,
  reciprocalRankFusion,
  type RankedLegalCandidate,
} from "../lib/legal/hybrid-ranking";

type Candidate = { title: string; provider: string };

function candidate(id: string, score: number, provider = "lex"): RankedLegalCandidate<Candidate> {
  return { id, score, value: { title: id, provider } };
}

test("RRF has stable ranking, deterministic score and no duplicate candidates", () => {
  const dense = [candidate("A", 0.9, "dense"), candidate("B", 0.8, "dense")];
  const sparse = [candidate("B", 3, "sparse"), candidate("A", 2, "sparse"), candidate("C", 1, "sparse")];
  const result = reciprocalRankFusion([dense, sparse], { k: 60 });

  assert.deepEqual(result.map((item) => item.id), ["A", "B", "C"]);
  assert.equal(result[0]!.score, 1 / 61 + 1 / 62);
  assert.equal(result[1]!.score, 1 / 62 + 1 / 61);
  assert.equal(result.filter((item) => item.id === "B").length, 1);
  assert.equal(result[1]!.value.provider, "dense", "first-seen source metadata is preserved");
  assert.deepEqual(result[1]!.ranks, [2, 1]);
});

test("RRF gracefully handles an unavailable dense or sparse ranker", () => {
  const onlySparse = reciprocalRankFusion([[], [candidate("A", 1)]]);
  const onlyDense = reciprocalRankFusion([[candidate("A", 1)], []]);
  assert.deepEqual(onlySparse.map((item) => item.id), ["A"]);
  assert.deepEqual(onlyDense.map((item) => item.id), ["A"]);
});

test("sparse BM25 boosts an exact article heading and retains original metadata", () => {
  const results = rankSparseBm25("статья 12 трудовой кодекс", [
    {
      id: "article-12",
      value: { title: "Статья 12. Трудовой кодекс", provider: "lex" },
      title: "Статья 12. Трудовой кодекс",
      body: "Условия трудового договора и права работника.",
      identifiers: "Трудовой кодекс",
    },
    {
      id: "article-98",
      value: { title: "Статья 98. Отпуск", provider: "lex" },
      title: "Статья 98. Отпуск",
      body: "Трудовые отношения работника.",
      identifiers: "Трудовой кодекс",
    },
  ]);

  assert.deepEqual(results.map((item) => item.id), ["article-12", "article-98"]);
  assert.equal(results[0]!.value.title, "Статья 12. Трудовой кодекс");
});
