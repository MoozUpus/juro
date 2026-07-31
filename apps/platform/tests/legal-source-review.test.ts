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
  listLegalSourceReviews,
  type LegalSourceReviewEnv,
} from "../lib/legal/source-review";
import {
  LegalSourcePublicationError,
  publishApprovedLegalSource,
} from "../lib/legal/source-publication";
import {
  LegalSourceLifecycleError,
  withdrawPublishedLegalSource,
} from "../lib/legal/source-lifecycle";
import { retrieveVerifiedLegalSources } from "../lib/legal/verified-retrieval";
import { executeLegalSourceIndexing } from "../lib/legal/source-indexing";
import {
  handleLegalSourcePublicationRequest,
  handleLegalSourceReviewClaimRequest,
  handleLegalSourceReviewDecisionRequest,
  handleLegalSourceReviewListRequest,
  handleLegalSourceSyncRequest,
  handleLegalSourceWithdrawalRequest,
} from "../lib/legal/source-staff-http";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

type IndexedVector = { id: string; values: number[]; metadata?: Record<string, unknown> };

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

function legalDocument(title: string, leadParagraph?: string): string {
  return `<html><head><title>${title}</title></head><body><main>
    <h1>${title}</h1>
    <p>${leadParagraph ?? "Норма описывает права, обязанности и применимый порядок действий. ".repeat(5)}</p>
    <h2>Статья 1</h2>
    <p>${"Уполномоченный орган проверяет документы по законодательству Республики Узбекистан. ".repeat(5)}</p>
  </main></body></html>`;
}

async function normalizedReviewFixture(
  env: LegalSourceReviewEnv & LegalSourceAcquisitionEnv,
  canonicalId: number,
  documentHtml?: string,
  requestSuffix = "",
) {
  const request = await createLegalSourceFetchRequest(env, {
    url: `https://lex.uz/ru/docs/-${canonicalId}`,
    idempotencyKey: `review_lex_${canonicalId}${requestSuffix}`,
  });
  const acquired = await executeLegalSourceFetchRequest(env, request.id, {
    fetchImpl: sourceFetch([
      new Response("User-agent: *\nAllow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
      new Response(documentHtml ?? legalDocument(`Закон ${canonicalId}`), {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    ]),
    now: () => new Date(
      requestSuffix
        ? "2026-07-28T01:02:00.000Z"
        : "2026-07-28T01:00:00.000Z",
    ),
  });
  const normalized = await executeLegalSourceNormalization(
    env,
    acquired.versionId,
    {
      now: () => new Date(
        requestSuffix
          ? "2026-07-28T01:03:00.000Z"
          : "2026-07-28T01:01:00.000Z",
      ),
    },
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

async function approvedReviewFixture(
  env: LegalSourceReviewEnv & LegalSourceAcquisitionEnv,
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  canonicalId: number,
  suffix: string,
  documentHtml?: string,
  requestSuffix = "",
) {
  const fixture = await normalizedReviewFixture(
    env,
    canonicalId,
    documentHtml,
    requestSuffix,
  );
  const reviewer = insertStaff(sqlite, `decision-${suffix}`, "legal_reviewer");
  await claimLegalSourceReview(env, reviewer, fixture.reviewId, {
    now: REVIEW_AT,
  });
  const decision = await decideLegalSourceReview(env, reviewer, {
    reviewId: fixture.reviewId,
    decision: "approve",
    notes: "Источник и нормализованная структура проверены для публикации.",
    expectedRawContentSha256: fixture.rawContentSha256,
    expectedParsedContentSha256: fixture.parsedContentSha256,
  }, { now: new Date("2026-07-28T01:12:00.000Z") });
  return { fixture, reviewer, decision };
}

async function expectPublicationError(
  promise: Promise<unknown>,
  code: string,
) {
  await assert.rejects(
    promise,
    (error) => error instanceof LegalSourcePublicationError
      && error.code === code,
  );
}

function staffRequest(
  path: string,
  body?: unknown,
): Request {
  return new Request(`https://app.juro.test${path}`, {
    method: "POST",
    headers: {
      origin: "https://app.juro.test",
      "sec-fetch-site": "same-origin",
      "x-juro-csrf": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function staffListRequest(path: string): Request {
  return new Request(`https://app.juro.test${path}`, {
    headers: {
      "sec-fetch-site": "same-origin",
      "x-juro-csrf": "1",
    },
  });
}

test("legal review inbox is keyset-paginated and excludes stored content", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const fixture = await normalizedReviewFixture(env, 221);
    const source = sqlite.prepare(
      "SELECT source_id FROM legal_source_versions WHERE id=?",
    ).get(fixture.versionId) as { source_id: string };
    sqlite.prepare(`
      INSERT INTO legal_review_queue (
        id,source_id,version_id,reason_code,confidence,status,
        created_at,updated_at
      ) VALUES (?,?,?,'pagination_regression','medium','pending',?,?)
    `).run(
      "review-pagination-second",
      source.source_id,
      fixture.versionId,
      "2026-07-28T01:02:00.000Z",
      "2026-07-28T01:02:00.000Z",
    );
    const reviewer = insertStaff(sqlite, "list-pagination", "legal_reviewer");
    const first = await listLegalSourceReviews(env, reviewer, {
      status: "pending",
      scope: "all",
      sourceKind: "all",
      language: "all",
      limit: 1,
    }, { now: REVIEW_AT });
    assert.equal(first.items.length, 1);
    assert.ok(first.nextCursor);
    assert.equal(Object.hasOwn(first.items[0], "rawObjectKey"), false);
    assert.equal(Object.hasOwn(first.items[0], "parsedObjectKey"), false);
    assert.equal(Object.hasOwn(first.items[0], "content"), false);
    const second = await listLegalSourceReviews(env, reviewer, {
      status: "pending",
      scope: "all",
      sourceKind: "lex",
      language: "ru",
      limit: 1,
      cursor: first.nextCursor,
    }, { now: REVIEW_AT });
    assert.equal(second.items.length, 1);
    assert.notEqual(first.items[0].reviewId, second.items[0].reviewId);
    assert.equal(second.nextCursor, null);
    await assert.rejects(
      listLegalSourceReviews(env, reviewer, {
        status: "pending",
        scope: "all",
        sourceKind: "all",
        language: "all",
        cursor: "not-a-cursor",
      }, { now: REVIEW_AT }),
    );
  } finally {
    sqlite.close();
  }
});

test("workable review inbox reveals an active claim only to its reviewer", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const fixture = await normalizedReviewFixture(env, 223);
    const firstReviewer = insertStaff(sqlite, "list-owner", "legal_reviewer");
    const secondReviewer = insertStaff(sqlite, "list-other", "legal_reviewer");
    await claimLegalSourceReview(env, firstReviewer, fixture.reviewId, {
      now: REVIEW_AT,
    });
    const mine = await listLegalSourceReviews(env, firstReviewer, {
      status: "in_review", scope: "workable",
    }, { now: REVIEW_AT });
    assert.equal(mine.items.length, 1);
    assert.equal(mine.items[0].assignedToMe, true);
    const otherWork = await listLegalSourceReviews(env, secondReviewer, {
      status: "in_review", scope: "workable",
    }, { now: REVIEW_AT });
    assert.equal(otherWork.items.length, 0);
    const visibleForAudit = await listLegalSourceReviews(env, secondReviewer, {
      status: "in_review", scope: "all",
    }, { now: REVIEW_AT });
    assert.equal(visibleForAudit.items.length, 1);
    assert.equal(visibleForAudit.items[0].assignedToMe, false);
  } finally {
    sqlite.close();
  }
});

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

test("publication atomically creates verified reading rows and immutable evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const approved = await approvedReviewFixture(env, sqlite, 205, "publish");
    const publisher = insertStaff(sqlite, "publisher", "legal_reviewer");
    const input = {
      reviewId: approved.fixture.reviewId,
      expectedDecisionEvidenceSha256:
        approved.decision.decisionEvidenceSha256,
    };
    const result = await publishApprovedLegalSource(
      env,
      publisher,
      input,
      { now: new Date("2026-07-28T01:14:00.000Z") },
    );
    assert.equal(result.changed, true);
    assert.ok(result.sectionCount > 0);
    assert.equal(result.chunkCount, result.sectionCount);
    assert.match(result.publicationEvidenceSha256, /^[0-9a-f]{64}$/);

    const state = sqlite.prepare(`
      SELECT
        (SELECT status FROM legal_sources WHERE id=?) AS source_status,
        (SELECT verification_state FROM legal_sources WHERE id=?) AS source_state,
        (SELECT status FROM legal_source_versions WHERE id=?) AS version_status,
        (SELECT count(*) FROM legal_source_sections WHERE version_id=?) AS sections,
        (SELECT count(*) FROM legal_source_chunks WHERE version_id=?) AS chunks,
        (SELECT count(*) FROM legal_source_chunks
          WHERE version_id=? AND (vector_id IS NOT NULL OR indexed_at IS NOT NULL)
        ) AS indexed_chunks
    `).get(
      result.sourceId,
      result.sourceId,
      result.versionId,
      result.versionId,
      result.versionId,
      result.versionId,
    ) as Record<string, unknown>;
    assert.deepEqual({ ...state }, {
      source_status: "verified",
      source_state: "verified",
      version_status: "verified",
      sections: result.sectionCount,
      chunks: result.chunkCount,
      indexed_chunks: 0,
    });
    const corpusAt = "2026-07-28T01:14:30.000Z";
    const insertCorpusRun = sqlite.prepare(`
      INSERT INTO source_sync_runs (
        id,environment,source_kind,run_type,status,lock_key,
        started_at,finished_at,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    insertCorpusRun.run(
      "corpus_lex_205", "development", "lex", "manual_corpus",
      "success", "development:lex:manual-corpus-205",
      corpusAt, corpusAt, corpusAt, corpusAt,
    );
    insertCorpusRun.run(
      "corpus_advice_205", "development", "advice", "manual_corpus",
      "success", "development:advice:manual-corpus-205",
      corpusAt, corpusAt, corpusAt, corpusAt,
    );
    const retrieval = await retrieveVerifiedLegalSources(
      d1,
      "проверяет документы",
      "ru",
      8,
      { now: new Date("2026-07-28T01:15:00.000Z") },
    );
    assert.equal(retrieval.freshness.status, "fresh");
    assert.equal(retrieval.sources.length, 1);
    assert.equal(retrieval.sources[0]?.id, result.sourceId);
    assert.equal(retrieval.evidence[0]?.publicationId, result.publicationId);
    const publication = sqlite.prepare(`
      SELECT publication_evidence_json,publication_evidence_sha256,
        published_by_user_id
      FROM legal_source_publications WHERE id=?
    `).get(result.publicationId) as Record<string, string>;
    const publicationHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(publication.publication_evidence_json),
    ).then((digest) => Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join(""));
    assert.equal(publicationHash, publication.publication_evidence_sha256);
    assert.equal(publication.published_by_user_id, publisher.userId);
    assert.equal((await publishApprovedLegalSource(
      env,
      publisher,
      input,
      { now: new Date("2026-07-28T01:15:00.000Z") },
    )).changed, false);
    const originalFetch = globalThis.fetch;
    const upserted: IndexedVector[] = [];
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { input: string[]; dimensions: number };
      assert.equal(request.dimensions, 1536);
      return new Response(JSON.stringify({
        data: request.input.map((_text, index) => ({
          index, embedding: Array.from({ length: 1536 }, () => 0.01),
        })),
      }));
    };
    try {
      const indexed = await executeLegalSourceIndexing({
        DB: d1, APP_ENV: "development", OPENAI_API_KEY: "synthetic-key",
        EMBEDDING_MODEL: "text-embedding-3-large",
        LEX_UZ_INDEX: { upsert: async (vectors: IndexedVector[]) => {
          upserted.push(...vectors); return { ids: vectors.map((vector: IndexedVector) => vector.id) };
        } } as unknown as VectorizeIndex,
        ADVICE_UZ_INDEX: { upsert: async () => ({ ids: [] }) } as unknown as VectorizeIndex,
      }, result.versionId, { now: new Date("2026-07-28T01:15:30.000Z") });
      assert.equal(indexed.indexedChunks, result.chunkCount);
      assert.equal(upserted.length, result.chunkCount);
      const indexedCount = sqlite.prepare(`SELECT count(*) AS count FROM legal_source_chunks
        WHERE version_id=? AND vector_id IS NOT NULL AND indexed_at IS NOT NULL`).get(result.versionId) as { count: number };
      assert.equal(indexedCount.count, result.chunkCount);
      assert.equal((await publishApprovedLegalSource(env, publisher, input, {
        now: new Date("2026-07-28T01:15:00.000Z"),
      })).changed, false);
    } finally {
      globalThis.fetch = originalFetch;
    }    assert.throws(
      () => sqlite.prepare(`
        UPDATE legal_source_publications SET published_at=? WHERE id=?
      `).run("2026-07-28T01:16:00.000Z", result.publicationId),
      /legal source publication evidence is immutable/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM legal_source_publications WHERE id=?")
        .run(result.publicationId),
      /legal source publication evidence cannot be deleted/,
    );
  } finally {
    sqlite.close();
  }
});

test("publication splits an oversized normalized block into bounded anchored rows", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const approved = await approvedReviewFixture(
      env,
      sqlite,
      210,
      "oversized-block",
      legalDocument("Большой закон", "Длинная норма закона ".repeat(700)),
    );
    const publisher = insertStaff(
      sqlite,
      "publisher-oversized",
      "legal_reviewer",
    );
    const input = {
      reviewId: approved.fixture.reviewId,
      expectedDecisionEvidenceSha256:
        approved.decision.decisionEvidenceSha256,
    };
    const result = await publishApprovedLegalSource(env, publisher, input, {
      now: new Date("2026-07-28T01:14:00.000Z"),
    });
    const bounds = sqlite.prepare(`
      SELECT max(length(body_text)) AS max_length,
        count(*) AS row_count,
        count(DISTINCT canonical_ref) AS ref_count,
        sum(CASE WHEN canonical_ref LIKE '%:chars:%' THEN 1 ELSE 0 END)
          AS ranged_count
      FROM legal_source_sections WHERE version_id=?
    `).get(result.versionId) as Record<string, number>;
    assert.ok(result.sectionCount > 2);
    assert.ok(bounds.max_length <= 8_000);
    assert.equal(bounds.row_count, result.sectionCount);
    assert.equal(bounds.ref_count, result.sectionCount);
    assert.ok(bounds.ranged_count >= 2);
    assert.equal((await publishApprovedLegalSource(
      env,
      publisher,
      input,
      { now: new Date("2026-07-28T01:15:00.000Z") },
    )).changed, false);
  } finally {
    sqlite.close();
  }
});

test("publication access and evidence mismatches fail before trust promotion", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const approved = await approvedReviewFixture(env, sqlite, 206, "denial");
    const support = insertStaff(sqlite, "publish-support", "support");
    await assert.rejects(
      publishApprovedLegalSource(env, support, { malformed: true }, {
        now: REVIEW_AT,
      }),
      PlatformStaffAccessError,
    );
    const publisher = insertStaff(sqlite, "publish-evidence", "legal_reviewer");
    await expectPublicationError(
      publishApprovedLegalSource(env, publisher, {
        reviewId: approved.fixture.reviewId,
        expectedDecisionEvidenceSha256: "f".repeat(64),
      }, { now: new Date("2026-07-28T01:14:00.000Z") }),
      "LEGAL_SOURCE_PUBLICATION_EVIDENCE_CONFLICT",
    );
    assert.equal(
      (
        sqlite.prepare(`
          SELECT verification_state FROM legal_sources WHERE id=(
            SELECT source_id FROM legal_source_versions WHERE id=?
          )
        `).get(approved.fixture.versionId) as { verification_state: string }
      ).verification_state,
      "fetched",
    );
    assert.equal(
      (
        sqlite.prepare("SELECT count(*) AS value FROM legal_source_publications")
          .get() as { value: number }
      ).value,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("concurrent publication has one durable winner and one verified replay", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const approved = await approvedReviewFixture(env, sqlite, 207, "race");
    const first = insertStaff(sqlite, "publisher-race-a", "legal_reviewer");
    const second = insertStaff(sqlite, "publisher-race-b", "legal_reviewer");
    const input = {
      reviewId: approved.fixture.reviewId,
      expectedDecisionEvidenceSha256:
        approved.decision.decisionEvidenceSha256,
    };
    const results = await Promise.all([
      publishApprovedLegalSource(env, first, input, {
        now: new Date("2026-07-28T01:14:00.000Z"),
      }),
      publishApprovedLegalSource(env, second, input, {
        now: new Date("2026-07-28T01:14:01.000Z"),
      }),
    ]);
    assert.deepEqual(
      results.map((result) => result.changed).sort(),
      [false, true],
    );
    assert.equal(results[0].publicationId, results[1].publicationId);
    assert.equal(
      (
        sqlite.prepare("SELECT count(*) AS value FROM legal_source_publications")
          .get() as { value: number }
      ).value,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("publication rejects a changed normalized object and pre-existing reading data", async () => {
  const tampered = sqliteD1Fixture();
  const tamperedBucket = new FakeR2Bucket();
  const tamperedEnv = reviewEnv(tampered.d1, tamperedBucket);
  try {
    const approved = await approvedReviewFixture(
      tamperedEnv,
      tampered.sqlite,
      208,
      "tampered-publish",
    );
    const publisher = insertStaff(
      tampered.sqlite,
      "publisher-tampered",
      "legal_reviewer",
    );
    const parsed = tamperedBucket.objects.get(approved.fixture.parsedObjectKey);
    assert.ok(parsed);
    parsed.bytes = new TextEncoder().encode('{"changed":true}');
    await expectPublicationError(
      publishApprovedLegalSource(tamperedEnv, publisher, {
        reviewId: approved.fixture.reviewId,
        expectedDecisionEvidenceSha256:
          approved.decision.decisionEvidenceSha256,
      }, { now: new Date("2026-07-28T01:14:00.000Z") }),
      "LEGAL_SOURCE_PUBLICATION_SOURCE_UNAVAILABLE",
    );
  } finally {
    tampered.sqlite.close();
  }

  const seeded = sqliteD1Fixture();
  const seededBucket = new FakeR2Bucket();
  const seededEnv = reviewEnv(seeded.d1, seededBucket);
  try {
    const approved = await approvedReviewFixture(
      seededEnv,
      seeded.sqlite,
      209,
      "seeded-publish",
    );
    const publisher = insertStaff(
      seeded.sqlite,
      "publisher-seeded",
      "legal_reviewer",
    );
    seeded.sqlite.prepare(`
      INSERT INTO legal_source_sections (
        id,version_id,canonical_ref,body_text,sequence,content_sha256,created_at
      ) VALUES ('foreign-section',?,'foreign','unexpected',0,?,?)
    `).run(
      approved.fixture.versionId,
      "a".repeat(64),
      "2026-07-28T01:13:00.000Z",
    );
    await expectPublicationError(
      publishApprovedLegalSource(seededEnv, publisher, {
        reviewId: approved.fixture.reviewId,
        expectedDecisionEvidenceSha256:
          approved.decision.decisionEvidenceSha256,
      }, { now: new Date("2026-07-28T01:14:00.000Z") }),
      "LEGAL_SOURCE_PUBLICATION_STATE_CONFLICT",
    );
  } finally {
    seeded.sqlite.close();
  }
});

test("disabled legal-source staff list is indistinguishable and touches no session", async () => {
  let sessionRequested = false;
  const response = await handleLegalSourceReviewListRequest(
    staffListRequest("/api/platform/legal-sources/reviews?lang=ru"),
    {
      enabled: "false",
      sessionForRequest: async () => {
        sessionRequested = true;
        throw new Error("Disabled route must not resolve a session.");
      },
    },
  );
  assert.equal(response.status, 404);
  assert.equal(sessionRequested, false);
  assert.deepEqual(await response.json(), {
    code: "NOT_FOUND",
    error: "Маршрут не найден.",
  });
});

test("legal-source staff list authorizes before query parsing and returns bounded metadata", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    await normalizedReviewFixture(env, 224);
    const support = insertStaff(sqlite, "list-http-support", "support");
    const denied = await handleLegalSourceReviewListRequest(
      staffListRequest("/api/platform/legal-sources/reviews?status=invalid"),
      {
        enabled: "true", env,
        sessionForRequest: async () => support,
        now: () => REVIEW_AT,
      },
    );
    assert.equal(denied.status, 403);
    assert.equal(((await denied.json()) as { code: string }).code, "ACCESS_DENIED");

    const reviewer = insertStaff(sqlite, "list-http-reviewer", "legal_reviewer");
    const duplicate = await handleLegalSourceReviewListRequest(
      staffListRequest("/api/platform/legal-sources/reviews?status=pending&status=pending"),
      {
        enabled: "true", env,
        sessionForRequest: async () => reviewer,
        now: () => REVIEW_AT,
      },
    );
    assert.equal(duplicate.status, 400);
    const response = await handleLegalSourceReviewListRequest(
      staffListRequest("/api/platform/legal-sources/reviews?lang=uz&status=pending&scope=workable&limit=10"),
      {
        enabled: "true", env,
        sessionForRequest: async () => reviewer,
        now: () => REVIEW_AT,
      },
    );
    assert.equal(response.status, 200);
    const body = await response.json() as ListResponseForTest;
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].sourceKind, "lex");
    assert.equal(Object.hasOwn(body.items[0], "parsedObjectKey"), false);
  } finally {
    sqlite.close();
  }
});

type ListResponseForTest = {
  items: Array<Record<string, unknown> & { sourceKind: string }>;
};

test("disabled legal-source staff HTTP routes are indistinguishable and touch no session", async () => {
  let sessionRequested = false;
  const response = await handleLegalSourceReviewClaimRequest(
    staffRequest("/api/platform/legal-sources/reviews/hidden/claim?lang=uz"),
    "hidden",
    {
      enabled: "false",
      sessionForRequest: async () => {
        sessionRequested = true;
        throw new Error("Disabled route must not resolve a session.");
      },
    },
  );
  assert.equal(response.status, 404);
  assert.equal(sessionRequested, false);
  assert.deepEqual(await response.json(), {
    code: "NOT_FOUND",
    error: "Yo‘nalish topilmadi.",
  });
});

test("legal-source staff HTTP authorization and path validation precede body parsing", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const fixture = await normalizedReviewFixture(env, 211);
    const support = insertStaff(sqlite, "staff-http-support", "support");
    const response = await handleLegalSourceReviewDecisionRequest(
      new Request(
        `https://app.juro.test/api/platform/legal-sources/reviews/${fixture.reviewId}/decision`,
        {
          method: "POST",
          headers: {
            origin: "https://app.juro.test",
            "sec-fetch-site": "same-origin",
            "x-juro-csrf": "1",
            "content-type": "application/json",
          },
          body: "{malformed",
        },
      ),
      fixture.reviewId,
      {
        enabled: "true",
        env,
        sessionForRequest: async () => support,
        now: () => REVIEW_AT,
      },
    );
    assert.equal(response.status, 403);
    const body = await response.json() as { code: string };
    assert.equal(body.code, "ACCESS_DENIED");
    const reviewer = insertStaff(
      sqlite,
      "staff-http-path-reviewer",
      "legal_reviewer",
    );
    const invalidPathResponse = await handleLegalSourceReviewDecisionRequest(
      new Request(
        "https://app.juro.test/api/platform/legal-sources/reviews/invalid/decision",
        {
          method: "POST",
          headers: {
            origin: "https://app.juro.test",
            "sec-fetch-site": "same-origin",
            "x-juro-csrf": "1",
            "content-type": "application/json",
          },
          body: "{malformed",
        },
      ),
      "../invalid",
      {
        enabled: "true",
        env,
        sessionForRequest: async () => reviewer,
        now: () => REVIEW_AT,
      },
    );
    assert.equal(invalidPathResponse.status, 400);
    assert.equal(
      ((await invalidPathResponse.json()) as { code: string }).code,
      "INVALID_INPUT",
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

test("protected legal-source HTTP flow claims, decides, and publishes real D1/R2 evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const fixture = await normalizedReviewFixture(env, 212);
    const reviewer = insertStaff(sqlite, "staff-http-reviewer", "legal_reviewer");
    const publisher = insertStaff(sqlite, "staff-http-publisher", "legal_reviewer");
    const reviewerDependencies = {
      enabled: "true",
      env,
      sessionForRequest: async () => reviewer,
      now: () => REVIEW_AT,
    };
    const claimResponse = await handleLegalSourceReviewClaimRequest(
      staffRequest(
        `/api/platform/legal-sources/reviews/${fixture.reviewId}/claim`,
      ),
      fixture.reviewId,
      reviewerDependencies,
    );
    assert.equal(claimResponse.status, 200);
    const claimBody = await claimResponse.json() as {
      review: { status: string; changed: boolean };
      source: {
        rawContentSha256: string;
        parsedContentSha256: string;
        blocks: unknown[];
        plainText?: string;
      };
    };
    assert.deepEqual(claimBody.review, {
      reviewId: fixture.reviewId,
      reviewerUserId: reviewer.userId,
      status: "in_review",
      changed: true,
    });
    assert.ok(claimBody.source.blocks.length > 0);
    assert.equal(Object.hasOwn(claimBody.source, "plainText"), false);

    const decisionResponse = await handleLegalSourceReviewDecisionRequest(
      staffRequest(
        `/api/platform/legal-sources/reviews/${fixture.reviewId}/decision`,
        {
          decision: "approve",
          notes: "HTTP-контур подтвердил точный снимок источника для публикации.",
          expectedRawContentSha256: claimBody.source.rawContentSha256,
          expectedParsedContentSha256: claimBody.source.parsedContentSha256,
        },
      ),
      fixture.reviewId,
      {
        ...reviewerDependencies,
        now: () => new Date("2026-07-28T01:12:00.000Z"),
      },
    );
    assert.equal(decisionResponse.status, 200);
    const decisionBody = await decisionResponse.json() as {
      decision: { decisionEvidenceSha256: string; publicationRequired: boolean };
    };
    assert.equal(decisionBody.decision.publicationRequired, true);

    const publicationRequestBody = {
      expectedDecisionEvidenceSha256:
        decisionBody.decision.decisionEvidenceSha256,
    };
    const publisherDependencies = {
      enabled: "true",
      env,
      sessionForRequest: async () => publisher,
      now: () => new Date("2026-07-28T01:14:00.000Z"),
    };
    const publicationResponse = await handleLegalSourcePublicationRequest(
      staffRequest(
        `/api/platform/legal-sources/reviews/${fixture.reviewId}/publication`,
        publicationRequestBody,
      ),
      fixture.reviewId,
      publisherDependencies,
    );
    assert.equal(publicationResponse.status, 200);
    const publicationBody = await publicationResponse.json() as {
      publication: { changed: boolean; sectionCount: number };
    };
    assert.equal(publicationBody.publication.changed, true);
    assert.ok(publicationBody.publication.sectionCount > 0);
    const replayResponse = await handleLegalSourcePublicationRequest(
      staffRequest(
        `/api/platform/legal-sources/reviews/${fixture.reviewId}/publication`,
        publicationRequestBody,
      ),
      fixture.reviewId,
      {
        ...publisherDependencies,
        now: () => new Date("2026-07-28T01:15:00.000Z"),
      },
    );
    assert.equal(replayResponse.status, 200);
    assert.equal(
      ((await replayResponse.json()) as { publication: { changed: boolean } })
        .publication.changed,
      false,
    );
  } finally {
    sqlite.close();
  }
});
test("replacement publication atomically archives the previous current version", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const first = await approvedReviewFixture(
      env,
      sqlite,
      240,
      "replacement-first",
      legalDocument("Закон 240", "Первая проверенная редакция нормы."),
    );
    const publisher = insertStaff(
      sqlite,
      "replacement-publisher",
      "legal_reviewer",
    );
    const firstPublication = await publishApprovedLegalSource(
      env,
      publisher,
      {
        reviewId: first.fixture.reviewId,
        expectedDecisionEvidenceSha256:
          first.decision.decisionEvidenceSha256,
      },
      { now: new Date("2026-07-28T01:13:00.000Z") },
    );
    assert.equal(firstPublication.activationType, "activated_initial");

    const second = await approvedReviewFixture(
      env,
      sqlite,
      240,
      "replacement-second",
      legalDocument(
        "Закон 240",
        "Вторая проверенная редакция нормы с изменённым порядком действий.",
      ),
      "_replacement",
    );
    const secondPublication = await publishApprovedLegalSource(
      env,
      publisher,
      {
        reviewId: second.fixture.reviewId,
        expectedDecisionEvidenceSha256:
          second.decision.decisionEvidenceSha256,
      },
      { now: new Date("2026-07-28T01:14:00.000Z") },
    );
    assert.equal(secondPublication.activationType, "activated_replacement");

    assert.deepEqual({
      ...sqlite.prepare(`
        SELECT
          (SELECT status FROM legal_source_versions WHERE id=?)
            AS first_status,
          (SELECT status FROM legal_source_versions WHERE id=?)
            AS second_status,
          current.publication_id AS current_publication_id,
          current.version_id AS current_version_id,
          source.content_sha256 AS source_sha256
        FROM legal_source_current_activations current
        INNER JOIN legal_sources source ON source.id=current.source_id
        WHERE current.source_id=?
      `).get(
        firstPublication.versionId,
        secondPublication.versionId,
        secondPublication.sourceId,
      ) as Record<string, unknown>,
    }, {
      first_status: "archived",
      second_status: "verified",
      current_publication_id: secondPublication.publicationId,
      current_version_id: secondPublication.versionId,
      source_sha256: second.fixture.rawContentSha256,
    });
    const events = sqlite.prepare(`
      SELECT event_type,publication_id,previous_publication_id
      FROM legal_source_lifecycle_events
      WHERE source_id=?
      ORDER BY occurred_at
    `).all(secondPublication.sourceId) as Array<Record<string, unknown>>;
    assert.deepEqual(events.map((row) => ({ ...row })), [
      {
        event_type: "activated_initial",
        publication_id: firstPublication.publicationId,
        previous_publication_id: null,
      },
      {
        event_type: "activated_replacement",
        publication_id: secondPublication.publicationId,
        previous_publication_id: firstPublication.publicationId,
      },
    ]);
    const historicalReplay = await publishApprovedLegalSource(
      env,
      publisher,
      {
        reviewId: first.fixture.reviewId,
        expectedDecisionEvidenceSha256:
          first.decision.decisionEvidenceSha256,
      },
      { now: new Date("2026-07-28T01:14:30.000Z") },
    );
    assert.equal(historicalReplay.changed, false);
    assert.equal(historicalReplay.publicationId, firstPublication.publicationId);
    assert.throws(
      () => sqlite.prepare(`
        UPDATE legal_source_current_activations
        SET publication_id=?,version_id=? WHERE source_id=?
      `).run(
        firstPublication.publicationId,
        firstPublication.versionId,
        firstPublication.sourceId,
      ),
      /legal source current activation invalid/,
    );
  } finally {
    sqlite.close();
  }
});

test("withdrawal is atomic, immutable, replay-safe, and removes current trust", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const approved = await approvedReviewFixture(
      env,
      sqlite,
      241,
      "withdrawal",
    );
    const publisher = insertStaff(
      sqlite,
      "withdrawal-publisher",
      "legal_reviewer",
    );
    const publication = await publishApprovedLegalSource(
      env,
      publisher,
      {
        reviewId: approved.fixture.reviewId,
        expectedDecisionEvidenceSha256:
          approved.decision.decisionEvidenceSha256,
      },
      { now: new Date("2026-07-28T01:13:00.000Z") },
    );
    const successor = await approvedReviewFixture(
      env,
      sqlite,
      241,
      "withdrawal-successor",
      legalDocument(
        "Закон 241",
        "Новая редакция была одобрена до отзыва текущей публикации.",
      ),
      "_withdrawal_successor",
    );
    const input = {
      publicationId: publication.publicationId,
      expectedPublicationEvidenceSha256:
        publication.publicationEvidenceSha256,
      reasonNotes:
        "Официальный источник требует повторной юридической проверки перед дальнейшим использованием.",
    };
    const results = await Promise.all([
      withdrawPublishedLegalSource(env, publisher, input, {
        now: new Date("2026-07-28T01:14:00.000Z"),
      }),
      withdrawPublishedLegalSource(env, publisher, input, {
        now: new Date("2026-07-28T01:14:01.000Z"),
      }),
    ]);
    assert.deepEqual(
      results.map((result) => result.changed).sort(),
      [false, true],
    );
    assert.equal(results[0].eventId, results[1].eventId);
    assert.deepEqual({
      ...sqlite.prepare(`
        SELECT
          (SELECT status FROM legal_sources WHERE id=?) AS source_status,
          (SELECT verification_state FROM legal_sources WHERE id=?)
            AS source_state,
          (SELECT status FROM legal_source_versions WHERE id=?)
            AS version_status,
          (SELECT count(*) FROM legal_source_current_activations
            WHERE source_id=?) AS current_count,
          (SELECT count(*) FROM legal_source_lifecycle_events
            WHERE source_id=? AND event_type='withdrawn') AS withdrawal_count
      `).get(
        publication.sourceId,
        publication.sourceId,
        publication.versionId,
        publication.sourceId,
        publication.sourceId,
      ) as Record<string, unknown>,
    }, {
      source_status: "archived",
      source_state: "archived",
      version_status: "archived",
      current_count: 0,
      withdrawal_count: 1,
    });
    assert.equal((await publishApprovedLegalSource(
      env,
      publisher,
      {
        reviewId: approved.fixture.reviewId,
        expectedDecisionEvidenceSha256:
          approved.decision.decisionEvidenceSha256,
      },
      { now: new Date("2026-07-28T01:14:30.000Z") },
    )).changed, false);
    await assert.rejects(
      withdrawPublishedLegalSource(env, publisher, {
        ...input,
        reasonNotes: "Другая причина не может переписать сохранённое решение.",
      }, { now: new Date("2026-07-28T01:14:30.000Z") }),
      (error) => error instanceof LegalSourceLifecycleError
        && error.code === "LEGAL_SOURCE_LIFECYCLE_EVIDENCE_CONFLICT",
    );
    const eventId = results[0].eventId;
    assert.throws(
      () => sqlite.prepare(`
        UPDATE legal_source_lifecycle_events
        SET reason_notes='tamper' WHERE id=?
      `).run(eventId),
      /legal source lifecycle evidence is immutable/,
    );
    assert.throws(
      () => sqlite.prepare(
        "DELETE FROM legal_source_lifecycle_events WHERE id=?",
      ).run(eventId),
      /legal source lifecycle evidence cannot be deleted/,
    );
    const reactivated = await publishApprovedLegalSource(
      env,
      publisher,
      {
        reviewId: successor.fixture.reviewId,
        expectedDecisionEvidenceSha256:
          successor.decision.decisionEvidenceSha256,
      },
      { now: new Date("2026-07-28T01:15:00.000Z") },
    );
    assert.equal(reactivated.activationType, "activated_replacement");
    assert.deepEqual({
      ...sqlite.prepare(`
        SELECT publication_id,version_id
        FROM legal_source_current_activations
        WHERE source_id=?
      `).get(publication.sourceId) as Record<string, unknown>,
    }, {
      publication_id: reactivated.publicationId,
      version_id: reactivated.versionId,
    });
    const reactivationEvent = sqlite.prepare(`
      SELECT previous_publication_id,previous_version_id
      FROM legal_source_lifecycle_events
      WHERE id=?
    `).get(reactivated.activationEventId) as Record<string, unknown>;
    assert.deepEqual({ ...reactivationEvent }, {
      previous_publication_id: publication.publicationId,
      previous_version_id: publication.versionId,
    });
  } finally {
    sqlite.close();
  }
});

test("protected withdrawal HTTP validates access, evidence, and RU/UZ response", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const approved = await approvedReviewFixture(
      env,
      sqlite,
      242,
      "withdrawal-http",
    );
    const publisher = insertStaff(
      sqlite,
      "withdrawal-http-publisher",
      "legal_reviewer",
    );
    const support = insertStaff(
      sqlite,
      "withdrawal-http-support",
      "support",
    );
    const publication = await publishApprovedLegalSource(
      env,
      publisher,
      {
        reviewId: approved.fixture.reviewId,
        expectedDecisionEvidenceSha256:
          approved.decision.decisionEvidenceSha256,
      },
      { now: new Date("2026-07-28T01:13:00.000Z") },
    );
    const path =
      `/api/platform/legal-sources/publications/${publication.publicationId}/withdrawal?lang=uz`;
    const body = {
      expectedPublicationEvidenceSha256:
        publication.publicationEvidenceSha256,
      reasonNotes:
        "Rasmiy manba qayta yuridik tekshiruvdan o‘tkazilishi kerak.",
    };
    const denied = await handleLegalSourceWithdrawalRequest(
      staffRequest(path, body),
      publication.publicationId,
      {
        enabled: "true",
        env,
        sessionForRequest: async () => support,
        now: () => new Date("2026-07-28T01:14:00.000Z"),
      },
    );
    assert.equal(denied.status, 403);
    const response = await handleLegalSourceWithdrawalRequest(
      staffRequest(path, body),
      publication.publicationId,
      {
        enabled: "true",
        env,
        sessionForRequest: async () => publisher,
        now: () => new Date("2026-07-28T01:14:00.000Z"),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(
      ((await response.json()) as { withdrawal: { changed: boolean } })
        .withdrawal.changed,
      true,
    );
    const list = await listLegalSourceReviews(
      env,
      publisher,
      { status: "approved", scope: "all", limit: 10 },
      { now: new Date("2026-07-28T01:14:30.000Z") },
    );
    const item = list.items.find(
      (candidate) => candidate.reviewId === approved.fixture.reviewId,
    );
    assert.ok(item);
    assert.equal(item.publicationId, publication.publicationId);
    assert.equal(item.isCurrentPublication, false);
  } finally {
    sqlite.close();
  }
});

test("disabled legal-source sync route returns NOT_FOUND and does not touch session", async () => {
  let sessionRequested = false;
  const response = await handleLegalSourceSyncRequest(
    staffRequest("/api/platform/legal-sources/sync"),
    {
      enabled: "false",
      sessionForRequest: async () => {
        sessionRequested = true;
        throw new Error("Disabled sync route must not resolve a session.");
      },
    },
  );
  assert.equal(response.status, 404);
  assert.equal(sessionRequested, false);
  assert.deepEqual(await response.json(), {
    code: "NOT_FOUND",
    error: "Маршрут не найден.",
  });
});

test("legal-source sync route requires reviewer role before request parsing", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const support = insertStaff(sqlite, "sync-support", "support");
    const response = await handleLegalSourceSyncRequest(
      staffRequest(
        "/api/platform/legal-sources/sync",
        {
          url: "https://lex.uz/ru/docs/-301",
          idempotencyKey: "reviewer_sync_not_allowed_301",
        },
      ),
      {
        enabled: "true",
        env,
        sessionForRequest: async () => support,
        now: () => REVIEW_AT,
      },
    );
    assert.equal(response.status, 403);
    assert.equal(((await response.json()) as { code: string }).code, "ACCESS_DENIED");
  } finally {
    sqlite.close();
  }
});

test("legal-source sync route validates idempotency payload and rejects malformed requests", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const reviewer = insertStaff(sqlite, "sync-reviewer", "legal_reviewer");
    const invalidBody = await handleLegalSourceSyncRequest(
      new Request("https://app.juro.test/api/platform/legal-sources/sync", {
        method: "POST",
        headers: {
          origin: "https://app.juro.test",
          "sec-fetch-site": "same-origin",
          "x-juro-csrf": "1",
          "content-type": "application/json",
        },
        body: "{invalid",
      }),
      {
        enabled: "true",
        env,
        sessionForRequest: async () => reviewer,
        now: () => REVIEW_AT,
      },
    );
    assert.equal(invalidBody.status, 400);
    assert.equal(((await invalidBody.json()) as { code: string }).code, "INVALID_JSON");

    const spoofedActor = await handleLegalSourceSyncRequest(
      staffRequest("/api/platform/legal-sources/sync", {
        url: "https://lex.uz/ru/docs/-302",
        idempotencyKey: "legal_source_sync_spoofed_actor_302",
        requestedByUserId: "another-user",
      }),
      {
        enabled: "true",
        env,
        sessionForRequest: async () => reviewer,
        now: () => REVIEW_AT,
      },
    );
    assert.equal(spoofedActor.status, 400);
    assert.equal(
      ((await spoofedActor.json()) as { code: string }).code,
      "INVALID_INPUT",
    );
  } finally {
    sqlite.close();
  }
});

test("legal-source sync endpoint creates legal source fetch request and queue envelope", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const reviewer = insertStaff(sqlite, "sync-reviewer-success", "legal_reviewer");
    const response = await handleLegalSourceSyncRequest(
      staffRequest(
        "/api/platform/legal-sources/sync?lang=ru",
        {
          url: "https://lex.uz/ru/docs/-302",
          idempotencyKey: "legal_source_sync_302",
          correlationId: "sync_corr_302",
        },
      ),
      {
        enabled: "true",
        env,
        sessionForRequest: async () => reviewer,
        now: () => new Date("2026-07-28T01:10:00.000Z"),
      },
    );
    assert.equal(response.status, 200);
    const responseBody = await response.json() as {
      ok: boolean;
      request: { requestId: string; sourceKind: string; locale: string; status: string };
    };
    assert.equal(responseBody.ok, true);
    assert.equal(responseBody.request.sourceKind, "lex");
    assert.equal(responseBody.request.locale, "ru");
    assert.equal(responseBody.request.status, "queued");

    const fetchRow = sqlite.prepare(`
      SELECT id, source_kind, locale, requested_url, status, requested_by_user_id
      FROM legal_source_fetch_requests
      WHERE id = ?
    `).get(responseBody.request.requestId) as {
      id: string;
      source_kind: string;
      locale: string;
      requested_url: string;
      status: string;
      requested_by_user_id: string;
    };
    assert.equal(fetchRow.id, responseBody.request.requestId);
    assert.equal(fetchRow.source_kind, "lex");
    assert.equal(fetchRow.locale, "ru");
    assert.equal(fetchRow.requested_url, "https://lex.uz/ru/docs/-302");
    assert.equal(fetchRow.status, "queued");
    assert.equal(fetchRow.requested_by_user_id, reviewer.userId);

    const job = sqlite.prepare(`
      SELECT queue_binding, job_type, subject_id, status
      FROM job_outbox
      WHERE subject_id = ?
      LIMIT 1
    `).get(responseBody.request.requestId) as {
      queue_binding: string;
      job_type: string;
      subject_id: string;
      status: string;
    };
    assert.equal(job.queue_binding, "LEGAL_SOURCES_SYNC_QUEUE");
    assert.equal(job.job_type, "legal.sync");
    assert.equal(job.subject_id, responseBody.request.requestId);
    assert.equal(job.status, "pending");
  } finally {
    sqlite.close();
  }
});

test("advice sync request is blocked when advice ingestion policy is off", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = reviewEnv(d1, bucket);
  try {
    const reviewer = insertStaff(sqlite, "sync-advice-reviewer", "legal_reviewer");
    const response = await handleLegalSourceSyncRequest(
      staffRequest(
        "/api/platform/legal-sources/sync?lang=uz",
        {
          url: "https://advice.uz/ru/documents/99",
          idempotencyKey: "advice_sync_disabled_99",
        },
      ),
      {
        enabled: "true",
        env,
        sessionForRequest: async () => reviewer,
        now: () => REVIEW_AT,
      },
    );
    assert.equal(response.status, 409);
    assert.equal(
      ((await response.json()) as { code: string }).code,
      "LEGAL_SOURCE_POLICY_DISABLED",
    );
  } finally {
    sqlite.close();
  }
});
test("enabled advice sync route queues canonical Uzbek Latin document URLs", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new FakeR2Bucket();
  const env = {
    ...reviewEnv(d1, bucket),
    LEGAL_ADVICE_INGESTION_ENABLED: "true",
  };
  try {
    const reviewer = insertStaff(sqlite, "sync-advice-enabled", "legal_reviewer");
    const response = await handleLegalSourceSyncRequest(
      staffRequest(
        "/api/platform/legal-sources/sync?lang=uz",
        {
          url: "https://www.advice.uz/oz/documents/624/",
          idempotencyKey: "advice_sync_enabled_624",
        },
      ),
      {
        enabled: "true",
        env,
        sessionForRequest: async () => reviewer,
        now: () => REVIEW_AT,
      },
    );
    assert.equal(response.status, 200);
    const body = await response.json() as {
      ok: boolean;
      request: {
        requestId: string;
        sourceKind: string;
        locale: string;
        canonicalUrl: string;
        status: string;
      };
    };
    assert.equal(body.ok, true);
    assert.deepEqual(body.request, {
      requestId: body.request.requestId,
      sourceKind: "advice",
      locale: "uz",
      canonicalUrl: "https://advice.uz/oz/documents/624",
      status: "queued",
    });
    assert.equal(
      (sqlite.prepare("SELECT COUNT(*) AS count FROM job_outbox WHERE subject_id = ?")
        .get(body.request.requestId) as { count: number }).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});
