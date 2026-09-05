import { sha256 } from "../../../../../lib/auth/crypto";
import { parseJsonRequest } from "../../../../../lib/auth/input";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  workspaceForUser,
  workspaceForUserById,
} from "../../../../../lib/platform/workspace";
import { z } from "zod";

const create = z.object({
  requestId: z.uuid(),
  requestIdForLawyer: z.uuid(),
  workspaceId: z.string().min(3).max(128).optional(),
  titleRu: z.string().trim().min(3).max(200),
  titleUz: z.string().trim().min(3).max(200),
  titleEn: z.string().trim().min(3).max(200),
  scopeRu: z.string().trim().min(20).max(4_000),
  scopeUz: z.string().trim().min(20).max(4_000),
  scopeEn: z.string().trim().min(20).max(4_000),
  durationDescription: z.string().trim().min(2).max(500),
  durationDescriptionEn: z.string().trim().min(2).max(500).optional(),
  lawyerBaseAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
}).strict();

type Ctx = { params: Promise<{ caseId: string }> };

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "private, no-store" },
});

export const GET = withApiErrors(async (request: Request, context: Ctx) => {
  const user = await requireApiUser();
  const requestedWorkspaceId = new URL(request.url).searchParams.get("workspaceId");
  const workspace = requestedWorkspaceId
    ? await workspaceForUserById(user.id, requestedWorkspaceId)
    : await workspaceForUser(user);
  const { caseId } = await context.params;
  const db = requireD1();
  if (!workspace) return json({ code: "WORKSPACE_UNAVAILABLE" }, 404);

  const rows = await db.prepare(`SELECT id,external_id AS externalId,version,status,
      title_ru AS titleRu,title_uz AS titleUz,title_en AS titleEn,
      scope_ru AS scopeRu,scope_uz AS scopeUz,scope_en AS scopeEn,
      duration_description AS durationDescription,
      duration_description_en AS durationDescriptionEn,
      lawyer_base_amount_minor AS lawyerBaseAmountMinor,currency,
      expires_at AS expiresAt,created_at AS createdAt,updated_at AS updatedAt
    FROM legal_service_proposals
    WHERE case_id=? AND workspace_id=? AND client_user_id=?
    ORDER BY version DESC`)
    .bind(caseId, workspace.id, user.id)
    .all();
  return json({ proposals: rows.results });
});

export const POST = withApiErrors(async (request: Request, context: Ctx) => {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const { caseId } = await context.params;
  const parsed = await parseJsonRequest(request, create, 24_576);
  if (!parsed.ok) return json({ code: "INVALID_INPUT" }, 400);

  const db = requireD1();
  const now = new Date().toISOString();
  const handoff = await db.prepare(`SELECT r.id AS requestId,
      r.workspace_id AS workspaceId,r.requester_user_id AS clientUserId,
      r.lawyer_profile_id AS lawyerProfileId
    FROM lawyer_requests r
    JOIN lawyer_profiles lp ON lp.id=r.lawyer_profile_id AND lp.user_id=?
      AND lp.status='public_approved' AND lp.marketplace_status='public_approved'
    JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id
      AND g.lawyer_user_id=? AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR g.expires_at>?)
    WHERE r.id=? AND r.case_id=? LIMIT 1`)
    .bind(user.id, user.id, now, parsed.data.requestIdForLawyer, caseId)
    .first<{
      requestId: string;
      workspaceId: string;
      clientUserId: string;
      lawyerProfileId: string;
    }>();
  if (!handoff || (parsed.data.workspaceId && parsed.data.workspaceId !== handoff.workspaceId)) {
    return json({ code: "REQUEST_UNAVAILABLE" }, 404);
  }

  const id = crypto.randomUUID();
  const snapshot = { ...parsed.data, caseId, lawyerUserId: user.id };
  await db.batch([
    db.prepare("UPDATE legal_service_proposals SET status='SUPERSEDED',updated_at=? WHERE lawyer_request_id=? AND status='PROPOSED'")
      .bind(now, handoff.requestId),
    db.prepare(`INSERT INTO legal_service_proposals (
        id,external_id,lawyer_request_id,case_id,workspace_id,client_user_id,
        lawyer_profile_id,lawyer_user_id,version,status,
        title_ru,title_uz,title_en,scope_ru,scope_uz,scope_en,
        duration_description,duration_description_en,
        lawyer_base_amount_minor,currency,expires_at,created_at,updated_at
      ) VALUES (
        ?,?,?,?,?,?,?,?,
        COALESCE((SELECT max(version)+1 FROM legal_service_proposals WHERE lawyer_request_id=?),1),
        'PROPOSED',?,?,?,?,?,?,?,?,?,'UZS',?,?,?
      )`)
      .bind(
        id,
        `lsp_${crypto.randomUUID().replaceAll("-", "")}`,
        handoff.requestId,
        caseId,
        handoff.workspaceId,
        handoff.clientUserId,
        handoff.lawyerProfileId,
        user.id,
        handoff.requestId,
        parsed.data.titleRu,
        parsed.data.titleUz,
        parsed.data.titleEn,
        parsed.data.scopeRu,
        parsed.data.scopeUz,
        parsed.data.scopeEn,
        parsed.data.durationDescription,
        parsed.data.durationDescriptionEn ?? null,
        parsed.data.lawyerBaseAmountMinor,
        parsed.data.expiresAt ?? null,
        now,
        now,
      ),
    db.prepare(`INSERT INTO legal_service_proposal_versions
        (id,proposal_id,version,snapshot_json,snapshot_sha256,created_by_user_id,created_at)
      VALUES (?,?,1,?,?,?,?)`)
      .bind(
        crypto.randomUUID(),
        id,
        JSON.stringify(snapshot),
        await sha256(JSON.stringify(snapshot)),
        user.id,
        now,
      ),
    db.prepare("UPDATE lawyer_requests SET status='service_proposal_proposed',updated_at=? WHERE id=?")
      .bind(now, handoff.requestId),
    db.prepare(`INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
      VALUES (?,?,?,'legal_service_proposal',?,'proposed',?,?)`)
      .bind(
        crypto.randomUUID(),
        handoff.workspaceId,
        user.id,
        id,
        JSON.stringify({ caseId, requestId: handoff.requestId }),
        now,
      ),
  ]);
  return json({ ok: true, proposalId: id, status: "PROPOSED" }, 201);
});
