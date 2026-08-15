import assert from "node:assert/strict";
import test from "node:test";

import { legalCitationStatements } from "../lib/legal/direct-citation-store";
import type { LegalSourceContext } from "../lib/ai/provider";

test("citation persistence accepts only an exact validated span excerpt", () => {
  const bindings: unknown[][] = [];
  const db = {
    prepare() {
      return {
        bind(...values: unknown[]) {
          bindings.push(values);
          return {} as D1PreparedStatement;
        },
      };
    },
  } as unknown as D1Database;
  const source: LegalSourceContext = {
    id: "source-1",
    actTitle: "Проверенный закон",
    actIdentifier: "42",
    officialUrl: "https://lex.uz/ru/docs/42",
    revisionDate: "2026-08-15",
    lastCheckedAt: "2026-08-15T08:00:00.000Z",
    locale: "ru",
    publishedAt: null,
    sourceType: "lex",
    status: "verified",
    verificationState: "direct_validated",
    verifiedAt: "2026-08-15T08:00:00.000Z",
    contentSha256: "a".repeat(64),
    article: "7",
    excerpt: "Статья 7. Точное проверенное правило.",
    spans: [{
      id: "span-1",
      article: "7",
      paragraph: null,
      text: "Статья 7. Точное проверенное правило.",
      textSha256: "b".repeat(64),
      quality: "high",
    }],
  };
  const statements = legalCitationStatements({
    db,
    sources: [source],
    citations: [{
      sourceId: source.id,
      actTitle: source.actTitle,
      actIdentifier: source.actIdentifier,
      article: source.article ?? null,
      excerpt: source.excerpt ?? null,
      originalUrl: source.officialUrl,
      status: "current",
      effectiveDate: null,
      verifiedAt: source.verifiedAt,
    }],
    aiRunId: "run-1",
    conversationId: "conversation-1",
    messageId: "message-1",
    now: "2026-08-15T08:01:00.000Z",
    sourceAccessMode: "direct",
  });
  assert.equal(statements.length, 1);
  assert.equal(bindings[0]?.[13], "Статья 7. Точное проверенное правило.");

  bindings.length = 0;
  legalCitationStatements({
    db,
    sources: [source],
    citations: [{
      sourceId: source.id,
      actTitle: source.actTitle,
      actIdentifier: source.actIdentifier,
      article: source.article ?? null,
      excerpt: "Подменённая моделью цитата",
      originalUrl: source.officialUrl,
      status: "current",
      effectiveDate: null,
      verifiedAt: source.verifiedAt,
    }],
    aiRunId: "run-2",
    now: "2026-08-15T08:02:00.000Z",
    sourceAccessMode: "direct",
  });
  assert.equal(bindings[0]?.[13], null);
});
