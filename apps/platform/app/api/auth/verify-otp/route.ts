import { normalizeEmail, randomToken, sha256 } from "../../../../lib/auth/crypto";
import { sessionCookie } from "../../../../lib/auth/session";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { ensureDefaultWorkspace } from "../../../../lib/platform/workspace";

function json(body: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "private, no-store", pragma: "no-cache" });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { challengeId?: string; email?: string; code?: string; purpose?: string; locale?: string; accountType?: string; firstName?: string; lastName?: string; companyName?: string; acceptTerms?: boolean; acceptPrivacy?: boolean; acceptPersonalData?: boolean; marketing?: boolean } | null;
  const email = normalizeEmail(body?.email ?? "");
  const code = (body?.code ?? "").replace(/\D/g, "");
  const locale = body?.locale === "uz" ? "uz" : "ru";
  const purpose = body?.purpose === "login" ? "login" : "register";
  if (!body?.challengeId || !email || code.length !== 6) return json({ error: locale === "ru" ? "Проверьте код." : "Kodni tekshiring." }, 400);
  if (purpose === "register" && (!body.acceptTerms || !body.acceptPrivacy || !body.acceptPersonalData)) return json({ error: locale === "ru" ? "Нужно принять обязательные документы." : "Majburiy hujjatlarni qabul qilish kerak." }, 400);

  const db = requireD1();
  const challenge = await db.prepare("SELECT * FROM auth_otp_challenges WHERE id = ? AND email_hash = ? AND purpose = ? LIMIT 1")
    .bind(body.challengeId, await sha256(email), purpose).first<{ id: string; code_salt: string; code_hash: string; attempt_count: number; max_attempts: number; expires_at: string; consumed_at: string | null; invalidated_at: string | null; account_type: string }>();
  const now = new Date().toISOString();
  if (!challenge) return json({ code: "OTP_INVALID", error: locale === "ru" ? "Код недействителен." : "Kod yaroqsiz." }, 400);
  if (challenge.consumed_at) return json({ code: "OTP_USED", error: locale === "ru" ? "Этот код уже использован. Запросите новый." : "Bu kod allaqachon ishlatilgan. Yangi kod so‘rang." }, 400);
  if (challenge.invalidated_at) return json({ code: "OTP_REPLACED", error: locale === "ru" ? "Код заменён новым. Используйте последнее письмо." : "Kod yangisi bilan almashtirilgan. Oxirgi xatdan foydalaning." }, 400);
  if (challenge.expires_at <= now) return json({ code: "OTP_EXPIRED", error: locale === "ru" ? "Срок действия кода истёк. Запросите новый." : "Kod muddati tugagan. Yangi kod so‘rang." }, 400);
  if (challenge.attempt_count >= challenge.max_attempts) return json({ code: "OTP_ATTEMPTS_EXCEEDED", error: locale === "ru" ? "Слишком много попыток. Запросите новый код." : "Urinishlar soni oshib ketdi. Yangi kod so‘rang." }, 429);
  await db.prepare("UPDATE auth_otp_challenges SET attempt_count = attempt_count + 1 WHERE id = ?").bind(challenge.id).run();
  if ((await sha256(`${challenge.code_salt}:${code}`)) !== challenge.code_hash) {
    const lastAttempt = challenge.attempt_count + 1 >= challenge.max_attempts;
    return json({
      code: lastAttempt ? "OTP_ATTEMPTS_EXCEEDED" : "OTP_INCORRECT",
      error: lastAttempt
        ? (locale === "ru" ? "Попытки закончились. Запросите новый код." : "Urinishlar tugadi. Yangi kod so‘rang.")
        : (locale === "ru" ? "Неверный код." : "Kod noto‘g‘ri."),
    }, lastAttempt ? 429 : 400);
  }

  let user = await db.prepare("SELECT id, onboarding_completed_at AS onboardingCompletedAt FROM user_profiles WHERE lower(email) = lower(?) LIMIT 1")
    .bind(email).first<{ id: string; onboardingCompletedAt: string | null }>();
  if (purpose === "login" && !user) return json({ error: locale === "ru" ? "Не удалось завершить вход." : "Kirishni yakunlab bo‘lmadi." }, 400);
  const accountType = body?.accountType === "business" ? "business" : challenge.account_type === "business" ? "business" : "individual";
  const fullName = [body?.firstName?.trim(), body?.lastName?.trim()].filter(Boolean).join(" ").slice(0, 160) || null;
  if (!user) {
    user = { id: crypto.randomUUID(), onboardingCompletedAt: null };
    await db.prepare("INSERT INTO user_profiles (id,email,full_name,locale,account_type,company_name,onboarding_completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,NULL,?,?)")
      .bind(user.id, email, fullName, locale, accountType, body?.companyName?.trim().slice(0, 180) || null, now, now).run();
  } else if (purpose === "register") {
    await db.prepare("UPDATE user_profiles SET full_name = coalesce(?,full_name), locale = ?, account_type = ?, company_name = ?, updated_at = ? WHERE id = ?")
      .bind(fullName, locale, accountType, body?.companyName?.trim().slice(0, 180) || null, now, user.id).run();
  }
  await ensureDefaultWorkspace(user.id);

  if (purpose === "register") {
    const acceptances = [["terms", true], ["privacy-policy", true], ["personal-data-processing", true], ["marketing", Boolean(body?.marketing)]] as const;
    await db.batch(acceptances.filter(([, accepted]) => accepted).map(([key]) => db.prepare("INSERT OR IGNORE INTO user_acceptances (id,user_id,document_key,document_version,accepted_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), user!.id, key, "2026-07-24", now)));
  }
  await db.prepare("UPDATE auth_otp_challenges SET consumed_at = ? WHERE id = ?").bind(now, challenge.id).run();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare("INSERT INTO auth_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), user.id, await sha256(token), expiresAt, now, now).run();
  return json({
    ok: true,
    redirectTo: purpose === "register" || !user.onboardingCompletedAt
      ? `/onboarding?lang=${locale}`
      : `/${locale}/${accountType}/main`,
  }, 200, sessionCookie(token));
}
