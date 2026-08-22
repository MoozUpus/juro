export type LawyerTrialReminderStage = "30" | "7" | "1" | "expired";

type TrialReminderRow = {
  id: string;
  userId: string;
  workspaceId: string;
  locale: "ru" | "uz";
  endsAt: string;
  reminder30SentAt: string | null;
  reminder7SentAt: string | null;
  reminder1SentAt: string | null;
  reminderExpiredSentAt: string | null;
};

const DAY_MS = 86_400_000;

export function lawyerTrialReminderStage(
  row: Pick<TrialReminderRow, "endsAt" | "reminder30SentAt" | "reminder7SentAt" | "reminder1SentAt" | "reminderExpiredSentAt">,
  now = Date.now(),
): LawyerTrialReminderStage | null {
  const remaining = Date.parse(row.endsAt) - now;
  if (!Number.isFinite(remaining)) return null;
  if (remaining <= 0 && !row.reminderExpiredSentAt) return "expired";
  if (remaining <= DAY_MS && !row.reminder1SentAt) return "1";
  if (remaining <= 7 * DAY_MS && !row.reminder7SentAt) return "7";
  if (remaining <= 30 * DAY_MS && !row.reminder30SentAt) return "30";
  return null;
}

function copy(stage: LawyerTrialReminderStage, locale: "ru" | "uz") {
  const ru = locale === "ru";
  if (stage === "expired") return {
    title: ru ? "90-дневный пробный период завершён" : "90 kunlik sinov muddati tugadi",
    body: ru ? "Профиль остаётся опубликованным по текущим тестовым правилам. Выберите тариф в разделе оплаты, когда будете готовы." : "Joriy sinov qoidalariga ko‘ra profil e’lon qilingan holda qoladi. Tayyor bo‘lganda to‘lov bo‘limida tarifni tanlang.",
  };
  const days = Number(stage);
  return {
    title: ru ? `Пробный период: осталось ${days} дн.` : `Sinov muddati: ${days} kun qoldi`,
    body: ru ? "Профиль и кабинет продолжают работать. Срок и дальнейшие варианты доступны в кабинете юриста." : "Profil va kabinet ishlashda davom etadi. Muddat va keyingi variantlar yurist kabinetida ko‘rsatilgan.",
  };
}

export async function enqueueDueLawyerTrialReminders(
  db: D1Database,
  input: { now?: Date; limit?: number } = {},
) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 100)));
  const due = await db.prepare(
    `SELECT t.id,p.user_id AS userId,u.default_workspace_id AS workspaceId,
      CASE WHEN u.locale='uz' THEN 'uz' ELSE 'ru' END AS locale,t.ends_at AS endsAt,
      t.reminder_30_sent_at AS reminder30SentAt,t.reminder_7_sent_at AS reminder7SentAt,
      t.reminder_1_sent_at AS reminder1SentAt,t.reminder_expired_sent_at AS reminderExpiredSentAt
     FROM lawyer_trials t
     JOIN lawyer_profiles p ON p.id=t.lawyer_profile_id
     JOIN user_profiles u ON u.id=p.user_id
     WHERE t.status IN ('active','extended') AND u.default_workspace_id IS NOT NULL
       AND t.ends_at<=?
       AND (t.reminder_30_sent_at IS NULL OR t.reminder_7_sent_at IS NULL
         OR t.reminder_1_sent_at IS NULL OR t.reminder_expired_sent_at IS NULL)
     ORDER BY t.ends_at ASC,t.id ASC LIMIT ?`,
  ).bind(new Date(now.getTime() + 30 * DAY_MS).toISOString(), limit).all<TrialReminderRow>();
  let sent = 0;
  for (const row of due.results) {
    const stage = lawyerTrialReminderStage(row, now.getTime());
    if (!stage) continue;
    const message = copy(stage, row.locale);
    const update = stage === "expired"
      ? "UPDATE lawyer_trials SET reminder_30_sent_at=COALESCE(reminder_30_sent_at,?),reminder_7_sent_at=COALESCE(reminder_7_sent_at,?),reminder_1_sent_at=COALESCE(reminder_1_sent_at,?),reminder_expired_sent_at=?,updated_at=? WHERE id=? AND reminder_expired_sent_at IS NULL"
      : stage === "1"
        ? "UPDATE lawyer_trials SET reminder_30_sent_at=COALESCE(reminder_30_sent_at,?),reminder_7_sent_at=COALESCE(reminder_7_sent_at,?),reminder_1_sent_at=?,updated_at=? WHERE id=? AND reminder_1_sent_at IS NULL"
        : stage === "7"
          ? "UPDATE lawyer_trials SET reminder_30_sent_at=COALESCE(reminder_30_sent_at,?),reminder_7_sent_at=?,updated_at=? WHERE id=? AND reminder_7_sent_at IS NULL"
          : "UPDATE lawyer_trials SET reminder_30_sent_at=?,updated_at=? WHERE id=? AND reminder_30_sent_at IS NULL";
    const updateBindings = stage === "expired"
      ? [nowIso, nowIso, nowIso, nowIso, nowIso, row.id]
      : stage === "1"
        ? [nowIso, nowIso, nowIso, nowIso, row.id]
        : stage === "7"
          ? [nowIso, nowIso, nowIso, row.id]
          : [nowIso, nowIso, row.id];
    const results = await db.batch([
      db.prepare(update).bind(...updateBindings),
      db.prepare(
        `INSERT INTO notifications
         (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
         SELECT ?,?,?,NULL,'billing',?,'lawyer_trial_reminder',?,?,NULL,?
         WHERE EXISTS (SELECT 1 FROM lawyer_trials WHERE id=? AND updated_at=?)`,
      ).bind(crypto.randomUUID(), row.workspaceId, row.userId, row.id, message.title, message.body, nowIso, row.id, nowIso),
    ]);
    if (Number(results[0]?.meta.changes ?? 0) === 1 && Number(results[1]?.meta.changes ?? 0) === 1) sent += 1;
  }
  return { due: due.results.length, sent };
}
