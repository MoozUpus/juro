import assert from "node:assert/strict";
import test from "node:test";
import {
  filterTrustedVerifiedLegalSources,
  isTrustedVerifiedLegalSource,
  trustedLegalSourceKind,
} from "../lib/legal/source-trust";

test("only exact official Lex and Advice HTTPS hosts are trusted", () => {
  assert.equal(trustedLegalSourceKind("https://lex.uz/docs/123"), "lex");
  assert.equal(trustedLegalSourceKind("https://www.lex.uz/acts/123"), "lex");
  assert.equal(trustedLegalSourceKind("https://advice.uz/ru/document/1"), "advice");
  assert.equal(trustedLegalSourceKind("https://www.advice.uz/uz/document/1"), "advice");
  assert.equal(trustedLegalSourceKind("http://lex.uz/docs/123"), null);
  assert.equal(trustedLegalSourceKind("https://lex.uz.example.com/docs/123"), null);
  assert.equal(trustedLegalSourceKind("https://example.com/?next=https://lex.uz"), null);
  assert.equal(trustedLegalSourceKind("https://user:secret@lex.uz/docs/123"), null);
  assert.equal(trustedLegalSourceKind("javascript:alert(1)"), null);
  assert.equal(trustedLegalSourceKind("not a URL"), null);
});

test("database verified status cannot promote an untrusted URL", () => {
  assert.equal(isTrustedVerifiedLegalSource({
    officialUrl: "https://example.com/law",
    status: "verified",
  }), false);
  assert.equal(isTrustedVerifiedLegalSource({
    officialUrl: "https://lex.uz/docs/123",
    status: "pending",
  }), false);
  assert.equal(isTrustedVerifiedLegalSource({
    officialUrl: "https://lex.uz/docs/123",
    status: "verified",
  }), true);
});

test("trusted-source filtering preserves only allowlisted verified records", () => {
  const sources = filterTrustedVerifiedLegalSources([
    { id: "lex", officialUrl: "https://lex.uz/docs/1", status: "verified" },
    { id: "advice", officialUrl: "https://advice.uz/ru/1", status: "verified" },
    { id: "fake", officialUrl: "https://laws.example/1", status: "verified" },
    { id: "draft", officialUrl: "https://lex.uz/docs/2", status: "pending" },
  ]);
  assert.deepEqual(sources.map(({ id }) => id), ["lex", "advice"]);
});
