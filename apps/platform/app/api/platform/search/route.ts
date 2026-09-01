import { requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { documentVisibilityScope } from "../../../../lib/document-builder/permissions/document-visibility";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { filterVerifiedLexSources } from "../../../../lib/legal/source-trust";
import { workspaceForUser } from "../../../../lib/platform/workspace";
import { searchUserDocuments } from "../../../../lib/document-analysis/user-document-vectors";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function likeValue(value: string) {
  return `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

async function hasTable(db: D1Database, table: string) {
  return Boolean(await db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  ).bind(table).first());
}

function emptySearchRows(db: D1Database, columns: string) {
  return db.prepare(`SELECT ${columns} WHERE 0`);
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
  const documentVisibility = documentVisibilityScope(user.id, workspace.id);
  const [tasksAvailable, lawyersAvailable] = await Promise.all([
    hasTable(db, "tasks"),
    hasTable(db, "lawyer_profiles"),
  ]);
  const [cases, documents, conversations, comparisons, tasks, analyses, templates, lawyers, sources] = await db.batch([
    db.prepare(
      `SELECT id,title,description AS subtitle,updated_at AS updatedAt
       FROM cases WHERE workspace_id=? AND archived_at IS NULL
         AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC LIMIT 6`,
    ).bind(workspace.id, like, like),
    db.prepare(
      `SELECT d.id,d.title,d.category AS subtitle,d.updated_at AS updatedAt
       FROM documents d WHERE ${documentVisibility.sql} AND d.archived_at IS NULL
         AND d.title LIKE ? ESCAPE '\\' ORDER BY d.updated_at DESC LIMIT 6`,
    ).bind(...documentVisibility.bindings, like),
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
    tasksAvailable ? db.prepare(
      `SELECT t.id,t.case_id AS caseId,t.title,coalesce(t.description,'') AS subtitle,
        t.updated_at AS updatedAt
       FROM tasks t WHERE t.workspace_id=? AND t.owner_user_id=? AND t.status!='cancelled'
         AND (t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')
       ORDER BY t.updated_at DESC LIMIT 6`,
    ).bind(workspace.id, user.id, like, like) : emptySearchRows(
      db, "'' AS id,NULL AS caseId,'' AS title,'' AS subtitle,'' AS updatedAt",
    ),
    db.prepare(
      `SELECT a.id,f.file_name AS title,a.status AS subtitle,a.updated_at AS updatedAt
       FROM document_analyses a JOIN document_files f ON f.id=a.uploaded_file_id
       WHERE a.workspace_id=? AND a.owner_user_id=? AND f.file_name LIKE ? ESCAPE '\\'
       ORDER BY a.updated_at DESC LIMIT 6`,
    ).bind(workspace.id, user.id, like),
    db.prepare(
      `SELECT t.key AS id,l.name AS title,t.category AS subtitle,t.updated_at AS updatedAt
       FROM document_templates t JOIN document_template_locales l ON l.template_id=t.id
       WHERE t.active=1 AND l.language=? AND l.name LIKE ? ESCAPE '\\'
       ORDER BY l.name LIMIT 6`,
    ).bind(locale, like),
    lawyersAvailable ? db.prepare(
      `SELECT id,display_name AS title,'' AS subtitle,
        coalesce(public_approved_at,created_at) AS updatedAt
       FROM lawyer_profiles
       WHERE status='public_approved' AND marketplace_status='public_approved' AND public_approved_at IS NOT NULL
         AND display_name LIKE ? ESCAPE '\\'
       ORDER BY display_name COLLATE NOCASE LIMIT 6`,
    ).bind(like) : emptySearchRows(
      db, "'' AS id,'' AS title,'' AS subtitle,'' AS updatedAt",
    ),
    db.prepare(
      `SELECT id,act_title AS title,coalesce(act_identifier,'') AS subtitle,
        last_checked_at AS updatedAt,official_url AS officialUrl,
        source_type AS sourceType,status,verification_state AS verificationState,
        verified_at AS verifiedAt,content_sha256 AS contentSha256
       FROM legal_sources WHERE status='verified' AND verification_state='verified'
         AND verified_at IS NOT NULL AND content_sha256 IS NOT NULL AND locale=?
         AND (act_title LIKE ? ESCAPE '\\' OR act_identifier LIKE ? ESCAPE '\\')
       ORDER BY last_checked_at DESC LIMIT 6`,
    ).bind(locale, like, like),
  ]);
  const bindings = runtimeEnv();
  const documentContent = bindings.USER_DOCUMENTS_INDEX
    && bindings.BUCKET
    && bindings.OPENAI_API_KEY
    && bindings.APP_ENV
    && bindings.LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST === "true"
    ? await searchUserDocuments({
        APP_ENV: bindings.APP_ENV,
        DB: db,
        BUCKET: bindings.BUCKET,
        USER_DOCUMENTS_INDEX: bindings.USER_DOCUMENTS_INDEX,
        OPENAI_API_KEY: bindings.OPENAI_API_KEY,
        EMBEDDING_MODEL: bindings.EMBEDDING_MODEL,
      }, {
        workspaceId: workspace.id,
        userId: user.id,
        query,
        limit: 6,
      }).catch(() => [])
    : [];
  const withType = (type: string, rows: unknown[]) => rows.map((item) => ({ ...(item as object), type }));
  return response({
    query,
    results: [
      ...withType("case", cases.results),
      ...withType("document", documents.results),
      ...withType("conversation", conversations.results),
      ...withType("comparison", comparisons.results),
      ...withType("task", tasks.results),
      ...withType("analysis", analyses.results),
      ...documentContent,
      ...withType("template", templates.results),
      ...withType("lawyer", lawyers.results),
      ...withType(
        "source",
        filterVerifiedLexSources(
          sources.results.map((item) => ({
            ...(item as Record<string, unknown>),
            officialUrl: String(
              (item as Record<string, unknown>).officialUrl || "",
            ),
            status: String((item as Record<string, unknown>).status || ""),
            sourceType: String((item as Record<string, unknown>).sourceType || ""),
            verificationState: String((item as Record<string, unknown>).verificationState || ""),
            verifiedAt: String((item as Record<string, unknown>).verifiedAt || ""),
            contentSha256: String((item as Record<string, unknown>).contentSha256 || ""),
          })),
        ),
      ),
    ],
  });
});
