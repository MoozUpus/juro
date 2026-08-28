import {
  discoverLexRssDocuments,
  LegalSourceDiscoveryError,
} from "./source-discovery";

export const LEX_METADATA_DISCOVERY_CRON = "0 19 * * *";
export const LEX_METADATA_STALE_RUN_MS = 20 * 60 * 1_000;

type LexMetadataEnv = {
  APP_ENV: string;
  DB: D1Database;
  LEGAL_LEX_METADATA_MONITOR_ENABLED?: string;
  LEGAL_LEX_RSS_DISCOVERY_ENABLED?: string;
};

export type LexMetadataMonitorSummary = {
  status: "success" | "partial" | "failed" | "busy" | "disabled";
  runId: string | null;
  discovered: number;
  processed: number;
  changed: number;
  errors: number;
};

function runId(now: Date, runType: "metadata_monitor" | "metadata_retry" | "manual_metadata_monitor"): string {
  return `lexmeta_${runType}_${now.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`;
}

function safeTitle(value: string | null, canonicalId: string): string {
  const title = value?.replace(/\s+/gu, " ").trim();
  return title ? title.slice(0, 500) : `Lex.uz · №${canonicalId}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeErrorCode(error: unknown): string {
  if (error instanceof LegalSourceDiscoveryError) return error.code;
  return "LEX_METADATA_MONITOR_UNAVAILABLE";
}

type MonitoringNotificationEvent = {
  eventId: string;
  title: string;
  canonicalUrl: string;
};

type MetadataWrite = {
  id: string;
  canonicalUrl: string;
  canonicalId: string;
  locale: string;
  title: string;
  revisionDate: string | null;
  fingerprint: string;
};

type ChangeEventWrite = MonitoringNotificationEvent & {
  metadataId: string;
  changeType: "new_act" | "metadata_changed";
  fingerprint: string;
};

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function localizedNotification(locale: string, events: MonitoringNotificationEvent[]) {
  const first = events[0];
  if (!first) throw new TypeError("Monitoring notification requires at least one event.");
  if (events.length === 1) {
    if (locale === "uz") {
      return {
        title: "Lex.uz’da qonunchilik yangilanishi",
        body: `${first.title} · ${first.canonicalUrl}`.slice(0, 2_000),
      };
    }
    return {
      title: "Обновление законодательства в Lex.uz",
      body: `${first.title} · ${first.canonicalUrl}`.slice(0, 2_000),
    };
  }
  if (locale === "uz") {
    return {
      title: `Lex.uz’da ${events.length} ta qonunchilik yangilanishi`,
      body: `${first.title} · ${first.canonicalUrl} · yana ${events.length - 1} ta`.slice(0, 2_000),
    };
  }
  return {
    title: `${events.length} обновлений законодательства в Lex.uz`,
    body: `${first.title} · ${first.canonicalUrl} · ещё ${events.length - 1}`.slice(0, 2_000),
  };
}

async function monitoringNotificationStatements(input: {
  db: D1Database;
  events: MonitoringNotificationEvent[];
  now: string;
}): Promise<D1PreparedStatement[]> {
  if (input.events.length === 0) return [];
  const recipients = await input.db.prepare(
    `SELECT workspace_id AS workspaceId,user_id AS userId,locale
       FROM monitoring_preferences
      WHERE instr(channels_json,'"in_app"')>0`,
  ).all<{ workspaceId: string; userId: string; locale: string }>();
  const statements: D1PreparedStatement[] = [];
  const eventDigest = input.events.map((event) => event.eventId).sort().join(":");
  for (const recipient of recipients.results) {
    const message = localizedNotification(recipient.locale, input.events);
    const id = `lex_monitor_${await sha256(`${eventDigest}:${recipient.userId}`)}`.slice(0, 96);
    statements.push(input.db.prepare(
      `INSERT OR IGNORE INTO notifications
       (id,workspace_id,user_id,document_id,type,title,body,read_at,created_at)
       VALUES (?,?,?,NULL,'legislation_monitor',?,?,NULL,?)`,
    ).bind(id, recipient.workspaceId, recipient.userId, message.title, message.body, input.now));
  }
  return statements;
}

function metadataWriteStatements(db: D1Database, rows: MetadataWrite[], timestamp: string): D1PreparedStatement[] {
  return chunks(rows, 8).map((group) => db.prepare(
    `INSERT INTO legal_monitoring_metadata
      (id,canonical_url,canonical_id,locale,act_title,revision_date,effective_at,fingerprint,http_status,first_seen_at,last_seen_at,last_checked_at,last_error_code,created_at,updated_at)
     VALUES ${group.map(() => "(?,?,?,?,?,?,NULL,?,200,?,?,?,NULL,?,?)").join(",")}
     ON CONFLICT(canonical_url) DO UPDATE SET
       canonical_id=excluded.canonical_id,locale=excluded.locale,act_title=excluded.act_title,
       revision_date=excluded.revision_date,fingerprint=excluded.fingerprint,http_status=200,
       last_seen_at=excluded.last_seen_at,last_checked_at=excluded.last_checked_at,last_error_code=NULL,updated_at=excluded.updated_at`,
  ).bind(...group.flatMap((row) => [
    row.id,
    row.canonicalUrl,
    row.canonicalId,
    row.locale,
    row.title,
    row.revisionDate,
    row.fingerprint,
    timestamp,
    timestamp,
    timestamp,
    timestamp,
    timestamp,
  ])));
}

function changeEventWriteStatements(db: D1Database, rows: ChangeEventWrite[], timestamp: string): D1PreparedStatement[] {
  return chunks(rows, 12).map((group) => db.prepare(
    `INSERT OR IGNORE INTO legal_monitoring_change_events
      (id,metadata_id,canonical_url,act_title,change_type,fingerprint,detected_at,created_at)
     VALUES ${group.map(() => "(?,?,?,?,?,?,?,?)").join(",")}`,
  ).bind(...group.flatMap((row) => [
    row.eventId,
    row.metadataId,
    row.canonicalUrl,
    row.title,
    row.changeType,
    row.fingerprint,
    timestamp,
    timestamp,
  ])));
}

/**
 * Discovers the official Lex RSS feeds and stores only operational metadata.
 * It deliberately does not fetch document bodies, create legal_sources rows,
 * write R2 objects, enqueue parsing/indexing, or interact with review and
 * publication workflows.
 */
export async function runLexMetadataMonitor(
  env: LexMetadataEnv,
  options: {
    now?: Date;
    wait?: (delayMs: number) => Promise<void>;
    runType?: "metadata_monitor" | "metadata_retry" | "manual_metadata_monitor";
    fetchImpl?: typeof fetch;
    maxDocuments?: number;
  } = {},
): Promise<LexMetadataMonitorSummary> {
  if (env.LEGAL_LEX_METADATA_MONITOR_ENABLED !== "true" || env.LEGAL_LEX_RSS_DISCOVERY_ENABLED !== "true") {
    return { status: "disabled", runId: null, discovered: 0, processed: 0, changed: 0, errors: 0 };
  }
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  const type = options.runType ?? "metadata_monitor";
  const id = runId(now, type);
  const created = await env.DB.prepare(
    `INSERT INTO source_sync_runs
      (id,environment,source_kind,run_type,status,lock_key,discovered_count,fetched_count,changed_count,verified_count,error_count,started_at,finished_at,error_summary,created_at,updated_at)
     VALUES (?,?, 'lex',?,'running',?,0,0,0,0,0,?,NULL,NULL,?,?)
     ON CONFLICT DO NOTHING`,
  ).bind(id, env.APP_ENV, type, `${env.APP_ENV}:lex:metadata_monitor`, timestamp, timestamp, timestamp).run();
  if (Number(created.meta.changes ?? 0) !== 1) {
    return { status: "busy", runId: null, discovered: 0, processed: 0, changed: 0, errors: 0 };
  }

  try {
    const discovery = await discoverLexRssDocuments({
      maxDocuments: Math.max(1, Math.min(options.maxDocuments ?? 40, 40)),
      wait: options.wait,
      fetchImpl: options.fetchImpl,
      now: () => now,
    });
    const entries = discovery.entries;
    const existingRows = entries.length === 0 ? { results: [] } : await env.DB.prepare(
      `SELECT id,canonical_url AS canonicalUrl,act_title AS actTitle,fingerprint
         FROM legal_monitoring_metadata
        WHERE canonical_url IN (${entries.map(() => "?").join(",")})`,
    ).bind(...entries.map((entry) => entry.reference.canonicalUrl)).all<{
      id: string;
      canonicalUrl: string;
      actTitle: string;
      fingerprint: string;
    }>();
    const existingByUrl = new Map(existingRows.results.map((row) => [row.canonicalUrl, row]));
    const metadataWrites: MetadataWrite[] = [];
    const changeEventWrites: ChangeEventWrite[] = [];
    const notificationEvents: MonitoringNotificationEvent[] = [];
    let processed = 0;
    let changed = 0;
    for (const entry of entries) {
      const title = safeTitle(entry.title, entry.reference.canonicalId);
      const fingerprint = await sha256([
        entry.reference.canonicalUrl,
        title,
      ].join("\n"));
      const existing = existingByUrl.get(entry.reference.canonicalUrl);
      const metadataId = existing?.id ?? crypto.randomUUID();
      // Lex RSS pubDate is feed-delivery metadata and can change without a legal
      // title change. It must not create a new customer event on every retry.
      const isChanged = Boolean(existing && existing.actTitle !== title);
      const isNew = !existing;
      metadataWrites.push({
        id: metadataId,
        canonicalUrl: entry.reference.canonicalUrl,
        canonicalId: entry.reference.canonicalId,
        locale: entry.reference.locale,
        title,
        revisionDate: entry.publishedAt,
        fingerprint,
      });
      processed += 1;
      if (!isNew && !isChanged) continue;
      changed += isChanged ? 1 : 0;
      const eventId = `lex_change_${await sha256(`${metadataId}:${fingerprint}`)}`.slice(0, 96);
      const changeEvent = {
        eventId,
        metadataId,
        canonicalUrl: entry.reference.canonicalUrl,
        title,
        changeType: isNew ? "new_act" as const : "metadata_changed" as const,
        fingerprint,
      };
      changeEventWrites.push(changeEvent);
      // Initial discovery fills the feed without flooding customers. Subsequent
      // title changes create one digest notification per recipient and run.
      if (isChanged) notificationEvents.push(changeEvent);
    }
    const notificationStatements = await monitoringNotificationStatements({
      db: env.DB,
      events: notificationEvents,
      now: timestamp,
    });
    const writes = [
      ...metadataWriteStatements(env.DB, metadataWrites, timestamp),
      ...changeEventWriteStatements(env.DB, changeEventWrites, timestamp),
      ...notificationStatements,
    ];
    if (writes.length) await env.DB.batch(writes);
    await env.DB.prepare(
      `UPDATE source_sync_runs
          SET status='success',discovered_count=?,fetched_count=?,changed_count=?,verified_count=?,error_count=0,
              finished_at=?,error_summary=NULL,updated_at=?
        WHERE id=? AND status='running'`,
    ).bind(entries.length, processed, changed, processed, timestamp, timestamp, id).run();
    return { status: "success", runId: id, discovered: entries.length, processed, changed, errors: 0 };
  } catch (error) {
    const code = safeErrorCode(error);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE source_sync_runs
            SET status='failed',error_count=1,finished_at=?,error_summary=?,updated_at=?
          WHERE id=? AND status='running'`,
      ).bind(timestamp, code, timestamp, id),
      env.DB.prepare(
        `INSERT INTO source_sync_errors (id,run_id,source_url,external_id,error_code,retryable,safe_summary,occurred_at)
         VALUES (?,?,NULL,NULL,?,?,?,?)`,
      ).bind(crypto.randomUUID(), id, code, 1, code, timestamp),
    ]);
    return { status: "failed", runId: id, discovered: 0, processed: 0, changed: 0, errors: 1 };
  }
}

export async function reconcileStaleLexMetadataMonitorRuns(
  env: Pick<LexMetadataEnv, "APP_ENV" | "DB">,
  options: { now?: Date; staleAfterMs?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  const staleBefore = new Date(now.getTime() - Math.max(60_000, options.staleAfterMs ?? LEX_METADATA_STALE_RUN_MS)).toISOString();
  const result = await env.DB.prepare(
    `UPDATE source_sync_runs
        SET status='failed',error_count=CASE WHEN error_count<1 THEN 1 ELSE error_count END,
            finished_at=?,error_summary='LEX_METADATA_MONITOR_STALE',updated_at=?
      WHERE environment=? AND source_kind='lex'
        AND run_type IN ('metadata_monitor','metadata_retry','manual_metadata_monitor')
        AND status='running' AND started_at<=?`,
  ).bind(timestamp, timestamp, env.APP_ENV, staleBefore).run();
  return Number(result.meta.changes ?? 0);
}

export async function lexMetadataRetryDue(
  env: Pick<LexMetadataEnv, "APP_ENV" | "DB">,
  now = new Date(),
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT status,finished_at AS finishedAt FROM source_sync_runs
      WHERE environment=? AND source_kind='lex'
        AND run_type IN ('metadata_monitor','metadata_retry','manual_metadata_monitor')
      ORDER BY started_at DESC LIMIT 1`,
  ).bind(env.APP_ENV).first<{ status: string; finishedAt: string | null }>();
  if (!row || row.status !== "failed" || !row.finishedAt) return false;
  const age = now.getTime() - Date.parse(row.finishedAt);
  return Number.isFinite(age) && age >= 5 * 60 * 1_000;
}
