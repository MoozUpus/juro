"use client";

import { LoaderCircle, Phone, PhoneCall } from "lucide-react";
import { useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type RevealedPhone = {
  display: string;
  href: string;
  counterpartRole: "owner" | "lawyer";
};

export function LawyerPhoneContact({
  requestId,
  locale,
}: {
  requestId: string;
  locale: PlatformLocale;
}) {
  const ru = locale === "ru";
  const [phone, setPhone] = useState<RevealedPhone | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reveal() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/phone`,
        { method: "POST", headers: { "x-juro-csrf": "1" } },
      );
      const payload = await response.json() as { phone?: RevealedPhone; error?: string };
      if (!response.ok || !payload.phone) throw new Error(payload.error || (ru ? "Контакт недоступен." : "Aloqa mavjud emas."));
      setPhone(payload.phone);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  }

  return <section className="lawyer-phone-contact" aria-label={ru ? "Телефонная связь" : "Telefon aloqasi"}>
    <div><Phone aria-hidden="true" /><div><strong>{ru ? "Связаться по телефону" : "Telefon orqali bog‘lanish"}</strong><p>{ru ? "Номер раскрывается только участникам активной заявки. JURO не записывает обычный телефонный звонок." : "Raqam faqat faol so‘rov ishtirokchilariga ko‘rsatiladi. JURO oddiy telefon qo‘ng‘irog‘ini yozib olmaydi."}</p></div></div>
    {error && <p className="plan-error" role="alert">{error}</p>}
    {phone
      ? <a className="lawyer-phone-link" href={phone.href}><PhoneCall aria-hidden="true" />{ru ? `Позвонить: ${phone.display}` : `Qo‘ng‘iroq qilish: ${phone.display}`}</a>
      : <button type="button" disabled={busy} aria-busy={busy} onClick={() => void reveal()}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <PhoneCall aria-hidden="true" />}{ru ? "Показать номер" : "Raqamni ko‘rsatish"}</button>}
  </section>;
}
