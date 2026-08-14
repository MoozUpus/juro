import assert from "node:assert/strict";
import test from "node:test";

import {
  autoTrustLexSource,
  autoTrustOwnerUpload,
  autoTrustUserUpload,
  canAccessCorpusScope,
  featureEnabled,
} from "../lib/legal-corpus/trust";

test("Lex.uz records are auto-trusted only from an allowlisted document URL", () => {
  assert.deepEqual(autoTrustLexSource({
    officialUrl: "https://lex.uz/ru/docs/-111189",
  }), {
    provider: "lex_uz",
    sourceClass: "OFFICIAL_LEGISLATION",
    scope: "global",
    visibility: "global",
    trusted: true,
    verificationStatus: "official_source",
    approvalRequired: false,
    tenantId: null,
    ownerUserId: null,
    matterId: null,
  });
  assert.throws(
    () => autoTrustLexSource({ officialUrl: "https://example.test/ru/docs/-111189" }),
    /LEGAL_CORPUS_OFFICIAL_URL_REJECTED/,
  );
});

test("owner and user uploads bypass legal approval without bypassing private scope", () => {
  const owner = autoTrustOwnerUpload({ ownerUserId: "usr_owner" });
  assert.equal(owner.approvalRequired, false);
  assert.equal(owner.sourceClass, "OWNER_TRUSTED_GLOBAL");

  const user = autoTrustUserUpload({
    ownerUserId: "usr_a",
    tenantId: "tenant_a",
    matterId: "matter_a",
  });
  assert.equal(canAccessCorpusScope({
    source: user,
    userId: "usr_a",
    tenantId: "tenant_a",
    matterId: "matter_a",
  }), true);
  assert.equal(canAccessCorpusScope({
    source: user,
    userId: "usr_b",
    tenantId: "tenant_a",
    matterId: "matter_a",
  }), false);
  assert.equal(canAccessCorpusScope({
    source: user,
    userId: "usr_a",
    tenantId: "tenant_a",
    matterId: "matter_b",
  }), false);
});

test("corpus feature flags remain server-side string booleans", () => {
  assert.equal(featureEnabled({ LEGAL_CORPUS_ENABLED: "true" }, "LEGAL_CORPUS_ENABLED"), true);
  assert.equal(featureEnabled({ LEGAL_CORPUS_ENABLED: "false" }, "LEGAL_CORPUS_ENABLED"), false);
});
