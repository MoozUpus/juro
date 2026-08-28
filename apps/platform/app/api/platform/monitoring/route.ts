import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow, parseJson } from "../../../../lib/document-builder/storage/db";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import {
  summarizeLexMetadataMonitoringFreshness,
} from "../../../../lib/legal/monitoring-freshness";
import { listMonitoringTaskCases } from "../../../../lib/platform/monitoring-tasks";
import { workspaceForUser } from "../../../../lib/platform/workspace";

const topics = new Set([
  "civil",
  "contract",
  "labor",
  "family",
  "tax",
  "entrepreneurship",
  "corporate",
  "administrative",
  "consumer",
  "personal_data_it",
  "banking_finance",
]);
const frequencies = new Set(["immediate", "daily", "weekly"]);
const channels = new Set(["in_app", "email"]);

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const locale = new URL(request.url).searchParams.get("locale") === "uz" ? "uz" : "ru";
  const db = requireD1();
  const [preference, updates, sourceCheck, latestRun] = await db.batch([
    db.prepare(
      `SELECT id,audience,topics_json AS topicsJson,channels_json AS channelsJson,
        frequency,locale,document_impact_consent AS documentImpactConsent,
        last_delivered_at AS lastDeliveredAt,updated_at AS updatedAt
       FROM monitoring_preferences WHERE workspace_id=? AND user_id=? LIMIT 1`,
    ).bind(workspace.id, user.id),
    db.prepare(
      `SELECT e.id,e.act_title AS title,e.change_type AS changeType,e.detected_at AS publishedAt,
        e.canonical_url AS officialUrl,m.canonical_id AS sourceIdentifier,m.locale AS originalLanguage,
        m.act_title AS sourceTitle,m.revision_date AS sourceRevisionDate,
        m.last_checked_at AS sourceLastCheckedAt,m.http_status AS sourceHttpStatus,
        m.last_error_code AS sourceErrorCode
       FROM legal_monitoring_change_events e
       JOIN legal_monitoring_metadata m ON m.id=e.metadata_id
       WHERE m.http_status BETWEEN 200 AND 299 AND m.last_error_code IS NULL
       ORDER BY e.detected_at DESC LIMIT 50`,
    ),
    db.prepare(
      `SELECT canonical_url AS canonicalUrl,last_checked_at AS lastCheckedAt,
        http_status AS httpStatus,last_error_code AS lastErrorCode
       FROM legal_monitoring_metadata`,
    ),
    db.prepare(
      `SELECT status,run_type AS runType,discovered_count AS discoveredCount,
        fetched_count AS fetchedCount,changed_count AS changedCount,
        verified_count AS verifiedCount,error_count AS errorCount,
        started_at AS startedAt,finished_at AS finishedAt,error_summary AS errorSummary
       FROM source_sync_runs
       WHERE environment=? AND source_kind='lex'
         AND run_type IN ('metadata_monitor','metadata_retry','manual_metadata_monitor')
       ORDER BY started_at DESC LIMIT 1`,
    ).bind(runtimeEnv().APP_ENV),
  ]);
  const rawPreference = preference.results[0] as Record<string, unknown> | undefined;
  const parsedPreference = rawPreference ? {
    ...rawPreference,
    audience: String(rawPreference.audience || ""),
    topics: parseJson<string[]>(String(rawPreference.topicsJson || "[]"), []),
    channels: parseJson<string[]>(String(rawPreference.channelsJson || "[]"), ["in_app"]),
    documentImpactConsent: Boolean(rawPreference.documentImpactConsent),
  } : null;
  const selectedAudience = String(parsedPreference?.audience || "");
  const sourceStatusRows = sourceCheck.results.map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        ...item,
        canonicalUrl: String(item.canonicalUrl || ""),
        lastCheckedAt: String(item.lastCheckedAt || ""),
        httpStatus: Number(item.httpStatus || 0),
        lastErrorCode: item.lastErrorCode ? String(item.lastErrorCode) : null,
      };
    });
  const now = new Date();
  const taskCases = await listMonitoringTaskCases(db, user.id, workspace.id, now.toISOString());
  const freshness = summarizeLexMetadataMonitoringFreshness(sourceStatusRows, now);
  const env = runtimeEnv();
  const latestRunRow = latestRun.results[0] as Record<string, unknown> | undefined;
  const run = latestRunRow ? {
    status: String(latestRunRow.status || "unknown"),
    runType: String(latestRunRow.runType || ""),
    discoveredCount: Number(latestRunRow.discoveredCount || 0),
    fetchedCount: Number(latestRunRow.fetchedCount || 0),
    changedCount: Number(latestRunRow.changedCount || 0),
    verifiedCount: Number(latestRunRow.verifiedCount || 0),
    errorCount: Number(latestRunRow.errorCount || 0),
    startedAt: String(latestRunRow.startedAt || ""),
    finishedAt: latestRunRow.finishedAt ? String(latestRunRow.finishedAt) : null,
    errorSummary: latestRunRow.errorSummary ? String(latestRunRow.errorSummary) : null,
  } : null;
  return response({
    preference: parsedPreference,
    taskCases,
    updates: updates.results
      .map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          ...item,
          id: String(item.id),
          officialUrl: String(item.officialUrl || ""),
          sourceStatus: "metadata",
          sourceLastCheckedAt: String(item.sourceLastCheckedAt || ""),
          title: String(item.title || "Lex.uz"),
          summary: null,
          changeSummary: String(item.changeType || "") === "metadata_changed"
            ? (locale === "ru" ? "Lex.uz изменил metadata записи; откройте официальный акт для проверки содержания." : "Lex.uz yozuv metadata’larini o‘zgartirdi; mazmunini tekshirish uchun rasmiy aktni oching.")
            : (locale === "ru" ? "Lex.uz обнаружил новый акт в официальном RSS; откройте ссылку для проверки содержания." : "Lex.uz rasmiy RSS’da yangi aktni aniqladi; mazmunini tekshirish uchun havolani oching."),
          recommendedAction: null,
          topics: [] as string[],
          affectedAudiences: [] as string[],
          adoptedAt: null,
          effectiveAt: null,
          publishedAt: String(item.publishedAt || ""),
          sourceTitle: String(item.sourceTitle || item.title || "Lex.uz"),
          sourceIdentifier: item.sourceIdentifier ? String(item.sourceIdentifier) : null,
          sourceRevisionDate: item.sourceRevisionDate ? String(item.sourceRevisionDate) : null,
          originalLanguage: String(item.originalLanguage || "ru"),
        };
      })
      .filter((item) => {
        try {
          const url = new URL(String(item.officialUrl));
          const hasSafeSource = url.protocol === "https:" && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz");
          const matchesTopic = true; // RSS metadata does not infer a legal topic from an act title.
          const matchesAudience = !selectedAudience || item.affectedAudiences.length === 0
            || item.affectedAudiences.includes(selectedAudience);
          return hasSafeSource && matchesTopic && matchesAudience;
        } catch {
          return false;
        }
      }),
    status: {
      integration: (env as Record<string, unknown>).LEGAL_LEX_METADATA_MONITOR_ENABLED !== "true"
        ? "disabled"
        : freshness.state === "fresh" ? "active" : "degraded",
      automaticPublication: true,
      controlledBeta: false,
      // Generic transactional email is configured, but legislation-monitor
      // email delivery has no dedicated retry-safe outbox yet. Keep the UI
      // honest and expose only the working in-app channel.
      emailConfigured: false,
      lastCheckedAt: freshness.latestCheckedAt,
      verifiedSourceCount: freshness.freshSourceCount,
      freshness,
      trustedSourceCount: freshness.trustedSourceCount,
      lexIngestionEnabled: (env as Record<string, unknown>).LEGAL_LEX_METADATA_MONITOR_ENABLED === "true",
      lastRun: run,
    },
  });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const body = await request.json().catch(() => null) as {
    audience?: string;
    topics?: string[];
    channels?: string[];
    frequency?: string;
    locale?: string;
    documentImpactConsent?: boolean;
  } | null;
  const locale = body?.locale === "uz" ? "uz" : "ru";
  const selectedTopics = Array.from(new Set(body?.topics || [])).filter((item) => topics.has(item));
  const selectedChannels = Array.from(new Set(body?.channels || [])).filter((item) => channels.has(item));
  if (!body || !["individual", "business"].includes(body.audience || "") || !frequencies.has(body.frequency || "")) {
    return response({ error: locale === "ru" ? "Проверьте аудиторию и частоту." : "Auditoriya va tezlikni tekshiring." }, 400);
  }
  if (!selectedTopics.length || selectedTopics.length !== (body.topics || []).length) {
    return response({ error: locale === "ru" ? "Выберите хотя бы одну поддерживаемую область права." : "Kamida bitta qo‘llab-quvvatlanadigan huquq sohasini tanlang." }, 400);
  }
  if (!selectedChannels.includes("in_app") || selectedChannels.length !== (body.channels || []).length) {
    return response({ error: locale === "ru" ? "In-app уведомления должны оставаться включёнными." : "Ilova ichidagi bildirishnomalar yoqilgan bo‘lishi kerak." }, 400);
  }
  if (selectedChannels.includes("email")) {
    return response({ error: locale === "ru" ? "Email-канал мониторинга пока не введён в эксплуатацию." : "Monitoring email kanali hali ishga tushirilmagan." }, 409);
  }
  const db = requireD1();
  const now = isoNow();
  const [existingPreference, existingConsent] = await db.batch([
    db.prepare(
      "SELECT id FROM monitoring_preferences WHERE workspace_id=? AND user_id=? LIMIT 1",
    ).bind(workspace.id, user.id),
    db.prepare(
      `SELECT id FROM consents WHERE workspace_id=? AND user_id=?
       AND type='legislation_document_impact' AND revoked_at IS NULL
       ORDER BY granted_at DESC LIMIT 1`,
    ).bind(workspace.id, user.id),
  ]);
  const id = String((existingPreference.results[0] as Record<string, unknown> | undefined)?.id || crypto.randomUUID());
  const activeConsentId = (existingConsent.results[0] as Record<string, unknown> | undefined)?.id;
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO monitoring_preferences
       (id,workspace_id,user_id,audience,topics_json,channels_json,frequency,locale,
        document_impact_consent,last_delivered_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(workspace_id,user_id) DO UPDATE SET
        audience=excluded.audience,topics_json=excluded.topics_json,
        channels_json=excluded.channels_json,frequency=excluded.frequency,
        locale=excluded.locale,document_impact_consent=excluded.document_impact_consent,
        last_delivered_at=coalesce(monitoring_preferences.last_delivered_at,excluded.last_delivered_at),
        updated_at=excluded.updated_at`,
    ).bind(
      id, workspace.id, user.id, body.audience, JSON.stringify(selectedTopics),
      JSON.stringify(selectedChannels), body.frequency, locale,
      body.documentImpactConsent ? 1 : 0, now, now, now,
    ),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'monitoring_preferences',?,'monitoring_preferences_updated',?,?)`,
    ).bind(crypto.randomUUID(), workspace.id, user.id, id, JSON.stringify({
      audience: body.audience,
      topics: selectedTopics,
      channels: selectedChannels,
      frequency: body.frequency,
      documentImpactConsent: Boolean(body.documentImpactConsent),
    }), now),
  ];
  if (body.documentImpactConsent && !activeConsentId) {
    statements.push(db.prepare(
      `INSERT INTO consents (id,user_id,workspace_id,type,version,scope_json,granted_at)
       VALUES (?,?,?,'legislation_document_impact','2026-07-26',?,?)`,
    ).bind(crypto.randomUUID(), user.id, workspace.id, JSON.stringify({ monitoringPreferenceId: id }), now));
  } else if (!body.documentImpactConsent && activeConsentId) {
    statements.push(db.prepare(
      `UPDATE consents SET revoked_at=? WHERE user_id=? AND workspace_id=?
       AND type='legislation_document_impact' AND revoked_at IS NULL`,
    ).bind(now, user.id, workspace.id));
  }
  await db.batch(statements);
  return response({
    ok: true,
    preference: {
      audience: body.audience,
      topics: selectedTopics,
      channels: selectedChannels,
      frequency: body.frequency,
      locale,
      documentImpactConsent: Boolean(body.documentImpactConsent),
    },
  });
});
