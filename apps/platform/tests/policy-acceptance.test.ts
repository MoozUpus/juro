import assert from "node:assert/strict";
import test from "node:test";
import { appLegalContent } from "../content/app-legal";
import { recordRegistrationAcceptances } from "../lib/legal/acceptance";
import {
  policyRegistry,
  policySlugs,
  registrationPolicies,
  verifiedPolicyDocument,
} from "../lib/legal/policies";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

test("owner-supplied RU/UZ publication particulars replace every shipped placeholder", () => {
  const content = JSON.stringify(appLegalContent);
  assert.doesNotMatch(content, /\{OPERATOR_(?:LEGAL_NAME|EMAIL|ADDRESS)\}/u);
  assert.match(content, /ООО «JURO»/u);
  assert.match(content, /«JURO» MChJ/u);
  assert.match(content, /«JURO» LLC/u);
  assert.match(content, /admin@juro\.uz/u);
  assert.match(content, /Tashkent, Uzbekistan/u);
  assert.ok(Object.values(appLegalContent.ru).every(({ updated }) => updated === "23 августа 2026"));
  assert.ok(Object.values(appLegalContent.uz).every(({ updated }) => updated === "2026-yil 23-avgust"));
});

test("every displayed RU/UZ policy has a locked version and content digest", async () => {
  for (const locale of ["ru", "uz"] as const) {
    const registry = await policyRegistry(locale);
    assert.equal(registry.length, 5);
    assert.deepEqual(
      registry.map(({ slug }) => slug),
      policySlugs,
    );
    for (const policy of registry) {
      assert.equal(policy.documentVersion, "2026-08-23.1");
      assert.equal(policy.status, "approved");
      assert.match(policy.contentSha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(
        await verifiedPolicyDocument(locale, policy.slug),
        policy,
      );
    }
    assert.deepEqual(
      (await registrationPolicies(locale))
        .map(({ documentKey }) => documentKey)
        .sort(),
      ["personal-data-processing", "privacy-policy", "terms"],
    );
  }
});

test("registration records exact policy evidence and separates marketing consent", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const now = "2026-07-26T12:00:00.000Z";
    sqlite.prepare(
      `INSERT INTO user_profiles (
         id,email,locale,created_at,updated_at
       ) VALUES (?,?,?,?,?)`,
    ).run("policy-user", "policy@example.test", "ru", now, now);
    await recordRegistrationAcceptances(d1, {
      userId: "policy-user",
      locale: "ru",
      otpChallengeId: "11111111-1111-4111-8111-111111111111",
      acceptedMarketing: true,
      acceptedAt: now,
    });

    const policies = sqlite.prepare(
      `SELECT
         document_key AS documentKey,document_version AS documentVersion,
         locale,content_sha256 AS contentSha256,status
       FROM policy_documents
       ORDER BY document_key`,
    ).all() as Array<Record<string, unknown>>;
    assert.equal(policies.length, 5);
    assert.ok(policies.every(({ locale }) => locale === "ru"));
    assert.ok(policies.every(({ status }) => status === "approved"));
    assert.ok(policies.every(({ contentSha256 }) =>
      typeof contentSha256 === "string"
      && /^[a-f0-9]{64}$/.test(contentSha256)
    ));

    const acceptances = sqlite.prepare(
      `SELECT
         acceptance.document_key AS documentKey,
         acceptance.document_version AS documentVersion,
         acceptance.locale,
         acceptance.content_sha256 AS contentSha256,
         acceptance.acceptance_method AS acceptanceMethod,
         acceptance.auth_source AS authSource,
         acceptance.evidence_json AS evidenceJson,
         policy.content_sha256 AS policyDigest
       FROM user_acceptances acceptance
       JOIN policy_documents policy
         ON policy.id=acceptance.policy_document_id
       WHERE acceptance.user_id=?
       ORDER BY acceptance.document_key`,
    ).all("policy-user") as Array<{
      documentKey: string;
      documentVersion: string;
      locale: string;
      contentSha256: string;
      acceptanceMethod: string;
      authSource: string;
      evidenceJson: string;
      policyDigest: string;
    }>;
    assert.deepEqual(
      acceptances.map(({ documentKey }) => documentKey),
      ["personal-data-processing", "privacy-policy", "terms"],
    );
    for (const acceptance of acceptances) {
      assert.equal(acceptance.documentVersion, "2026-08-23.1");
      assert.equal(acceptance.locale, "ru");
      assert.equal(acceptance.contentSha256, acceptance.policyDigest);
      assert.equal(
        acceptance.acceptanceMethod,
        "registration_checkbox",
      );
      assert.equal(acceptance.authSource, "email_otp");
      assert.deepEqual(JSON.parse(acceptance.evidenceJson), {
        otpChallengeId: "11111111-1111-4111-8111-111111111111",
        source: "registration",
      });
    }
    assert.equal(
      (
        sqlite.prepare(
          "SELECT count(*) AS total FROM user_acceptances WHERE document_key='marketing'",
        ).get() as { total: number }
      ).total,
      0,
    );
    assert.deepEqual({
      ...(sqlite.prepare(
        `SELECT type,version,scope_json AS scopeJson
         FROM consents WHERE user_id=?`,
      ).get("policy-user") as Record<string, unknown>),
    }, {
      type: "marketing_email",
      version: "2026-07-26.1",
      scopeJson: "{\"channels\":[\"email\"]}",
    });
  } finally {
    sqlite.close();
  }
});
