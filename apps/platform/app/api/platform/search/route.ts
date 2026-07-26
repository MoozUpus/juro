import { requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function likeValue(value: string) {
  return `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") === "uz" ? "uz" : "ru";
  const query = (url.searchParams.get("q") || "").normalize("NFKC").trim().slice(0, 120);
  if (query.length < 2) return response({ query, results: [] });
  const like = likeValue(query);
  const db = requireD1();
  const [cases, documents, conversations, comparisons, templates, sources] = await db.batch([
    db.prepare(
      `SELECT id,title,description AS subtitle,updated_at AS updatedAt
       FROM cases WHERE workspace_id=? AND archived_at IS NULL
         AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC LIMIT 6`,
    ).bind(workspace.id, like, like),
    db.prepare(
      `SELECT id,title,category AS subtitle,updated_at AS updatedAt
       FROM documents WHERE workspace_id=? AND archived_at IS NULL
         AND title LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 6`,
    ).bind(workspace.id, like),
    db.prepare(
      `SELECT id,title,'AI' AS subtitle,updated_at AS updatedAt
       FROM conversations WHERE workspace_id=? AND owner_user_id=? AND status='active'
         AND title LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 6`,
    ).bind(workspace.id, user.id, like),
    db.prepare(
      `SELECT c.id,(one.file_name || ' ↔ ' || two.file_name) AS title,
        c.status AS subtitle,c.updated_at AS updatedAt
       FROM document_comparisons c
       JOIN document_files one ON one.id=c.version_one_file_id
       JOIN document_files two ON two.id=c.version_two_file_id
       WHERE c.workspace_id=? AND c.owner_user_id=? AND c.deleted_at IS NULL
         AND (one.file_name LIKE ? ESCAPE '\\' OR two.file_name LIKE ? ESCAPE '\\')
       ORDER BY c.updated_at DESC LIMIT 6`,
    ).bind(workspace.id, user.id, like, like),
    db.prepare(
      `SELECT t.key AS id,l.name AS title,t.category AS subtitle,t.updated_at AS updatedAt
       FROM document_templates t JOIN document_template_locales l ON l.template_id=t.id
       WHERE t.active=1 AND l.language=? AND l.name LIKE ? ESCAPE '\\'
       ORDER BY l.name LIMIT 6`,
    ).bind(locale, like),
    db.prepare(
      `SELECT id,act_title AS title,coalesce(act_identifier,'') AS subtitle,
        last_checked_at AS updatedAt,official_url AS officialUrl
       FROM legal_sources WHERE status='verified' AND locale=?
         AND (act_title LIKE ? ESCAPE '\\' OR act_identifier LIKE ? ESCAPE '\\')
       ORDER BY last_checked_at DESC LIMIT 6`,
    ).bind(locale, like, like),
  ]);
  const withType = (type: string, rows: unknown[]) => rows.map((item) => ({ ...(item as object), type }));
  return response({
    query,
    results: [
      ...withType("case", cases.results),
      ...withType("document", documents.results),
      ...withType("conversation", conversations.results),
      ...withType("comparison", comparisons.results),
      ...withType("template", templates.results),
      ...withType("source", sources.results),
    ],
  });
});
