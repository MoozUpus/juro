import Link from "next/link";

export function AdminConsoleAccess({
  locale,
  environment,
}: {
  locale: "ru" | "uz";
  environment: "production" | "staging";
}) {
  const ru = locale === "ru";
  const label = environment === "production" ? "JURO · ADMIN" : "JURO · STAGING ADMIN";
  const returnTo = `/${locale}/admin/console`;
  return <main style={{ maxWidth: "44rem", margin: "4rem auto", padding: "1.5rem", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
    <p style={{ color: "#6b541f", fontWeight: 700, letterSpacing: ".08em" }}>{label}</p>
    <h1 style={{ color: "#062844" }}>{ru ? "Требуется защищённый вход" : "Himoyalangan kirish talab qilinadi"}</h1>
    <p style={{ lineHeight: 1.6, color: "#334e68" }}>
      {ru
        ? "Консоль доступна только сотруднику с действующей ролью и MFA/TOTP, подтверждённой за последние 15 минут. Если доступ назначен, войдите заново и вернитесь сюда."
        : "Konsol faqat amaldagi rolga va oxirgi 15 daqiqada tasdiqlangan MFA/TOTP ga ega xodim uchun ochiladi. Ruxsat berilgan bo‘lsa, qayta kiring va shu sahifaga qayting."}
    </p>
    <Link
      href={`/${locale}/auth/login?reauth=1&returnTo=${encodeURIComponent(returnTo)}`}
      style={{ display: "inline-flex", minHeight: 44, alignItems: "center", borderRadius: 8, padding: "0 1rem", background: "#062844", color: "white", fontWeight: 700, textDecoration: "none" }}
    >
      {ru ? "Обновить защищённый вход" : "Himoyalangan kirishni yangilash"}
    </Link>
    <p style={{ marginTop: "1rem", color: "#667784", fontSize: ".875rem", lineHeight: 1.5 }}>
      {ru
        ? "Страница не сообщает, какая именно проверка не пройдена, и не раскрывает наличие staff-ролей."
        : "Sahifa aynan qaysi tekshiruv o‘tmaganini yoki staff rollari mavjudligini oshkor qilmaydi."}
    </p>
  </main>;
}
