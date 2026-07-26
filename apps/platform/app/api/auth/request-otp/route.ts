import { normalizeEmail, randomOtp, randomToken } from "../../../../lib/auth/crypto";
import { runtimeIdentityProtection } from "../../../../lib/auth/identity-runtime";
import {
  parseJsonRequest,
  requestOtpInputSchema,
} from "../../../../lib/auth/input";
import { reserveOtpChallenge } from "../../../../lib/auth/otp-request";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const env = runtimeEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return json({ error: "Отправка кода временно не настроена." }, 503);
  const parsed = await parseJsonRequest(request, requestOtpInputSchema);
  if (!parsed.ok) {
    const status = parsed.error === "payload_too_large"
      ? 413
      : parsed.error === "invalid_content_type"
        ? 415
        : 400;
    return json({
      code: parsed.error.toLocaleUpperCase(),
      error: "Проверьте формат запроса.",
    }, status);
  }
  const { purpose, locale, accountType } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: locale === "ru" ? "Проверьте адрес электронной почты." : "Elektron pochta manzilini tekshiring." }, 400);

  const db = requireD1();
  const connectingIp = request.headers.get("cf-connecting-ip")?.trim() || null;
  const id = crypto.randomUUID();
  const code = randomOtp();
  const salt = randomToken(16);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + 10 * 60 * 1000).toISOString();
  const reservation = await reserveOtpChallenge(db, {
    identityContext: runtimeIdentityProtection(),
    id,
    email,
    requestIp: connectingIp,
    purpose,
    locale,
    accountType,
    codeSalt: salt,
    code,
    expiresAt,
    now,
    cooldownSince: new Date(nowMs - 60 * 1000).toISOString(),
    hourlySince: new Date(nowMs - 60 * 60 * 1000).toISOString(),
  });
  if (reservation.status === "blocked") {
    const latestTimestamp = reservation.latestActiveCreatedAt
      ? Date.parse(reservation.latestActiveCreatedAt)
      : Number.NaN;
    const retryAfterSeconds = Number.isFinite(latestTimestamp)
      ? Math.max(0, 60 - Math.floor((nowMs - latestTimestamp) / 1000))
      : 0;
    if (retryAfterSeconds > 0) {
      return json({
        code: "OTP_COOLDOWN",
        retryAfterSeconds,
        error: locale === "ru"
          ? `Новый код можно запросить через ${retryAfterSeconds} сек.`
          : `Yangi kodni ${retryAfterSeconds} soniyadan keyin so‘rash mumkin.`,
      }, 429);
    }
    return json({
      code: "OTP_RATE_LIMIT",
      error: locale === "ru"
        ? "Слишком много запросов. Попробуйте позже."
        : "Juda ko‘p so‘rov. Keyinroq urinib ko‘ring.",
    }, 429);
  }

  const subject = locale === "ru" ? "Код входа в JURO" : "JURO kirish kodi";
  const safeCode = escapeHtml(code);
  const html = locale === "ru"
    ? `<div style="font-family:Arial,sans-serif;color:#111d36"><h2>Ваш код JURO</h2><p style="font-size:28px;letter-spacing:8px;font-weight:700">${safeCode}</p><p>Код действует 10 минут и предназначен только для вас. Никому его не передавайте.</p></div>`
    : `<div style="font-family:Arial,sans-serif;color:#111d36"><h2>JURO kodingiz</h2><p style="font-size:28px;letter-spacing:8px;font-weight:700">${safeCode}</p><p>Kod 10 daqiqa amal qiladi va faqat siz uchun. Uni hech kimga bermang.</p></div>`;
  let sent: Response | null = null;
  try {
    sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": `juro_otp_${id}`,
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject, html }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    sent = null;
  }
  if (!sent?.ok) {
    await db.prepare("UPDATE auth_otp_challenges SET invalidated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
    return json({ code: "EMAIL_PROVIDER_ERROR", error: locale === "ru" ? "Не удалось отправить письмо. Попробуйте позже." : "Xat yuborilmadi. Keyinroq urinib ko‘ring." }, 502);
  }
  return json({ ok: true, challengeId: id, expiresInSeconds: 600, resendAfterSeconds: 60 });
});
