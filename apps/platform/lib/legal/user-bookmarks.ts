import { z } from "zod";

const sourceIdSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const caseIdSchema = z.string().uuid().nullable();
const commentSchema = z.string().max(2_000).nullable().transform((value) => {
  const normalized = value?.trim() ?? "";
  return normalized || null;
});

export const legalBookmarkCreateSchema = z.object({
  sourceId: sourceIdSchema,
  caseId: caseIdSchema,
  comment: commentSchema,
}).strict();

export const legalBookmarkUpdateSchema = z.object({
  caseId: caseIdSchema,
  comment: commentSchema,
  revision: z.number().int().min(1),
}).strict();

export const legalBookmarkArchiveSchema = z.object({
  revision: z.number().int().min(1),
}).strict();

export class LegalBookmarkError extends Error {
  constructor(
    public readonly code:
      | "INVALID_IDEMPOTENCY_KEY"
      | "SOURCE_UNAVAILABLE"
      | "CASE_UNAVAILABLE"
      | "BOOKMARK_UNAVAILABLE"
      | "BOOKMARK_CONFLICT"
      | "IDEMPOTENCY_CONFLICT",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "LegalBookmarkError";
  }
}

type VerifiedSource = {
  sourceId: string;
  versionId: string;
  actTitle: string;
  actIdentifier: string | null;
  officialUrl: string;
  locale: string;
  lastCheckedAt: string;
  effectiveAt: string | null;
};

type BookmarkProjection = {
  bookmarkId: string;
  sourceId: string;
  versionId: string;
  caseId: string | null;
  comment: string | null;
  revision: number;
  archivedAt: string | null;
};

type BookmarkEvent = {
  bookmarkId: string;
  sourceId: string;
  versionId: string;
  caseId: string | null;
  eventType: "created" | "updated" | "archived";
  revision: number;
  requestHash: string;
};

export type LegalBookmarkMutationResult = {
  bookmarkId: string;
  sourceId: string;
  versionId: string;
  caseId: string | null;
  revision: number;
  archived: boolean;
  replay: boolean;
  changed: boolean;
};

export type LegalBookmarkListItem = BookmarkProjection & VerifiedSource & {
  createdAt: string;
  updatedAt: string;
  isCurrentVersion: boolean;
};

export async function listLegalBookmarks(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  caseId?: string;
}): Promise<LegalBookmarkListItem[]> {
  const caseClause = input.caseId ? " AND bookmark.case_id=?" : "";
  const bindings = input.caseId
    ? [input.workspaceId, input.userId, input.caseId]
    : [input.workspaceId, input.userId];
  const rows = await input.db.prepare(
    `SELECT bookmark.id AS bookmarkId,bookmark.source_id AS sourceId,
      bookmark.version_id AS versionId,bookmark.case_id AS caseId,
      bookmark.comment,bookmark.revision,bookmark.archived_at AS archivedAt,
      bookmark.created_at AS createdAt,bookmark.updated_at AS updatedAt,
      source.act_title AS actTitle,source.act_identifier AS actIdentifier,
      source.official_url AS officialUrl,source.locale,
      source.last_checked_at AS lastCheckedAt,version.effective_at AS effectiveAt,
      CASE WHEN activation.version_id=bookmark.version_id THEN 1 ELSE 0 END AS isCurrentVersion
     FROM user_legal_bookmarks bookmark
     INNER JOIN legal_sources source ON source.id=bookmark.source_id
     INNER JOIN legal_source_versions version
       ON version.id=bookmark.version_id AND version.source_id=source.id
     LEFT JOIN legal_source_current_activations activation ON activation.source_id=source.id
     WHERE bookmark.workspace_id=? AND bookmark.user_id=?
       AND bookmark.archived_at IS NULL${caseClause}
     ORDER BY bookmark.updated_at DESC,bookmark.id DESC LIMIT 200`,
  ).bind(...bindings).all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    bookmarkId: String(row.bookmarkId),
    sourceId: String(row.sourceId),
    versionId: String(row.versionId),
    caseId: row.caseId ? String(row.caseId) : null,
    comment: row.comment ? String(row.comment) : null,
    revision: Number(row.revision),
    archivedAt: null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    actTitle: String(row.actTitle),
    actIdentifier: row.actIdentifier ? String(row.actIdentifier) : null,
    officialUrl: String(row.officialUrl),
    locale: String(row.locale),
    lastCheckedAt: String(row.lastCheckedAt),
    effectiveAt: row.effectiveAt ? String(row.effectiveAt) : null,
    isCurrentVersion: Number(row.isCurrentVersion) === 1,
  }));
}

export async function createLegalBookmark(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  sourceId: string;
  caseId: string | null;
  comment: string | null;
  idempotencyKey: string;
}): Promise<LegalBookmarkMutationResult> {
  const key = parseIdempotencyKey(input.idempotencyKey);
  const requestHash = await mutationHash("create", input.sourceId, input.caseId, input.comment, 0);
  const replay = await replayFor(input.db, input.workspaceId, input.userId, key, requestHash);
  if (replay) return replay;
  const source = await currentVerifiedSource(input.db, input.sourceId);
  if (!source) throw new LegalBookmarkError("SOURCE_UNAVAILABLE", "Подтверждённый источник недоступен.", 404);
  await requireCase(input.db, input.workspaceId, input.caseId);

  const duplicate = await findActiveDuplicate(
    input.db, input.workspaceId, input.userId, source.sourceId, source.versionId, input.caseId,
  );
  if (duplicate) return resultFromProjection(duplicate, true, false);

  const bookmarkId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  const commentSha256 = await nullableTextHash(input.comment);
  try {
    await input.db.batch([
      input.db.prepare(
        `INSERT INTO user_legal_bookmarks
         (id,workspace_id,user_id,source_id,version_id,case_id,comment,revision,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,1,?,?)`,
      ).bind(bookmarkId, input.workspaceId, input.userId, source.sourceId, source.versionId, input.caseId, input.comment, now, now),
      eventStatement(input.db, {
        eventId, bookmarkId, workspaceId: input.workspaceId, userId: input.userId,
        sourceId: source.sourceId, versionId: source.versionId, caseId: input.caseId,
        eventType: "created", revision: 1, key, requestHash, commentSha256, now,
      }),
      ...caseEventStatements(input.db, {
        eventId, oldCaseId: null, newCaseId: input.caseId, userId: input.userId,
        bookmarkId, sourceId: source.sourceId, revision: 1, now,
      }),
    ]);
  } catch (error) {
    const concurrentReplay = await replayFor(input.db, input.workspaceId, input.userId, key, requestHash);
    if (concurrentReplay) return concurrentReplay;
    const concurrentDuplicate = await findActiveDuplicate(
      input.db, input.workspaceId, input.userId, source.sourceId, source.versionId, input.caseId,
    );
    if (concurrentDuplicate) return resultFromProjection(concurrentDuplicate, true, false);
    throw error;
  }
  return { bookmarkId, sourceId: source.sourceId, versionId: source.versionId, caseId: input.caseId, revision: 1, archived: false, replay: false, changed: true };
}

export async function updateLegalBookmark(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  bookmarkId: string;
  caseId: string | null;
  comment: string | null;
  revision: number;
  idempotencyKey: string;
}): Promise<LegalBookmarkMutationResult> {
  const key = parseIdempotencyKey(input.idempotencyKey);
  const requestHash = await mutationHash("update", input.bookmarkId, input.caseId, input.comment, input.revision);
  const replay = await replayFor(input.db, input.workspaceId, input.userId, key, requestHash);
  if (replay) return replay;
  const current = await ownedProjection(input.db, input.bookmarkId, input.workspaceId, input.userId);
  if (!current || current.archivedAt) throw new LegalBookmarkError("BOOKMARK_UNAVAILABLE", "Закладка недоступна.", 404);
  if (current.revision !== input.revision) throw conflict();
  await requireCase(input.db, input.workspaceId, input.caseId);
  if (current.caseId === input.caseId && current.comment === input.comment) {
    return resultFromProjection(current, true, false);
  }

  const revision = current.revision + 1;
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  const commentSha256 = await nullableTextHash(input.comment);
  try {
    await input.db.batch([
      input.db.prepare(
        `UPDATE user_legal_bookmarks SET case_id=?,comment=?,revision=?,updated_at=?
         WHERE id=? AND workspace_id=? AND user_id=? AND revision=? AND archived_at IS NULL`,
      ).bind(input.caseId, input.comment, revision, now, input.bookmarkId, input.workspaceId, input.userId, current.revision),
      eventStatement(input.db, {
        eventId, bookmarkId: input.bookmarkId, workspaceId: input.workspaceId, userId: input.userId,
        sourceId: current.sourceId, versionId: current.versionId, caseId: input.caseId,
        eventType: "updated", revision, key, requestHash, commentSha256, now,
      }),
      ...caseEventStatements(input.db, {
        eventId, oldCaseId: current.caseId, newCaseId: input.caseId, userId: input.userId,
        bookmarkId: input.bookmarkId, sourceId: current.sourceId, revision, now,
      }),
    ]);
  } catch {
    const concurrentReplay = await replayFor(input.db, input.workspaceId, input.userId, key, requestHash);
    if (concurrentReplay) return concurrentReplay;
    throw conflict();
  }
  const updated = await ownedProjection(input.db, input.bookmarkId, input.workspaceId, input.userId);
  if (!updated || updated.revision !== revision) throw conflict();
  return resultFromProjection(updated, false, true);
}

export async function archiveLegalBookmark(input: {
  db: D1Database;
  workspaceId: string;
  userId: string;
  bookmarkId: string;
  revision: number;
  idempotencyKey: string;
}): Promise<LegalBookmarkMutationResult> {
  const key = parseIdempotencyKey(input.idempotencyKey);
  const requestHash = await mutationHash("archive", input.bookmarkId, null, null, input.revision);
  const replay = await replayFor(input.db, input.workspaceId, input.userId, key, requestHash);
  if (replay) return replay;
  const current = await ownedProjection(input.db, input.bookmarkId, input.workspaceId, input.userId);
  if (!current || current.archivedAt) throw new LegalBookmarkError("BOOKMARK_UNAVAILABLE", "Закладка недоступна.", 404);
  if (current.revision !== input.revision) throw conflict();
  const revision = current.revision + 1;
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await input.db.batch([
      input.db.prepare(
        `UPDATE user_legal_bookmarks SET revision=?,archived_at=?,updated_at=?
         WHERE id=? AND workspace_id=? AND user_id=? AND revision=? AND archived_at IS NULL`,
      ).bind(revision, now, now, input.bookmarkId, input.workspaceId, input.userId, current.revision),
      eventStatement(input.db, {
        eventId, bookmarkId: input.bookmarkId, workspaceId: input.workspaceId, userId: input.userId,
        sourceId: current.sourceId, versionId: current.versionId, caseId: current.caseId,
        eventType: "archived", revision, key, requestHash, commentSha256: await nullableTextHash(current.comment), now,
      }),
      ...caseEventStatements(input.db, {
        eventId, oldCaseId: current.caseId, newCaseId: null, userId: input.userId,
        bookmarkId: input.bookmarkId, sourceId: current.sourceId, revision, now,
      }),
    ]);
  } catch {
    const concurrentReplay = await replayFor(input.db, input.workspaceId, input.userId, key, requestHash);
    if (concurrentReplay) return concurrentReplay;
    throw conflict();
  }
  return { bookmarkId: input.bookmarkId, sourceId: current.sourceId, versionId: current.versionId, caseId: current.caseId, revision, archived: true, replay: false, changed: true };
}

export function parseIdempotencyKey(value: string | null): string {
  const key = value?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{16,180}$/.test(key)) {
    throw new LegalBookmarkError("INVALID_IDEMPOTENCY_KEY", "Для сохранения требуется корректный Idempotency-Key.", 400);
  }
  return key;
}

async function currentVerifiedSource(db: D1Database, sourceId: string): Promise<VerifiedSource | null> {
  return db.prepare(
    `SELECT source.id AS sourceId,activation.version_id AS versionId,
      source.act_title AS actTitle,source.act_identifier AS actIdentifier,
      source.official_url AS officialUrl,source.locale,
      source.last_checked_at AS lastCheckedAt,version.effective_at AS effectiveAt
     FROM legal_sources source
     INNER JOIN legal_source_current_activations activation ON activation.source_id=source.id
     INNER JOIN legal_source_versions version
       ON version.id=activation.version_id AND version.source_id=source.id
     INNER JOIN legal_source_publications publication
       ON publication.id=activation.publication_id
      AND publication.source_id=source.id AND publication.version_id=version.id
     WHERE source.id=? AND source.status='verified'
       AND source.verification_state='verified' AND version.status='verified' LIMIT 1`,
  ).bind(sourceId).first<VerifiedSource>();
}

async function requireCase(db: D1Database, workspaceId: string, caseId: string | null): Promise<void> {
  if (!caseId) return;
  const row = await db.prepare(
    "SELECT id FROM cases WHERE id=? AND workspace_id=? AND archived_at IS NULL LIMIT 1",
  ).bind(caseId, workspaceId).first<{ id: string }>();
  if (!row) throw new LegalBookmarkError("CASE_UNAVAILABLE", "Дело недоступно.", 404);
}

async function ownedProjection(db: D1Database, bookmarkId: string, workspaceId: string, userId: string): Promise<BookmarkProjection | null> {
  return db.prepare(
    `SELECT id AS bookmarkId,source_id AS sourceId,version_id AS versionId,
      case_id AS caseId,comment,revision,archived_at AS archivedAt
     FROM user_legal_bookmarks WHERE id=? AND workspace_id=? AND user_id=? LIMIT 1`,
  ).bind(bookmarkId, workspaceId, userId).first<BookmarkProjection>();
}

async function findActiveDuplicate(
  db: D1Database, workspaceId: string, userId: string, sourceId: string, versionId: string, caseId: string | null,
): Promise<BookmarkProjection | null> {
  return db.prepare(
    `SELECT id AS bookmarkId,source_id AS sourceId,version_id AS versionId,
      case_id AS caseId,comment,revision,archived_at AS archivedAt
     FROM user_legal_bookmarks
     WHERE workspace_id=? AND user_id=? AND source_id=? AND version_id=?
       AND case_id IS ? AND archived_at IS NULL LIMIT 1`,
  ).bind(workspaceId, userId, sourceId, versionId, caseId).first<BookmarkProjection>();
}

async function replayFor(
  db: D1Database, workspaceId: string, userId: string, key: string, requestHash: string,
): Promise<LegalBookmarkMutationResult | null> {
  const event = await db.prepare(
    `SELECT bookmark_id AS bookmarkId,source_id AS sourceId,version_id AS versionId,
      case_id AS caseId,event_type AS eventType,revision,request_hash AS requestHash
     FROM user_legal_bookmark_events
     WHERE workspace_id=? AND user_id=? AND idempotency_key=? LIMIT 1`,
  ).bind(workspaceId, userId, key).first<BookmarkEvent>();
  if (!event) return null;
  if (event.requestHash !== requestHash) {
    throw new LegalBookmarkError("IDEMPOTENCY_CONFLICT", "Этот Idempotency-Key уже использован для другого изменения.", 409);
  }
  return {
    bookmarkId: event.bookmarkId,
    sourceId: event.sourceId,
    versionId: event.versionId,
    caseId: event.caseId,
    revision: event.revision,
    archived: event.eventType === "archived",
    replay: true,
    changed: true,
  };
}

function eventStatement(db: D1Database, input: {
  eventId: string; bookmarkId: string; workspaceId: string; userId: string;
  sourceId: string; versionId: string; caseId: string | null;
  eventType: "created" | "updated" | "archived"; revision: number;
  key: string; requestHash: string; commentSha256: string | null; now: string;
}): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO user_legal_bookmark_events
     (id,bookmark_id,workspace_id,user_id,actor_user_id,source_id,version_id,case_id,event_type,revision,idempotency_key,request_hash,comment_sha256,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    input.eventId, input.bookmarkId, input.workspaceId, input.userId, input.userId,
    input.sourceId, input.versionId, input.caseId, input.eventType, input.revision,
    input.key, input.requestHash, input.commentSha256, input.now,
  );
}

function caseEventStatements(db: D1Database, input: {
  eventId: string; oldCaseId: string | null; newCaseId: string | null; userId: string;
  bookmarkId: string; sourceId: string; revision: number; now: string;
}): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  if (input.oldCaseId && input.oldCaseId !== input.newCaseId) {
    statements.push(db.prepare(
      "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'legal_bookmark_removed',?,?)",
    ).bind(`${input.eventId}:removed`, input.oldCaseId, input.userId, JSON.stringify({ bookmarkId: input.bookmarkId, sourceId: input.sourceId, revision: input.revision }), input.now));
  }
  if (input.newCaseId && input.newCaseId !== input.oldCaseId) {
    statements.push(db.prepare(
      "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'legal_bookmark_saved',?,?)",
    ).bind(`${input.eventId}:saved`, input.newCaseId, input.userId, JSON.stringify({ bookmarkId: input.bookmarkId, sourceId: input.sourceId, revision: input.revision }), input.now));
  }
  return statements;
}

async function mutationHash(operation: string, targetId: string, caseId: string | null, comment: string | null, revision: number): Promise<string> {
  return sha256(JSON.stringify({ operation, targetId, caseId, comment, revision }));
}

async function nullableTextHash(value: string | null): Promise<string | null> {
  return value === null ? null : sha256(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function resultFromProjection(projection: BookmarkProjection, replay: boolean, changed: boolean): LegalBookmarkMutationResult {
  return {
    bookmarkId: projection.bookmarkId,
    sourceId: projection.sourceId,
    versionId: projection.versionId,
    caseId: projection.caseId,
    revision: projection.revision,
    archived: Boolean(projection.archivedAt),
    replay,
    changed,
  };
}

function conflict(): LegalBookmarkError {
  return new LegalBookmarkError(
    "BOOKMARK_CONFLICT",
    "Закладка уже изменилась. Обновите данные и повторите действие.",
    409,
  );
}
