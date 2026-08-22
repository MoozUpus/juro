import { z } from "zod";
import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";

const optionalTerm = z.string().trim().min(2).max(160).optional();
const input = z.object({
  client: optionalTerm,
  opposingParty: optionalTerm,
  company: optionalTerm,
  keyPersons: z.array(z.string().trim().min(2).max(160)).max(10).default([]),
}).strict().refine((value) => Boolean(value.client || value.opposingParty || value.company || value.keyPersons.length), {
  message: "SEARCH_TERM_REQUIRED",
});

type AccessibleMatter = {
  caseId: string;
  caseTitle: string;
  caseDescription: string | null;
  legalArea: string;
  clientName: string | null;
};

type KnowledgeRecord = {
  id: string;
  caseId: string | null;
  caseTitle: string | null;
  clientName: string | null;
  title: string;
  content: string;
  folder: string;
  tagsJson: string;
};

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

function normalize(value: string | null | undefined) {
  return value?.normalize("NFKC").toLocaleLowerCase("ru").replace(/\s+/g, " ").trim() ?? "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, input, 4_096);
  if (!parsed.ok) return response({ code: "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  const db = requireD1();
  const now = new Date().toISOString();
  const profile = await db.prepare(
    `SELECT id FROM lawyer_profiles WHERE user_id=? AND status='public_approved'
      AND marketplace_status='public_approved' LIMIT 1`,
  ).bind(user.id).first();
  if (!profile) return response({ code: "OPERATIONAL_LAWYER_REQUIRED" }, 403);

  const matters = await db.prepare(
    `SELECT DISTINCT c.id AS caseId,c.title AS caseTitle,c.description AS caseDescription,
      c.legal_area AS legalArea,client.full_name AS clientName
     FROM lawyer_access_grants g
     JOIN lawyer_requests r ON r.id=g.lawyer_request_id
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=?
     JOIN cases c ON c.id=g.case_id
     JOIN user_profiles client ON client.id=r.requester_user_id
     WHERE g.lawyer_user_id=? AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at>?)
     ORDER BY c.updated_at DESC LIMIT 200`,
  ).bind(user.id, user.id, now).all<AccessibleMatter>();
  const knowledge = await db.prepare(
    `SELECT k.id,k.case_id AS caseId,c.title AS caseTitle,client.full_name AS clientName,
      k.title,k.content,k.folder,k.tags_json AS tagsJson
     FROM lawyer_knowledge_items k
     LEFT JOIN cases c ON c.id=k.case_id
     LEFT JOIN user_profiles client ON client.id=k.client_user_id
     WHERE k.lawyer_user_id=? AND k.archived_at IS NULL
     ORDER BY k.updated_at DESC LIMIT 200`,
  ).bind(user.id).all<KnowledgeRecord>();

  const terms = [
    ...(parsed.data.client ? [{ kind: "client", value: normalize(parsed.data.client) }] : []),
    ...(parsed.data.opposingParty ? [{ kind: "opposing_party", value: normalize(parsed.data.opposingParty) }] : []),
    ...(parsed.data.company ? [{ kind: "company", value: normalize(parsed.data.company) }] : []),
    ...parsed.data.keyPersons.map((value) => ({ kind: "key_person", value: normalize(value) })),
  ];
  const matterMatches = matters.results.flatMap((matter) => {
    const sources = [
      { source: "client_name", value: normalize(matter.clientName) },
      { source: "case_title", value: normalize(matter.caseTitle) },
      { source: "case_description", value: normalize(matter.caseDescription) },
      { source: "legal_area", value: normalize(matter.legalArea) },
    ];
    const matched = terms.flatMap((term) => sources
      .filter((source) => source.value.includes(term.value))
      .map((source) => ({ matchedTermType: term.kind, source: source.source })));
    return matched.length ? [{
      id: `case:${matter.caseId}`,
      recordType: "case",
      caseId: matter.caseId,
      caseTitle: matter.caseTitle,
      clientName: matter.clientName,
      matches: matched,
    }] : [];
  });
  const knowledgeMatches = knowledge.results.flatMap((item) => {
    const sources = [
      { source: "knowledge_title", value: normalize(item.title) },
      { source: "knowledge_content", value: normalize(item.content) },
      { source: "knowledge_folder", value: normalize(item.folder) },
      { source: "knowledge_tags", value: normalize(item.tagsJson) },
    ];
    const matched = terms.flatMap((term) => sources
      .filter((source) => source.value.includes(term.value))
      .map((source) => ({ matchedTermType: term.kind, source: source.source })));
    return matched.length ? [{
      id: `knowledge:${item.id}`,
      recordType: "internal_record",
      caseId: item.caseId,
      caseTitle: item.caseTitle || item.title,
      clientName: item.clientName,
      matches: matched,
    }] : [];
  });
  const matches = [...matterMatches, ...knowledgeMatches].slice(0, 200);

  const normalizedQuery = JSON.stringify(terms);
  const querySha256 = await sha256(normalizedQuery);
  const workspace = await workspaceForUser(user);
  const eventId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(
      `INSERT INTO lawyer_conflict_search_events
        (id,lawyer_user_id,query_sha256,result_count,created_at) VALUES (?,?,?,?,?)`,
    ).bind(eventId, user.id, querySha256, matches.length, now),
    db.prepare(
      `INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'lawyer_conflict_search',?,'lawyer_conflict_search_completed',?,?)`,
    ).bind(crypto.randomUUID(), workspace.id, user.id, eventId, JSON.stringify({ resultCount: matches.length, querySha256 }), now),
  ]);
  if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) return response({ code: "CONFLICT_SEARCH_FAILED" }, 409);
  return response({
    potentialMatches: matches,
    searchedMatterCount: matters.results.length,
    searchedInternalRecordCount: knowledge.results.length,
    manualReviewRequired: true,
    disclaimer: "Совпадения являются подсказкой для ручной проверки и не гарантируют отсутствие конфликта интересов.",
  });
});
