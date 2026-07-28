import assert from "node:assert/strict";
import test from "node:test";
import {
  filterTrustedVerifiedLegalSources,
  isTrustedVerifiedLegalSource,
  trustedLegalSourceKind,
} from "../lib/legal/source-trust";

const VERIFIED_AT = "2026-07-28T12:00:00.000Z";
const CONTENT_SHA256 = "a".repeat(64);
const verifiedEvidence = {
  status: "verified",
  verificationState: "verified",
  verifiedAt: VERIFIED_AT,
  contentSha256: CONTENT_SHA256,
};

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
    sourceType: "lex",
    ...verifiedEvidence,
  }), false);
  assert.equal(isTrustedVerifiedLegalSource({
    officialUrl: "https://lex.uz/docs/123",
    sourceType: "lex",
    status: "pending",
  }), false);
  assert.equal(isTrustedVerifiedLegalSource({
    officialUrl: "https://lex.uz/docs/123",
    sourceType: "lex",
    ...verifiedEvidence,
  }), true);
  assert.equal(isTrustedVerifiedLegalSource({
    officialUrl: "https://lex.uz/docs/123",
    sourceType: "advice",
    ...verifiedEvidence,
  }), false);
  assert.equal(isTrustedVerifiedLegalSource({
    officialUrl: "https://lex.uz/docs/123",
    sourceType: "lex",
    status: "verified",
    verificationState: "verified",
    verifiedAt: VERIFIED_AT,
    contentSha256: null,
  }), false);
});

test("trusted-source filtering preserves only allowlisted verified records", () => {
  const sources = filterTrustedVerifiedLegalSources([
    { id: "lex", officialUrl: "https://lex.uz/docs/1", sourceType: "lex", ...verifiedEvidence },
    { id: "advice", officialUrl: "https://advice.uz/ru/1", sourceType: "advice", ...verifiedEvidence },
    { id: "fake", officialUrl: "https://laws.example/1", sourceType: "lex", ...verifiedEvidence },
    { id: "legacy", officialUrl: "https://lex.uz/docs/legacy", sourceType: "lex", status: "verified" },
    { id: "draft", officialUrl: "https://lex.uz/docs/2", sourceType: "lex", status: "pending" },
  ]);
  assert.deepEqual(sources.map(({ id }) => id), ["lex", "advice"]);
});
