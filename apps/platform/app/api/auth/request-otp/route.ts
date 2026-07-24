import { normalizeEmail, randomOtp, randomToken, sha256 } from "../../../../lib/auth/crypto";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export async function POST(request: Request) {
  const env = runtimeEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return json({ error: "Отправка кода временно не настроена." }, 503);
  const body = await request.json().catch(() => null) as { email?: string; purpose?: string; locale?: string; accountType?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  const purpose = body?.purpose === "login" ? "login" : "register";
  const locale = body?.locale === "uz" ? "uz" : "ru";
  const accountType = body?.accountType === "business" ? "business" : "individual";
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: locale === "ru" ? "Проверьте адрес электронной почты." : "Elektron pochta manzilini tekshiring." }, 400);

  const db = requireD1();
  const emailHash = await sha256(email);
  const ipHash = await sha256(request.headers.get("cf-connecting-ip") ?? "unknown");
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const count = await db.prepare("SELECT count(*) AS total FROM auth_otp_challenges WHERE (email_hash = ? OR request_ip_hash = ?) AND created_at > ?")
    .bind(emailHash, ipHash, since).first<{ total: number }>();
  if ((count?.total ?? 0) >= 8) return json({ error: locale === "ru" ? "Слишком много запросов. Попробуйте позже." : "Juda ko‘p so‘rov. Keyinroq urinib ko‘ring." }, 429);

  const id = crypto.randomUUID();
  const code = randomOtp();
  const salt = randomToken(16);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare("UPDATE auth_otp_challenges SET invalidated_at = ? WHERE email_hash = ? AND purpose = ? AND consumed_at IS NULL AND invalidated_at IS NULL").bind(now, emailHash, purpose),
    db.prepare("INSERT INTO auth_otp_challenges (id,email,email_hash,purpose,locale,account_type,code_salt,code_hash,attempt_count,max_attempts,expires_at,request_ip_hash,created_at) VALUES (?,?,?,?,?,?,?,?,0,5,?,?,?)")
      .bind(id, email, emailHash, purpose, locale, accountType, salt, await sha256(`${salt}:${code}`), expiresAt, ipHash, now),
  ]);

  const subject = locale === "ru" ? "Код входа в JURO" : "JURO kirish kodi";
  const safeCode = escapeHtml(code);
  const html = locale === "ru"
    ? `<div style="font-family:Arial,sans-serif;color:#111d36"><h2>Ваш код JURO</h2><p style="font-size:28px;letter-spacing:8px;font-weight:700">${safeCode}</p><p>Код действует 10 минут и предназначен только для вас. Никому его не передавайте.</p></div>`
    : `<div style="font-family:Arial,sans-serif;color:#111d36"><h2>JURO kodingiz</h2><p style="font-size:28px;letter-spacing:8px;font-weight:700">${safeCode}</p><p>Kod 10 daqiqa amal qiladi va faqat siz uchun. Uni hech kimga bermang.</p></div>`;
  const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject, html }) });
  if (!sent.ok) {
    await db.prepare("UPDATE auth_otp_challenges SET invalidated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
    return json({ error: locale === "ru" ? "Не удалось отправить письмо. Попробуйте позже." : "Xat yuborilmadi. Keyinroq urinib ko‘ring." }, 502);
  }
  return json({ ok: true, challengeId: id, expiresInSeconds: 600, resendAfterSeconds: 60 });
}
