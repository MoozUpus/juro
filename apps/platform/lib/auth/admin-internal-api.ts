import { z } from "zod";

import {
  adminRoleAllows,
  appendAdminDomainAudit,
  consumeAdminDomainHandoff,
  revokeAdminDomainSession,
  requireAdminDomainSession,
  type AdminDomainEnvironment,
} from "./admin-domain-session";
import { moderateLawyerProfile } from "../platform/lawyer-profile-moderation-service";
import { LawyerProfileLifecycleError, transitionLawyerProfileLifecycle } from "../platform/lawyer-profile-lifecycle-service";
import { lawyerReviewModerationInputSchema, lawyerReviewModerationListSchema } from "../platform/lawyer-review-moderation";
import { LawyerReviewModerationServiceError, listLawyerReviews, moderateLawyerReview } from "../platform/lawyer-review-moderation-service";
import {
  LegalCorpusAdminError,
  legalCorpusAdminActionSchema,
  performLegalCorpusAdminAction,
  readLegalCorpusAdminDashboard,
} from "../legal-corpus/admin-operations";
import type { LegalCorpusFeatureFlag } from "../legal-corpus/trust";

const SESSION_HEADER = "x-juro-admin-session";
const INTERNAL_TOKEN_HEADER = "x-juro-admin-internal-token";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const profileIdSchema = z.string().uuid();
const reviewIdSchema = z.string().uuid();
const consumeSchema = z.object({ ticket: z.string().regex(TOKEN_PATTERN) }).strict();
const moderationSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(1).max(2_000),
}).strict();
const lifecycleSchema = z.object({
  action: z.enum(["suspend", "block", "archive", "restore"]),
  reason: z.string().trim().min(1).max(2_000),
}).strict();

type AdminInternalEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  APP_ENV?: string;
  ADMIN_INTERNAL_TOKEN?: string;
  // Production's isolated admin Worker uses a separately provisioned token.
  // Keep the existing token accepted during the rollout so the pre-isolation
  // admin path remains a valid rollback target.
  ADMIN_CONSOLE_TOKEN?: string;
  WORKER_VERSION?: WorkerVersionMetadata;
} & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

export function legalCorpusAdminRuntimeEnv(
  env: AdminInternalEnv,
  db: D1Database,
  appEnvironment: AdminDomainEnvironment,
): AdminInternalEnv & { DB: D1Database; APP_ENV: AdminDomainEnvironment } {
  return {
    DB: db,
    BUCKET: env.BUCKET,
    APP_ENV: appEnvironment,
    LEGAL_CORPUS_ENABLED: env.LEGAL_CORPUS_ENABLED,
    LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: env.LEGAL_CORPUS_LIVE_LEXUZ_ENABLED,
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: env.LEGAL_CORPUS_AUTO_INGEST_ENABLED,
    LEGAL_CORPUS_MULTILINGUAL_ENABLED: env.LEGAL_CORPUS_MULTILINGUAL_ENABLED,
    LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST: env.LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST,
    LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST: env.LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST,
    LEGAL_CORPUS_HISTORICAL_ENABLED: env.LEGAL_CORPUS_HISTORICAL_ENABLED,
    LEGAL_CORPUS_DENSE_ENABLED: env.LEGAL_CORPUS_DENSE_ENABLED,
    LEGAL_CORPUS_SHADOW_MODE: env.LEGAL_CORPUS_SHADOW_MODE,
  };
}

function environment(value: unknown): AdminDomainEnvironment | null {
  return value === "development" || value === "staging" || value === "production"
    ? value
    : null;
}

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

async function fixedTimeTokenMatch(provided: string | null, expected: string | undefined): Promise<boolean> {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

async function parseJson(request: Request, maxBytes = 4_096): Promise<unknown | null> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function requireInternal(env: AdminInternalEnv): Promise<{ db: D1Database; environment: AdminDomainEnvironment }> {
  const appEnvironment = environment(env.APP_ENV);
  if (!env.DB || !appEnvironment || (!env.ADMIN_INTERNAL_TOKEN && !env.ADMIN_CONSOLE_TOKEN)) {
    throw new Error("ADMIN_INTERNAL_UNAVAILABLE");
  }
  return { db: env.DB, environment: appEnvironment };
}

async function hasInternalToken(request: Request, env: AdminInternalEnv): Promise<boolean> {
  const provided = request.headers.get(INTERNAL_TOKEN_HEADER);
  const [legacy, console] = await Promise.all([
    fixedTimeTokenMatch(provided, env.ADMIN_INTERNAL_TOKEN),
    fixedTimeTokenMatch(provided, env.ADMIN_CONSOLE_TOKEN),
  ]);
  return legacy || console;
}

async function requirePrincipal(request: Request, env: AdminInternalEnv) {
  const internal = await hasInternalToken(request, env);
  if (!internal) return null;
  try {
    const runtime = await requireInternal(env);
    const principal = await requireAdminDomainSession(runtime.db, {
      token: request.headers.get(SESSION_HEADER),
      environment: runtime.environment,
    });
    return { ...runtime, principal };
  } catch {
    return null;
  }
}

async function dashboard(request: Request, env: AdminInternalEnv): Promise<Response> {
  const authenticated = await requirePrincipal(request, env);
  if (!authenticated || !adminRoleAllows(authenticated.principal.roles, "dashboard.view")) return noStore({ code: "ACCESS_DENIED" }, 403);
  const [pending, approved, requests, audit] = await Promise.all([
    authenticated.db.prepare("SELECT count(*) AS total FROM lawyer_profiles WHERE marketplace_status='pending_review'").first<{ total: number }>(),
    authenticated.db.prepare("SELECT count(*) AS total FROM lawyer_profiles WHERE marketplace_status='public_approved'").first<{ total: number }>(),
    authenticated.db.prepare("SELECT count(*) AS total FROM lawyer_requests WHERE status NOT IN ('completed','cancelled','rejected')").first<{ total: number }>(),
    authenticated.db.prepare("SELECT count(*) AS total FROM admin_domain_audit_events WHERE environment=?").bind(authenticated.environment).first<{ total: number }>(),
  ]);
  await appendAdminDomainAudit(authenticated.db, {
    environment: authenticated.environment,
    principal: authenticated.principal,
    action: "dashboard_viewed",
    metadata: {},
  });
  return noStore({
    roles: authenticated.principal.roles,
    counts: {
      pendingLawyerProfiles: pending?.total ?? 0,
      approvedLawyerProfiles: approved?.total ?? 0,
      activeLawyerRequests: requests?.total ?? 0,
      adminAuditEvents: audit?.total ?? 0,
    },
    expiresAt: authenticated.principal.expiresAt,
  });
}

async function lawyerProfiles(request: Request, env: AdminInternalEnv): Promise<Response> {
  const authenticated = await requirePrincipal(request, env);
  if (!authenticated || !adminRoleAllows(authenticated.principal.roles, "lawyer.profiles.moderate")) return noStore({ code: "ACCESS_DENIED" }, 403);
  const status = new URL(request.url).searchParams.get("status") ?? "pending_review";
  if (!["profile_incomplete", "pending_review", "changes_requested", "public_approved", "rejected", "suspended", "blocked", "archived"].includes(status)) return noStore({ code: "INVALID_INPUT" }, 400);
  const rows = await authenticated.db.prepare(
    `SELECT p.id,p.display_name AS displayName,p.status,p.marketplace_status AS marketplaceStatus,
       p.profile_revision AS profileRevision,p.city,p.region,p.experience_years AS experienceYears,
       p.price_description AS priceDescription,p.availability_status AS availabilityStatus,
       p.updated_at AS updatedAt
     FROM lawyer_profiles p
     WHERE p.marketplace_status=? ORDER BY p.updated_at ASC,p.id ASC LIMIT 100`,
  ).bind(status).all();
  await appendAdminDomainAudit(authenticated.db, {
    environment: authenticated.environment,
    principal: authenticated.principal,
    action: "lawyer_profiles_viewed",
    entityType: "lawyer_profile_list",
    metadata: { status, count: rows.results.length },
  });
  return noStore({ profiles: rows.results });
}

async function moderateProfile(request: Request, env: AdminInternalEnv, profileId: string): Promise<Response> {
  const authenticated = await requirePrincipal(request, env);
  if (!authenticated || !adminRoleAllows(authenticated.principal.roles, "lawyer.profiles.moderate")) return noStore({ code: "ACCESS_DENIED" }, 403);
  const payload = moderationSchema.safeParse(await parseJson(request));
  if (!payload.success) return noStore({ code: "INVALID_INPUT" }, 400);
  try {
    const result = await moderateLawyerProfile(authenticated.db, {
      profileId,
      moderatorUserId: authenticated.principal.userId,
      decision: payload.data.decision,
      reason: payload.data.reason,
    });
    await appendAdminDomainAudit(authenticated.db, {
      environment: authenticated.environment,
      principal: authenticated.principal,
      action: "lawyer_profile_moderated",
      entityType: "lawyer_profile",
      entityId: profileId,
      metadata: { decision: payload.data.decision },
    });
    return noStore({ ok: true, status: result.status });
  } catch {
    return noStore({ code: "PROFILE_UNAVAILABLE" }, 409);
  }
}

async function transitionProfileLifecycle(request: Request, env: AdminInternalEnv, profileId: string): Promise<Response> {
  const authenticated = await requirePrincipal(request, env);
  if (!authenticated) return noStore({ code: "ACCESS_DENIED" }, 403);
  const payload = lifecycleSchema.safeParse(await parseJson(request));
  if (!payload.success) return noStore({ code: "INVALID_INPUT" }, 400);
  const capability = payload.data.action === "block" ? "lawyer.profiles.block" : "lawyer.profiles.moderate";
  if (!adminRoleAllows(authenticated.principal.roles, capability)) return noStore({ code: "ACCESS_DENIED" }, 403);
  const auditAction = {
    suspend: "lawyer_profile_suspended",
    block: "lawyer_profile_blocked",
    archive: "lawyer_profile_archived",
    restore: "lawyer_profile_restored",
  } as const;
  try {
    const result = await transitionLawyerProfileLifecycle(authenticated.db, {
      profileId,
      actorUserId: authenticated.principal.userId,
      action: payload.data.action,
      reason: payload.data.reason,
    });
    await appendAdminDomainAudit(authenticated.db, {
      environment: authenticated.environment,
      principal: authenticated.principal,
      action: auditAction[payload.data.action],
      entityType: "lawyer_profile",
      entityId: profileId,
      metadata: { status: result.status, profileRevision: result.profileRevision },
    });
    return noStore({ ok: true, status: result.status, profileRevision: result.profileRevision });
  } catch (error) {
    if (error instanceof LawyerProfileLifecycleError) return noStore({ code: error.code }, 409);
    return noStore({ code: "PROFILE_UNAVAILABLE" }, 409);
  }
}

async function reviews(request: Request, env: AdminInternalEnv): Promise<Response> {
  const authenticated = await requirePrincipal(request, env);
  if (!authenticated || !adminRoleAllows(authenticated.principal.roles, "lawyer.reviews.moderate")) return noStore({ code: "ACCESS_DENIED" }, 403);
  const url = new URL(request.url);
  const parsed = lawyerReviewModerationListSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return noStore({ code: "INVALID_INPUT" }, 400);
  const reviews = await listLawyerReviews(authenticated.db, parsed.data);
  await appendAdminDomainAudit(authenticated.db, {
    environment: authenticated.environment,
    principal: authenticated.principal,
    action: "lawyer_reviews_viewed",
    entityType: "lawyer_review_list",
    metadata: { status: parsed.data.status, count: reviews.results.length },
  });
  return noStore({ reviews: reviews.results });
}

async function legalCorpusDashboard(request: Request, env: AdminInternalEnv): Promise<Response> {
  const authenticated = await requirePrincipal(request, env);
  if (!authenticated || !adminRoleAllows(authenticated.principal.roles, "legal.corpus.manage")) {
    return noStore({ code: "ACCESS_DENIED" }, 403);
  }
  console.log(JSON.stringify({
    event: "legal_corpus.admin.runtime_flags",
    environment: authenticated.environment,
    workerVersionId: env.WORKER_VERSION?.id ?? null,
    flags: {
      corpus: env.LEGAL_CORPUS_ENABLED === "true",
      liveLexUz: env.LEGAL_CORPUS_LIVE_LEXUZ_ENABLED === "true",
      autoIngest: env.LEGAL_CORPUS_AUTO_INGEST_ENABLED === "true",
      multilingual: env.LEGAL_CORPUS_MULTILINGUAL_ENABLED === "true",
      ownerAutoTrust: env.LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST === "true",
      userAutoTrust: env.LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST === "true",
      historical: env.LEGAL_CORPUS_HISTORICAL_ENABLED === "true",
      dense: env.LEGAL_CORPUS_DENSE_ENABLED === "true",
      shadow: env.LEGAL_CORPUS_SHADOW_MODE === "true",
    },
  }));
  const dashboard = await readLegalCorpusAdminDashboard({
    env: legalCorpusAdminRuntimeEnv(env, authenticated.db, authenticated.environment),
  });
  await appendAdminDomainAudit(authenticated.db, {
    environment: authenticated.environment,
    principal: authenticated.principal,
    action: "legal_corpus_viewed",
    entityType: "legal_corpus",
    metadata: {
      canonicalDocuments: dashboard.totals.canonicalDocuments,
      indexedChunks: dashboard.totals.indexedChunks,
      failedDocuments: dashboard.totals.failedDocuments,
    },
  });
  return noStore(dashboard);
}

async function legalCorpusAction(request: Request, env: AdminInternalEnv): Promise<Response> {
  const authenticated = await requirePrincipal(request, env);
  if (!authenticated || !adminRoleAllows(authenticated.principal.roles, "legal.corpus.manage")) {
    return noStore({ code: "ACCESS_DENIED" }, 403);
  }
  const payload = legalCorpusAdminActionSchema.safeParse(await parseJson(request));
  if (!payload.success) return noStore({ code: "LEGAL_CORPUS_ADMIN_INVALID" }, 400);
  const now = new Date();
  const assignment = await authenticated.db.prepare(`SELECT id FROM platform_staff_assignments
    WHERE user_id=? AND role='administrator' AND revoked_at IS NULL AND granted_at<=? AND expires_at>?
    ORDER BY granted_at DESC,id LIMIT 1`).bind(
      authenticated.principal.userId,
      now.toISOString(),
      now.toISOString(),
    ).first<{ id: string }>();
  if (!assignment) return noStore({ code: "ACCESS_DENIED" }, 403);
  try {
    const result = await performLegalCorpusAdminAction({
      env: legalCorpusAdminRuntimeEnv(env, authenticated.db, authenticated.environment),
      staff: {
        userId: authenticated.principal.userId,
        sessionId: authenticated.principal.sessionId,
        assignmentIds: [assignment.id],
        mfaVerifiedAt: authenticated.principal.sourceMfaVerifiedAt,
      },
      value: payload.data,
      now,
    });
    await appendAdminDomainAudit(authenticated.db, {
      environment: authenticated.environment,
      principal: authenticated.principal,
      action: `legal_corpus_${result.action}`,
      entityType: "legal_corpus",
      entityId: result.targetId ?? null,
      metadata: { affected: result.affected },
      now,
    });
    return noStore(result, 201);
  } catch (error) {
    if (!(error instanceof LegalCorpusAdminError)) throw error;
    if (error.code === "LEGAL_CORPUS_ADMIN_NOT_FOUND") return noStore({ code: error.code }, 404);
    if (error.code === "LEGAL_CORPUS_ADMIN_DISABLED") return noStore({ code: error.code }, 423);
    if (error.code === "LEGAL_CORPUS_ADMIN_INVALID") return noStore({ code: error.code }, 400);
    return noStore({ code: error.code }, 409);
  }
}

async function moderateReview(request: Request, env: AdminInternalEnv, reviewId: string): Promise<Response> {
  const authenticated = await requirePrincipal(request, env);
  if (!authenticated || !adminRoleAllows(authenticated.principal.roles, "lawyer.reviews.moderate")) return noStore({ code: "ACCESS_DENIED" }, 403);
  const payload = lawyerReviewModerationInputSchema.safeParse(await parseJson(request, 8_192));
  if (!payload.success) return noStore({ code: "INVALID_INPUT" }, 400);
  try {
    const result = await moderateLawyerReview(authenticated.db, {
      reviewId,
      moderatorUserId: authenticated.principal.userId,
      decision: payload.data.decision,
      moderatedBody: payload.data.moderatedBody,
      reason: payload.data.reason,
    });
    await appendAdminDomainAudit(authenticated.db, {
      environment: authenticated.environment,
      principal: authenticated.principal,
      action: "lawyer_review_moderated",
      entityType: "lawyer_review",
      entityId: reviewId,
      metadata: { decision: payload.data.decision },
    });
    return noStore({ ok: true, status: result.status });
  } catch (error) {
    if (error instanceof LawyerReviewModerationServiceError && error.code === "LIKELY_PERSONAL_DATA") {
      return noStore({ code: error.code }, 400);
    }
    return noStore({ code: "REVIEW_UNAVAILABLE" }, 409);
  }
}

async function consume(request: Request, env: AdminInternalEnv): Promise<Response> {
  const internal = await hasInternalToken(request, env);
  if (!internal) return noStore({ code: "ACCESS_DENIED" }, 403);
  const runtime = await requireInternal(env);
  const payload = consumeSchema.safeParse(await parseJson(request, 1_024));
  if (!payload.success) return noStore({ code: "INVALID_INPUT" }, 400);
  const origin = request.headers.get("x-juro-admin-origin");
  if (!origin) return noStore({ code: "INVALID_INPUT" }, 400);
  try {
    const session = await consumeAdminDomainHandoff(runtime.db, {
      ticket: payload.data.ticket,
      environment: runtime.environment,
      destinationOrigin: origin,
    });
    return noStore(session);
  } catch {
    return noStore({ code: "TICKET_DENIED" }, 401);
  }
}

async function logout(request: Request, env: AdminInternalEnv): Promise<Response> {
  const internal = await hasInternalToken(request, env);
  if (!internal) return noStore({ code: "ACCESS_DENIED" }, 403);
  try {
    const runtime = await requireInternal(env);
    await revokeAdminDomainSession(runtime.db, {
      token: request.headers.get(SESSION_HEADER),
      environment: runtime.environment,
    });
    return noStore({ ok: true });
  } catch {
    return noStore({ code: "ACCESS_DENIED" }, 403);
  }
}

export async function handleInternalAdminRequest(request: Request, env: AdminInternalEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/internal/admin/")) return null;
  if (url.pathname === "/api/internal/admin/session/consume" && request.method === "POST") return consume(request, env);
  if (url.pathname === "/api/internal/admin/session/logout" && request.method === "POST") return logout(request, env);
  if (url.pathname === "/api/internal/admin/dashboard" && request.method === "GET") return dashboard(request, env);
  if (url.pathname === "/api/internal/admin/legal-corpus" && request.method === "GET") return legalCorpusDashboard(request, env);
  if (url.pathname === "/api/internal/admin/legal-corpus" && request.method === "POST") return legalCorpusAction(request, env);
  if (url.pathname === "/api/internal/admin/lawyers" && request.method === "GET") return lawyerProfiles(request, env);
  if (url.pathname === "/api/internal/admin/reviews" && request.method === "GET") return reviews(request, env);
  const moderation = /^\/api\/internal\/admin\/lawyers\/([0-9a-f-]{36})\/moderate$/.exec(url.pathname);
  if (moderation && request.method === "POST") {
    const profileId = profileIdSchema.safeParse(moderation[1]);
    if (!profileId.success) return noStore({ code: "NOT_FOUND" }, 404);
    return moderateProfile(request, env, profileId.data);
  }
  const lifecycle = /^\/api\/internal\/admin\/lawyers\/([0-9a-f-]{36})\/lifecycle$/.exec(url.pathname);
  if (lifecycle && request.method === "POST") {
    const profileId = profileIdSchema.safeParse(lifecycle[1]);
    if (!profileId.success) return noStore({ code: "NOT_FOUND" }, 404);
    return transitionProfileLifecycle(request, env, profileId.data);
  }
  const reviewModeration = /^\/api\/internal\/admin\/reviews\/([0-9a-f-]{36})\/moderate$/.exec(url.pathname);
  if (reviewModeration && request.method === "POST") {
    const reviewId = reviewIdSchema.safeParse(reviewModeration[1]);
    if (!reviewId.success) return noStore({ code: "NOT_FOUND" }, 404);
    return moderateReview(request, env, reviewId.data);
  }
  return noStore({ code: "NOT_FOUND" }, 404);
}
