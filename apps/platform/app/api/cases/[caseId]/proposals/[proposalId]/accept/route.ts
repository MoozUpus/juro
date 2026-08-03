import { sha256 } from "../../../../../../../lib/auth/crypto";
import { parseJsonRequest } from "../../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser, workspaceForUserById } from "../../../../../../../lib/platform/workspace";
import { z } from "zod";

const body = z.object({
  requestId: z.uuid(),
  workspaceId: z.string().min(3).max(128).optional(),
  agreementVersion: z.string().min(1).max(100),
  accepted: z.literal(true),
  locale: z.enum(["ru", "uz"]),
}).strict();

type Ctx = { params: Promise<{ caseId: string; proposalId: string }> };
type ExistingAcceptance = { id: string; agreementVersion: string };

const unavailable = () => Response.json({ code: "PROPOSAL_UNAVAILABLE" }, { status: 404 });
const unique = (error: unknown) => /UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error));

async function existingAcceptance(
  db: D1Database,
  input: { proposalId: string; caseId: string; workspaceId: string; userId: string },
): Promise<ExistingAcceptance | null> {
  return db.prepare(`SELECT a.id,a.agreement_version AS agreementVersion
    FROM proposal_acceptances a
    JOIN legal_service_proposals p ON p.id=a.proposal_id
    WHERE p.id=? AND p.case_id=? AND p.workspace_id=? AND p.client_user_id=?
    LIMIT 1`)
    .bind(input.proposalId, input.caseId, input.workspaceId, input.userId)
    .first<ExistingAcceptance>();
}

export const POST = withApiErrors(async (request: Request, context: Ctx) => {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, body, 2048);
  const { caseId, proposalId } = await context.params;
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });

  const workspace = parsed.data.workspaceId
    ? await workspaceForUserById(user.id, parsed.data.workspaceId)
    : await workspaceForUser(user);
  if (!workspace) return Response.json({ code: "WORKSPACE_UNAVAILABLE" }, { status: 404 });

  const db = requireD1();
  const scope = { proposalId, caseId, workspaceId: workspace.id, userId: user.id };
  const existing = await existingAcceptance(db, scope);
  if (existing) {
    if (existing.agreementVersion === parsed.data.agreementVersion) {
      return Response.json({ ok: true, status: "ACCEPTED", replayed: true });
    }
    return Response.json({ code: "PROPOSAL_ALREADY_ACCEPTED" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const proposal = await db.prepare(`SELECT id,title_ru AS titleRu,title_uz AS titleUz,
    scope_ru AS scopeRu,scope_uz AS scopeUz,duration_description AS durationDescription,
    lawyer_base_amount_minor AS lawyerBaseAmountMinor
    FROM legal_service_proposals
    WHERE id=? AND case_id=? AND workspace_id=? AND client_user_id=? AND status='PROPOSED'
      AND (expires_at IS NULL OR expires_at>?) LIMIT 1`)
    .bind(proposalId, caseId, workspace.id, user.id, now)
    .first<Record<string, unknown>>();
  if (!proposal) return unavailable();

  const agreement = JSON.stringify({
    proposal,
    agreementVersion: parsed.data.agreementVersion,
    clientUserId: user.id,
    workspaceId: workspace.id,
  });
  const hash = await sha256(agreement);
  try {
    await db.batch([
      db.prepare(`INSERT INTO proposal_acceptances(
        id,proposal_id,client_user_id,workspace_id,agreement_version,agreement_sha256,
        consent_scope_json,accepted_at,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), proposalId, user.id, workspace.id, parsed.data.agreementVersion,
        hash, JSON.stringify({ caseId, proposalId, explicit: true }), now, now,
      ),
      db.prepare("UPDATE legal_service_proposals SET status='ACCEPTED',accepted_at=?,updated_at=? WHERE id=? AND status='PROPOSED'")
        .bind(now, now, proposalId),
      db.prepare(`INSERT INTO consents(id,user_id,workspace_id,type,version,scope_json,granted_at)
        VALUES (?,?,?,'legal_service_agreement',?,?,?)`).bind(
        crypto.randomUUID(), user.id, workspace.id, parsed.data.agreementVersion,
        JSON.stringify({ caseId, proposalId }), now,
      ),
      db.prepare(`INSERT INTO workspace_audit_events(
        id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at
      ) VALUES (?,?,?,'legal_service_proposal',?,'accepted',?,?)`).bind(
        crypto.randomUUID(), workspace.id, user.id, proposalId,
        JSON.stringify({ caseId, requestId: parsed.data.requestId }), now,
      ),
    ]);
  } catch (error) {
    if (!unique(error)) throw error;
    const replay = await existingAcceptance(db, scope);
    if (!replay) throw error;
    if (replay.agreementVersion === parsed.data.agreementVersion) {
      return Response.json({ ok: true, status: "ACCEPTED", replayed: true });
    }
    return Response.json({ code: "PROPOSAL_ALREADY_ACCEPTED" }, { status: 409 });
  }
  return Response.json({ ok: true, status: "ACCEPTED" });
});
