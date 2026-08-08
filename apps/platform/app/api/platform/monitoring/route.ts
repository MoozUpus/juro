import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow, parseJson } from "../../../../lib/document-builder/storage/db";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import {
  filterTrustedVerifiedLegalSources,
  isTrustedVerifiedLegalSource,
} from "../../../../lib/legal/source-trust";
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
  const [preference, updates, sourceCheck] = await db.batch([
    db.prepare(
      `SELECT id,audience,topics_json AS topicsJson,channels_json AS channelsJson,
        frequency,locale,document_impact_consent AS documentImpactConsent,
        last_delivered_at AS lastDeliveredAt,updated_at AS updatedAt
       FROM monitoring_preferences WHERE workspace_id=? AND user_id=? LIMIT 1`,
    ).bind(workspace.id, user.id),
    db.prepare(
      `SELECT u.id,u.title_original AS titleOriginal,u.original_language AS originalLanguage,
        u.title_ru AS titleRu,u.title_uz AS titleUz,u.summary_ru AS summaryRu,u.summary_uz AS summaryUz,
        u.change_summary_ru AS changeSummaryRu,u.change_summary_uz AS changeSummaryUz,
        u.recommended_action_ru AS recommendedActionRu,u.recommended_action_uz AS recommendedActionUz,
        u.topics_json AS topicsJson,u.affected_audiences_json AS affectedAudiencesJson,
        u.adopted_at AS adoptedAt,u.effective_at AS effectiveAt,u.published_at AS publishedAt,
        s.act_title AS sourceTitle,s.act_identifier AS sourceIdentifier,
        s.official_url AS officialUrl,s.revision_date AS sourceRevisionDate,
        s.last_checked_at AS sourceLastCheckedAt,s.status AS sourceStatus,
        s.source_type AS sourceType,s.verification_state AS verificationState,
        s.verified_at AS sourceVerifiedAt,s.content_sha256 AS sourceContentSha256
       FROM legislation_updates u JOIN legal_sources s ON s.id=u.source_id
       WHERE u.status='published_verified' AND u.verified_at IS NOT NULL
         AND s.status='verified' AND s.verification_state='verified'
         AND s.verified_at IS NOT NULL AND s.content_sha256 IS NOT NULL
       ORDER BY u.published_at DESC LIMIT 50`,
    ),
    db.prepare(
      `SELECT official_url AS officialUrl,status,source_type AS sourceType,
        verification_state AS verificationState,verified_at AS verifiedAt,
        content_sha256 AS contentSha256,last_checked_at AS lastCheckedAt
       FROM legal_sources WHERE status='verified' AND verification_state='verified'
         AND verified_at IS NOT NULL AND content_sha256 IS NOT NULL`,
    ),
  ]);
  const rawPreference = preference.results[0] as Record<string, unknown> | undefined;
  const parsedPreference = rawPreference ? {
    ...rawPreference,
    audience: String(rawPreference.audience || ""),
    topics: parseJson<string[]>(String(rawPreference.topicsJson || "[]"), []),
    channels: parseJson<string[]>(String(rawPreference.channelsJson || "[]"), ["in_app"]),
    documentImpactConsent: Boolean(rawPreference.documentImpactConsent),
  } : null;
  const selectedTopics = new Set(parsedPreference?.topics ?? []);
  const selectedAudience = String(parsedPreference?.audience || "");
  const trustedSourceStatusRows = filterTrustedVerifiedLegalSources(
    sourceCheck.results.map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        ...item,
        officialUrl: String(item.officialUrl || ""),
        status: String(item.status || ""),
        sourceType: String(item.sourceType || ""),
        verificationState: String(item.verificationState || ""),
        verifiedAt: String(item.verifiedAt || ""),
        contentSha256: String(item.contentSha256 || ""),
        lastCheckedAt: String(item.lastCheckedAt || ""),
      };
    }),
  );
  const lastCheckedAt = trustedSourceStatusRows.reduce<string | null>(
    (latest, source) => !latest || source.lastCheckedAt > latest
      ? source.lastCheckedAt
      : latest,
    null,
  );
  const env = runtimeEnv();
  return response({
    preference: parsedPreference,
    updates: updates.results
      .map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          ...item,
          officialUrl: String(item.officialUrl || ""),
          sourceStatus: String(item.sourceStatus || ""),
          sourceType: String(item.sourceType || ""),
          verificationState: String(item.verificationState || ""),
          sourceVerifiedAt: String(item.sourceVerifiedAt || ""),
          sourceContentSha256: String(item.sourceContentSha256 || ""),
          title: locale === "uz" ? (item.titleUz || item.titleOriginal) : (item.titleRu || item.titleOriginal),
          summary: locale === "uz" ? item.summaryUz : item.summaryRu,
          changeSummary: locale === "uz" ? item.changeSummaryUz : item.changeSummaryRu,
          recommendedAction: locale === "uz" ? item.recommendedActionUz : item.recommendedActionRu,
          topics: parseJson<string[]>(String(item.topicsJson || "[]"), []),
          affectedAudiences: parseJson<string[]>(String(item.affectedAudiencesJson || "[]"), []),
        };
      })
      .filter((item) => {
        try {
          const hasSafeSource = isTrustedVerifiedLegalSource({
            officialUrl: String(item.officialUrl),
            status: String(item.sourceStatus || ""),
            sourceType: String(item.sourceType || ""),
            verificationState: String(item.verificationState || ""),
            verifiedAt: String(item.sourceVerifiedAt || ""),
            contentSha256: String(item.sourceContentSha256 || ""),
          });
          const matchesTopic = !selectedTopics.size || item.topics.some((topic: string) => selectedTopics.has(topic));
          const matchesAudience = !selectedAudience || item.affectedAudiences.length === 0
            || item.affectedAudiences.includes(selectedAudience);
          return hasSafeSource && matchesTopic && matchesAudience;
        } catch {
          return false;
        }
      }),
    status: {
      integration: env.LEGISLATION_FEED_PROVIDER ? "adapter_pending" : "not_configured",
      automaticPublication: false,
      emailConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
      lastCheckedAt,
      verifiedSourceCount: trustedSourceStatusRows.length,
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
  const env = runtimeEnv();
  if (selectedChannels.includes("email") && !(env.RESEND_API_KEY && env.EMAIL_FROM)) {
    return response({ error: locale === "ru" ? "Email-инфраструктура пока не подключена." : "Email infratuzilmasi hali ulanmagan." }, 409);
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
        document_impact_consent,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(workspace_id,user_id) DO UPDATE SET
        audience=excluded.audience,topics_json=excluded.topics_json,
        channels_json=excluded.channels_json,frequency=excluded.frequency,
        locale=excluded.locale,document_impact_consent=excluded.document_impact_consent,
        updated_at=excluded.updated_at`,
    ).bind(
      id, workspace.id, user.id, body.audience, JSON.stringify(selectedTopics),
      JSON.stringify(selectedChannels), body.frequency, locale,
      body.documentImpactConsent ? 1 : 0, now, now,
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
