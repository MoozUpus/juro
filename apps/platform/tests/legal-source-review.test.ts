import assert from "node:assert/strict";
import test from "node:test";
import { PlatformStaffAccessError } from "../lib/auth/staff-access";
import type { LocalSession } from "../lib/auth/session-management";
import {
  createLegalSourceFetchRequest,
  executeLegalSourceFetchRequest,
  type LegalSourceAcquisitionEnv,
} from "../lib/legal/source-acquisition";
import { executeLegalSourceNormalization } from "../lib/legal/source-normalization";
import {
  claimLegalSourceReview,
  decideLegalSourceReview,
  LegalSourceReviewError,
  type LegalSourceReviewEnv,
} from "../lib/legal/source-review";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

type StoredObject = {
  bytes: Uint8Array;
  customMetadata?: Record<string, string>;
};

class FakeR2Bucket {
  readonly objects = new Map<string, StoredObject>();

  async head(key: string): Promise<{ key: string; size: number } | null> {
    const object = this.objects.get(key);
    return object ? { key, size: object.bytes.byteLength } : null;
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    const bytes = object.bytes.slice();
    return {
      key,
      version: "test",
      size: bytes.byteLength,
      etag: "test",
      httpEtag: '"test"',
      uploaded: new Date("2026-07-28T00:00:00.000Z"),
      checksums: { toJSON: () => ({}) },
      httpMetadata: {},
      customMetadata: object.customMetadata,
      range: undefined,
      storageClass: "Standard",
      ssecKeyMd5: undefined,
      bodyUsed: false,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      arrayBuffer: async () => bytes.slice().buffer,
      bytes: async () => bytes.slice(),
      text: async () => new TextDecoder().decode(bytes),
      json: async <T>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
      blob: async () => new Blob([bytes]),
      writeHttpMetadata() {},
    } as R2ObjectBody;
  }

  async put(
    key: string,
    value: unknown,
    options?: R2PutOptions,
  ): Promise<{ key: string }> {
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) bytes = value.slice();
    else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value.slice(0));
    } else if (typeof value === "string") {
      bytes = new TextEncoder().encode(value);
    } else {
      throw new TypeError("Unsupported synthetic R2 value.");
    }
    this.objects.set(key, {
      bytes,
      customMetadata: options?.customMetadata,
    });
    return { key };
  }
}

const REVIEW_AT = new Date("2026-07-28T01:10:00.000Z");

function reviewEnv(
  db: D1Database,
  bucket: FakeR2Bucket,
): LegalSourceReviewEnv & LegalSourceAcquisitionEnv {
  return {
    DB: db,
    BUCKET: bucket as unknown as R2Bucket,
    APP_ENV: "development",
    LEGAL_ADVICE_INGESTION_ENABLED: "false",
  };
}

function sourceFetch(responses: Response[]): typeof fetch {
  return (async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected synthetic fetch.");
    return response;
  }) as typeof fetch;
}

function legalDocument(title: string): string {
  return `<html><head><title>${title}</title></head><body><main>
    <h1>${title}</h1>
    <p>${"Норма описывает права, обязанности и применимый порядок действий. ".repeat(5)}</p>
    <h2>Статья 1</h2>
    <p>${"Уполномоченный орган проверяет документы по законодательству Республики Узбекистан. ".repeat(5)}</p>
  </main></body></html>`;
}

async function normalizedReviewFixture(
  env: LegalSourceReviewEnv & LegalSourceAcquisitionEnv,
  canonicalId: number,
) {
  const request = await createLegalSourceFetchRequest(env, {
    url: `https://lex.uz/ru/docs/-${canonicalId}`,
    idempotencyKey: `review_lex_${canonicalId}`,
  });
  const acquired = await executeLegalSourceFetchRequest(env, request.id, {
    fetchImpl: sourceFetch([
      new Response("User-agent: *\nAllow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
      new Response(legalDocument(`Закон ${canonicalId}`), {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    ]),
    now: () => new Date("2026-07-28T01:00:00.000Z"),
  });
  const normalized = await executeLegalSourceNormalization(
    env,
    acquired.versionId,
    { now: () => new Date("2026-07-28T01:01:00.000Z") },
  );
  const review = await env.DB.prepare(`
    SELECT id FROM legal_review_queue
    WHERE version_id = ? AND reason_code = 'new_source_version'
  `).bind(acquired.versionId).first<{ id: string }>();
  assert.ok(review);
  const version = await env.DB.prepare(`
    SELECT content_sha256 FROM legal_source_versions WHERE id = ?
  `).bind(acquired.versionId).first<{ content_sha256: string }>();
  assert.ok(version);
  return {
    reviewId: review.id,
    versionId: acquired.versionId,
    rawContentSha256: version.content_sha256,
    parsedContentSha256: normalized.parsedContentSha256,
    parsedObjectKey: normalized.parsedObjectKey,
  };
}

type ReviewerRole = "administrator" | "support" | "legal_reviewer";

function insertStaff(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  suffix: string,
  role: ReviewerRole,
  options: { mfaVerifiedAt?: string; assuranceLevel?: "primary" | "mfa" } = {},
): Pick<
  LocalSession,
  "sessionId" | "userId" | "assuranceLevel" | "mfaVerifiedAt"
> {
  const userId = `reviewer-${suffix}`;
  const sessionId = `review-session-${suffix}`;
  const deviceId = `review-device-${suffix}`;
  const mfaVerifiedAt = options.mfaVerifiedAt
    ?? "2026-07-28T01:00:00.000Z";
  const assuranceLevel = options.assuranceLevel ?? "mfa";
  sqlite.prepare(`
    INSERT INTO user_profiles (
      id,email,locale,account_type,timezone,created_at,updated_at
    ) VALUES (?,?,'ru','individual','Asia/Tashkent',?,?)
  `).run(
    userId,
    `${suffix}@review.example.test`,
    mfaVerifiedAt,
    mfaVerifiedAt,
  );
  sqlite.prepare(`
    INSERT INTO auth_devices (
      id,user_id,display_name,first_seen_at,last_seen_at
    ) VALUES (?,?,'Review device',?,?)
  `).run(deviceId, userId, mfaVerifiedAt, mfaVerifiedAt);
  sqlite.prepare(`
    INSERT INTO auth_sessions (
      id,user_id,device_id,token_hash,auth_method,assurance_level,
      authenticated_at,mfa_verified_at,expires_at,idle_expires_at,
      created_at,last_seen_at
    ) VALUES (?,?,?,?,'email_otp+totp',?,?,?,?,?,?,?)
  `).run(
    sessionId,
    userId,
    deviceId,
    `review-session-token-${suffix}`,
    assuranceLevel,
    mfaVerifiedAt,
    assuranceLevel === "mfa" ? mfaVerifiedAt : null,
    "2026-07-29T01:10:00.000Z",
    "2026-07-29T01:10:00.000Z",
    mfaVerifiedAt,
    mfaVerifiedAt,
  );
  sqlite.prepare(`
    INSERT INTO auth_totp_credentials (
      id,user_id,status,secret_ciphertext,secret_iv,key_version,
      enrollment_expires_at,created_at,updated_at,verified_at
    ) VALUES (?,?,'active','ciphertext','abcdefghijklmnop','v1',?,?,?,?)
  `).run(
    `review-totp-${suffix}`,
    userId,
    "2026-07-29T01:10:00.000Z",
    mfaVerifiedAt,
    mfaVerifiedAt,
    mfaVerifiedAt,
  );
  sqlite.prepare(`
    INSERT INTO platform_staff_assignments (
      id,user_id,role,grant_source,grant_reason,granted_at,expires_at,
      created_at,updated_at
    ) VALUES (?, ?, ?, 'operator_bootstrap', 'Approved legal review test',
      '2026-07-28T00:30:00.000Z','2026-07-29T00:30:00.000Z',
      '2026-07-28T00:30:00.000Z','2026-07-28T00:30:00.000Z')
  `).run(`review-assignment-${suffix}`, userId, role);
  return {
    sessionId,
    userId,
    assuranceLevel,
    mfaVerifiedAt: assuranceLevel === "mfa" ? mfaVerifiedAt : null,
  };
}

async function expectReviewError(
  promise: Promise<unknown>,
  code: string,
) {
  await assert.rejects(
    promise,
    (error) => error instanceof LegalSourceReviewError
      && error.code === code,
  );
}

test("legal review requires the dedicated role and recent local MFA before lookup", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const fixture = await normalizedReviewFixture(env, 201);
    const support = insertStaff(sqlite, "support", "support");
    await assert.rejects(
      claimLegalSourceReview(env, support, fixture.reviewId, {
        now: REVIEW_AT,
      }),
      PlatformStaffAccessError,
    );
    await assert.rejects(
      claimLegalSourceReview(env, support, "../invalid-review", {
        now: REVIEW_AT,
      }),
      PlatformStaffAccessError,
    );
    await assert.rejects(
      decideLegalSourceReview(env, support, { malformed: true }, {
        now: REVIEW_AT,
      }),
      PlatformStaffAccessError,
    );
    const staleReviewer = insertStaff(
      sqlite,
      "stale",
      "legal_reviewer",
      { mfaVerifiedAt: "2026-07-28T00:54:59.000Z" },
    );
    await assert.rejects(
      claimLegalSourceReview(env, staleReviewer, fixture.reviewId, {
        now: REVIEW_AT,
      }),
      PlatformStaffAccessError,
    );
    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT status,assigned_to_user_id FROM legal_review_queue WHERE id=?
      `).get(fixture.reviewId) as Record<string, unknown> },
      { status: "pending", assigned_to_user_id: null },
    );
  } finally {
    sqlite.close();
  }
});

test("approval is single-owner, hash-verifiable, immutable, and does not publish", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const fixture = await normalizedReviewFixture(env, 202);
    const reviewer = insertStaff(sqlite, "primary", "legal_reviewer");
    const other = insertStaff(sqlite, "other", "legal_reviewer");
    const firstClaim = await claimLegalSourceReview(
      env,
      reviewer,
      fixture.reviewId,
      { now: REVIEW_AT },
    );
    assert.equal(firstClaim.changed, true);
    assert.equal((await claimLegalSourceReview(
      env,
      reviewer,
      fixture.reviewId,
      { now: REVIEW_AT },
    )).changed, false);
    await expectReviewError(
      claimLegalSourceReview(env, other, fixture.reviewId, { now: REVIEW_AT }),
      "LEGAL_SOURCE_REVIEW_STATE_CONFLICT",
    );

    const input = {
      reviewId: fixture.reviewId,
      decision: "approve" as const,
      notes: "Текст и структура сверены с сохранённым официальным снимком.",
      expectedRawContentSha256: fixture.rawContentSha256,
      expectedParsedContentSha256: fixture.parsedContentSha256,
    };
    const decision = await decideLegalSourceReview(
      env,
      reviewer,
      input,
      { now: new Date("2026-07-28T01:12:00.000Z") },
    );
    assert.equal(decision.changed, true);
    assert.equal(decision.status, "approved");
    assert.equal(decision.publicationRequired, true);

    const row = sqlite.prepare(`
      SELECT status,decision,decision_notes,reviewed_parsed_sha256,
        decided_by_user_id,decision_evidence_json,decision_evidence_sha256,
        decided_at
      FROM legal_review_queue WHERE id=?
    `).get(fixture.reviewId) as Record<string, string>;
    assert.equal(row.status, "approved");
    assert.equal(row.decision, "approve");
    assert.equal(row.reviewed_parsed_sha256, fixture.parsedContentSha256);
    assert.equal(row.decided_by_user_id, reviewer.userId);
    assert.equal(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(row.decision_evidence_json),
      ).then((digest) => Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("")),
      row.decision_evidence_sha256,
    );
    const evidence = JSON.parse(row.decision_evidence_json) as {
      reviewerSessionId: string;
      rawContentSha256: string;
      parsedContentSha256: string;
    };
    assert.equal(evidence.reviewerSessionId, reviewer.sessionId);
    assert.equal(evidence.rawContentSha256, fixture.rawContentSha256);
    assert.equal(evidence.parsedContentSha256, fixture.parsedContentSha256);

    const trust = sqlite.prepare(`
      SELECT
        (SELECT status FROM legal_source_versions WHERE id=?) AS version_status,
        (SELECT verification_state FROM legal_sources WHERE id=(
          SELECT source_id FROM legal_source_versions WHERE id=?
        )) AS source_state,
        (SELECT COUNT(*) FROM legal_source_sections) AS sections,
        (SELECT COUNT(*) FROM legal_source_chunks) AS chunks
    `).get(fixture.versionId, fixture.versionId) as Record<string, unknown>;
    assert.deepEqual({ ...trust }, {
      version_status: "pending_review",
      source_state: "fetched",
      sections: 0,
      chunks: 0,
    });
    assert.equal((await decideLegalSourceReview(
      env,
      reviewer,
      input,
      { now: new Date("2026-07-28T01:13:00.000Z") },
    )).changed, false);
    await expectReviewError(
      decideLegalSourceReview(env, reviewer, {
        ...input,
        expectedRawContentSha256: "f".repeat(64),
      }, { now: new Date("2026-07-28T01:13:00.000Z") }),
      "LEGAL_SOURCE_REVIEW_EVIDENCE_CONFLICT",
    );
    assert.throws(
      () => sqlite.prepare(`
        UPDATE legal_review_queue SET decision_notes='Подмена доказательств.'
        WHERE id=?
      `).run(fixture.reviewId),
      /legal review terminal evidence is immutable/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM legal_review_queue WHERE id=?")
        .run(fixture.reviewId),
      /legal review terminal evidence cannot be deleted/,
    );
  } finally {
    sqlite.close();
  }
});

test("rejection atomically closes the untrusted version without creating trust data", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const fixture = await normalizedReviewFixture(env, 203);
    const reviewer = insertStaff(sqlite, "reject", "legal_reviewer");
    await claimLegalSourceReview(env, reviewer, fixture.reviewId, {
      now: REVIEW_AT,
    });
    const result = await decideLegalSourceReview(env, reviewer, {
      reviewId: fixture.reviewId,
      decision: "reject",
      notes: "Структура снимка не позволяет подтвердить юридическое содержание.",
      expectedRawContentSha256: fixture.rawContentSha256,
      expectedParsedContentSha256: fixture.parsedContentSha256,
    }, { now: new Date("2026-07-28T01:12:00.000Z") });
    assert.deepEqual(
      {
        status: result.status,
        decision: result.decision,
        publicationRequired: result.publicationRequired,
        changed: result.changed,
      },
      {
        status: "rejected",
        decision: "reject",
        publicationRequired: false,
        changed: true,
      },
    );
    const state = sqlite.prepare(`
      SELECT
        (SELECT status FROM legal_review_queue WHERE id=?) AS review_status,
        (SELECT status FROM legal_source_versions WHERE id=?) AS version_status,
        (SELECT verification_state FROM legal_sources WHERE id=(
          SELECT source_id FROM legal_source_versions WHERE id=?
        )) AS source_state,
        (SELECT COUNT(*) FROM legal_source_sections) AS sections,
        (SELECT COUNT(*) FROM legal_source_chunks) AS chunks
    `).get(
      fixture.reviewId,
      fixture.versionId,
      fixture.versionId,
    ) as Record<string, unknown>;
    assert.deepEqual({ ...state }, {
      review_status: "rejected",
      version_status: "rejected",
      source_state: "rejected",
      sections: 0,
      chunks: 0,
    });
  } finally {
    sqlite.close();
  }
});

test("decision fails closed when the normalized R2 evidence changes", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const fixture = await normalizedReviewFixture(env, 204);
    const reviewer = insertStaff(sqlite, "tamper", "legal_reviewer");
    await claimLegalSourceReview(env, reviewer, fixture.reviewId, {
      now: REVIEW_AT,
    });
    const parsed = bucket.objects.get(fixture.parsedObjectKey);
    assert.ok(parsed);
    parsed.bytes = new TextEncoder().encode('{"tampered":true}');
    await expectReviewError(
      decideLegalSourceReview(env, reviewer, {
        reviewId: fixture.reviewId,
        decision: "approve",
        notes: "Снимок должен быть неизменным до фиксации решения ревьюера.",
        expectedRawContentSha256: fixture.rawContentSha256,
        expectedParsedContentSha256: fixture.parsedContentSha256,
      }, { now: new Date("2026-07-28T01:12:00.000Z") }),
      "LEGAL_SOURCE_REVIEW_SOURCE_UNAVAILABLE",
    );
    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT status,decision,decided_at FROM legal_review_queue WHERE id=?
      `).get(fixture.reviewId) as Record<string, unknown> },
      { status: "in_review", decision: null, decided_at: null },
    );
  } finally {
    sqlite.close();
  }
});
