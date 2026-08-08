"use client";

/* eslint-disable react-hooks/set-state-in-effect -- preferences must hydrate after authenticated browser render. */

import { BellRing, LoaderCircle, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

const keys = [
  "marketing_email",
  "weekly_case_summary",
  "unfinished_document",
  "comments",
  "lawyer_request_updates",
] as const;

type PreferenceKey = typeof keys[number];
type Preferences = Record<PreferenceKey, boolean>;

const emptyPreferences: Preferences = {
  marketing_email: false,
  weekly_case_summary: false,
  unfinished_document: false,
  comments: false,
  lawyer_request_updates: false,
};

const copy: Record<PlatformLocale, Record<PreferenceKey, { title: string; description: string }>> = {
  ru: {
    marketing_email: { title: "Новости и предложения", description: "Обновления продукта, юридические материалы и специальные предложения." },
    weekly_case_summary: { title: "Еженедельная сводка по делам", description: "Напоминание об открытых делах, задачах и ближайших сроках." },
    unfinished_document: { title: "Незавершённые документы", description: "Напоминания о черновиках, которые ещё не отправлены или не подписаны." },
    comments: { title: "Комментарии и предложения", description: "Email-уведомления о новых комментариях и предложениях в общих документах." },
    lawyer_request_updates: { title: "Заявки юристам", description: "Изменения статуса заявки, предложения и сообщения от выбранного юриста." },
  },
  uz: {
    marketing_email: { title: "Yangiliklar va takliflar", description: "Mahsulot yangiliklari, yuridik materiallar va maxsus takliflar." },
    weekly_case_summary: { title: "Ishlar bo‘yicha haftalik xulosa", description: "Ochiq ishlar, vazifalar va yaqin muddatlar haqida eslatma." },
    unfinished_document: { title: "Tugallanmagan hujjatlar", description: "Hali yuborilmagan yoki imzolanmagan qoralamalar haqida eslatma." },
    comments: { title: "Izohlar va takliflar", description: "Umumiy hujjatlardagi yangi izoh va takliflar haqida email xabarlari." },
    lawyer_request_updates: { title: "Yuristga so‘rovlar", description: "So‘rov holati, takliflar va tanlangan yurist xabarlari o‘zgarishi." },
  },
};

export function NotificationPreferencesPanel({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [preferences, setPreferences] = useState<Preferences>(emptyPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/platform/notification-preferences", { cache: "no-store" });
      const body = await response.json() as { preferences?: Preferences; error?: string };
      if (!response.ok || !body.preferences) throw new Error(body.error || (ru ? "Не удалось загрузить настройки уведомлений." : "Bildirishnoma sozlamalarini yuklab bo‘lmadi."));
      setPreferences(body.preferences);
    } catch (value) {
      setError(value instanceof Error ? value.message : (ru ? "Не удалось загрузить настройки уведомлений." : "Bildirishnoma sozlamalarini yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }, [ru]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/platform/notification-preferences", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ preferences }),
      });
      const body = await response.json() as { preferences?: Preferences; error?: string };
      if (!response.ok || !body.preferences) throw new Error(body.error || (ru ? "Настройки не сохранены." : "Sozlamalar saqlanmadi."));
      setPreferences(body.preferences);
      setMessage(ru ? "Настройки уведомлений сохранены." : "Bildirishnoma sozlamalari saqlandi.");
    } catch (value) {
      setError(value instanceof Error ? value.message : (ru ? "Настройки не сохранены." : "Sozlamalar saqlanmadi."));
    } finally {
      setSaving(false);
    }
  }

  return <section className="notification-preferences-panel" aria-busy={loading || saving}>
    <h2><BellRing aria-hidden="true" />{ru ? "Email-уведомления" : "Email bildirishnomalari"}</h2>
    <p>{ru
      ? "Выберите только необязательные письма. Коды входа, сообщения о безопасности, доступе юриста, анализе и критических сроках остаются включёнными."
      : "Faqat ixtiyoriy xatlarni tanlang. Kirish kodlari, xavfsizlik, yurist ruxsati, tahlil va muhim muddatlar haqidagi xatlar yoqilgan holda qoladi."}</p>
    {loading ? <p className="notification-preferences-state" role="status"><LoaderCircle className="spin" aria-hidden="true" />{ru ? "Загрузка настроек…" : "Sozlamalar yuklanmoqda…"}</p> : <fieldset className="notification-preferences-list">
      <legend className="sr-only">{ru ? "Необязательные email-уведомления" : "Ixtiyoriy email bildirishnomalari"}</legend>
      {keys.map((key) => <label key={key}>
        <input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences(current => ({ ...current, [key]: event.target.checked }))} disabled={saving} />
        <span><strong>{copy[locale][key].title}</strong><small>{copy[locale][key].description}</small></span>
      </label>)}
    </fieldset>}
    {error && <p className="notification-preferences-state error" role="alert">{error}</p>}
    {message && <p className="notification-preferences-state success" role="status">{message}</p>}
    <button type="button" onClick={() => void save()} disabled={loading || saving} aria-busy={saving}>{saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}{ru ? "Сохранить уведомления" : "Bildirishnomalarni saqlash"}</button>
  </section>;
}
