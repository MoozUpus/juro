"use client";

import { Check, Crown, LoaderCircle, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Locale = "ru" | "uz";
type Profile = {
  id: string;
  displayName: string;
  juroApprovalStatus: "approved" | "not_approved";
  topLawyerStatus: "featured" | "not_featured";
  topLawyerCriteria: string | null;
};

async function body<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new Error(value.error || value.code || `HTTP ${response.status}`);
  return value;
}

/** Controls are embedded in the existing lawyer moderation page, rather than a
 * parallel catalogue, so a designation can be issued only after publication. */
export function LawyerTrustDesignationPanel({ locale }: { locale: Locale }) {
  const ru = locale === "ru";
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [designation, setDesignation] = useState<"juro_approval" | "top_lawyer">("juro_approval");
  const [decision, setDecision] = useState<"approved" | "revoked">("approved");
  const [reason, setReason] = useState("");
  const [criteria, setCriteria] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const value = await body<{ profiles: Profile[] }>(await fetch("/api/platform/admin/lawyer-profiles?status=public_approved&limit=100", { cache: "no-store" }));
      setProfiles(value.profiles);
      setProfileId((current) => current || value.profiles[0]?.id || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const selected = profiles.find((profile) => profile.id === profileId);
  function preset(profile: Profile | undefined, nextDesignation: "juro_approval" | "top_lawyer") {
    if (!profile) return;
    setDesignation(nextDesignation);
    setDecision(nextDesignation === "juro_approval"
      ? profile.juroApprovalStatus === "approved" ? "revoked" : "approved"
      : profile.topLawyerStatus === "featured" ? "revoked" : "approved");
    setCriteria(nextDesignation === "top_lawyer" ? profile.topLawyerCriteria ?? "" : "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileId || !reason.trim() || busy) return;
    if (designation === "top_lawyer" && decision === "approved" && criteria.trim().length < 20) {
      setError(ru ? "Укажите публичные критерии Top Lawyer (минимум 20 символов)." : "Top yuristning ochiq mezonlarini kiriting (kamida 20 belgi).");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      await body(await fetch(`/api/platform/admin/lawyer-profiles/${encodeURIComponent(profileId)}/designation`, {
        method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ designation, decision, reason: reason.trim(), ...(designation === "top_lawyer" && decision === "approved" ? { criteria: criteria.trim() } : {}) }),
      }));
      setNotice(ru ? "Статус сохранён в неизменяемом журнале." : "Maqom o‘zgarmas jurnalga saqlandi.");
      setReason("");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  return <section className="staff-decision lawyer-trust-designation" aria-labelledby="lawyer-trust-designation-title">
    <header><div><small>JURO · TRUST DESIGNATIONS</small><h2 id="lawyer-trust-designation-title">{ru ? "Статусы доверия" : "Ishonch maqomlari"}</h2><p>{ru ? "Публикация, «Одобрен JURO» и Top Lawyer — отдельные решения. Top Lawyer получает публичные критерии." : "Nashr, «JURO tomonidan ma’qullangan» va Top yurist alohida qarorlardir. Top yurist uchun ochiq mezonlar ko‘rsatiladi."}</p></div><button type="button" onClick={() => void load()} disabled={busy}>{busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{ru ? "Обновить" : "Yangilash"}</button></header>
    {!profiles.length && !error && <p role="status">{ru ? "Нет опубликованных профилей для отдельного статуса." : "Alohida maqom uchun nashr qilingan profillar yo‘q."}</p>}
    {error && <p className="staff-error" role="alert">{error}</p>}{notice && <p className="staff-verified" role="status"><Check aria-hidden="true" />{notice}</p>}
    {profiles.length > 0 && <form onSubmit={(event) => void submit(event)}>
      <label>{ru ? "Юрист" : "Yurist"}<select value={profileId} onChange={(event) => { const next = profiles.find((profile) => profile.id === event.target.value); setProfileId(event.target.value); preset(next, designation); }}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>
      <label>{ru ? "Статус" : "Maqom"}<select value={designation} onChange={(event) => preset(selected, event.target.value as "juro_approval" | "top_lawyer")}><option value="juro_approval">{ru ? "Одобрен JURO" : "JURO tomonidan ma’qullangan"}</option><option value="top_lawyer">Top Lawyer</option></select></label>
      <label>{ru ? "Решение" : "Qaror"}<select value={decision} onChange={(event) => setDecision(event.target.value as "approved" | "revoked")}><option value="approved">{ru ? "Присвоить" : "Berish"}</option><option value="revoked">{ru ? "Снять" : "Bekor qilish"}</option></select></label>
      {designation === "top_lawyer" && decision === "approved" && <label>{ru ? "Публичные критерии Top Lawyer" : "Top yuristning ochiq mezonlari"}<textarea required minLength={20} maxLength={1200} value={criteria} onChange={(event) => setCriteria(event.target.value)} /></label>}
      <label>{ru ? "Основание решения" : "Qaror asosi"}<textarea required minLength={1} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button className="staff-approve" disabled={busy || !reason.trim()}>{busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : designation === "top_lawyer" ? <Crown aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{ru ? "Сохранить статус" : "Maqomni saqlash"}</button>
    </form>}
  </section>;
}
