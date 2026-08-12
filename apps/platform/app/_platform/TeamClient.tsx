"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated team data is hydrated after the first browser render */

import { CircleAlert, LoaderCircle, MailPlus, ShieldCheck, Trash2, UserRound, UsersRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatPlatformDate } from "../../lib/platform/date-time";
import type { PlatformLocale } from "../../lib/platform/routing";

type Member = { id: string; userId: string; role: string; status: string; joinedAt: string; fullName: string | null; email: string };
type Invitation = { id: string; email: string | null; role: string; expiresAt: string; createdAt: string };
type TeamData = {
  workspace: { id: string; name: string; type: string; locale: string } | null;
  currentRole: string;
  members: Member[];
  invitations: Invitation[];
};

const roles = ["admin", "lawyer", "employee", "viewer", "external"] as const;

export function TeamClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>("employee");
  const canManage = data?.currentRole === "owner" || data?.currentRole === "admin";

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/platform/team", { cache: "no-store" });
      const body = await response.json() as TeamData & { error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Не удалось загрузить команду." : "Jamoani yuklab bo‘lmadi."));
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ru]);

  useEffect(() => { void load(); }, [load]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/platform/team", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ email, role, locale }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Приглашение не отправлено." : "Taklif yuborilmadi."));
      setEmail("");
      setNotice(ru ? "Приглашение отправлено. Оно действует 7 дней." : "Taklif yuborildi. U 7 kun amal qiladi.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(memberId: string, nextRole: string) {
    setError("");
    const response = await fetch(`/api/platform/team/members/${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-juro-csrf": "1" },
      body: JSON.stringify({ role: nextRole }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) { setError(body.error || (ru ? "Роль не изменена." : "Rol o‘zgartirilmadi.")); return; }
    await load();
  }

  async function removeMember(memberId: string) {
    if (!window.confirm(ru ? "Удалить участника из пространства?" : "Ishtirokchini makondan olib tashlaysizmi?")) return;
    const response = await fetch(`/api/platform/team/members/${encodeURIComponent(memberId)}`, { method: "DELETE", headers: { "x-juro-csrf": "1" } });
    const body = await response.json() as { error?: string };
    if (!response.ok) { setError(body.error || (ru ? "Участник не удалён." : "Ishtirokchi olib tashlanmadi.")); return; }
    await load();
  }

  async function revokeInvitation(invitationId: string) {
    const response = await fetch(`/api/platform/team/invitations/${encodeURIComponent(invitationId)}`, { method: "DELETE", headers: { "x-juro-csrf": "1" } });
    const body = await response.json() as { error?: string };
    if (!response.ok) { setError(body.error || (ru ? "Приглашение не отозвано." : "Taklif bekor qilinmadi.")); return; }
    await load();
  }

  if (loading && !data) return <div className="team-loading"><LoaderCircle className="spin" /></div>;
  return (
    <section className="team-workspace">
      <header><UsersRound /><div><small>JURO · {ru ? "Команда" : "Jamoa"}</small><h1>{data?.workspace?.name || (ru ? "Рабочее пространство" : "Ish makoni")}</h1><p>{ru ? "Роли и доступ проверяются сервером. Скрытие кнопки не является механизмом защиты." : "Rollar va kirish serverda tekshiriladi. Tugmani yashirish himoya mexanizmi emas."}</p></div></header>
      {error && <p className="team-message error" role="alert"><CircleAlert />{error}</p>}
      {notice && <p className="team-message success" role="status"><ShieldCheck />{notice}</p>}
      {canManage && (
        <form className="team-invite" onSubmit={invite}>
          <div><MailPlus /><div><h2>{ru ? "Пригласить участника" : "Ishtirokchini taklif qilish"}</h2><p>{ru ? "Письмо уйдёт через настроенный почтовый провайдер. Ложного success-состояния нет." : "Xat sozlangan pochta provayderi orqali yuboriladi. Soxta muvaffaqiyat holati yo‘q."}</p></div></div>
          <label><span>Email</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@company.uz" /></label>
          <label><span>{ru ? "Роль" : "Rol"}</span><select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>{roles.map((item) => <option key={item} value={item}>{roleLabel(item, ru)}</option>)}</select></label>
          <button disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <MailPlus />}{ru ? "Отправить приглашение" : "Taklif yuborish"}</button>
        </form>
      )}
      <div className="team-grid">
        <article><div className="team-title"><h2>{ru ? "Участники" : "Ishtirokchilar"}</h2><span>{data?.members.length ?? 0}</span></div><div className="team-list">{data?.members.map((member) => <div key={member.id}><span className="team-avatar"><UserRound /></span><div><strong>{member.fullName || member.email}</strong><small>{member.email}</small></div>{canManage && member.role !== "owner" ? <select aria-label={ru ? `Роль ${member.fullName || member.email}` : `${member.fullName || member.email} roli`} value={member.role} onChange={(event) => void changeRole(member.id, event.target.value)}>{roles.map((item) => <option key={item} value={item}>{roleLabel(item, ru)}</option>)}</select> : <span className="team-role">{roleLabel(member.role, ru)}</span>}{canManage && member.role !== "owner" && <button className="team-remove" onClick={() => void removeMember(member.id)} aria-label={ru ? "Удалить участника" : "Ishtirokchini olib tashlash"}><Trash2 /></button>}</div>)}</div></article>
        <article><div className="team-title"><h2>{ru ? "Ожидают ответа" : "Javob kutilmoqda"}</h2><span>{data?.invitations.length ?? 0}</span></div>{data?.invitations.length ? <div className="team-list">{data.invitations.map((invitation) => <div key={invitation.id}><span className="team-avatar"><MailPlus /></span><div><strong>{invitation.email || (ru ? "Скрытый email" : "Yashirin email")}</strong><small>{roleLabel(invitation.role, ru)} · {formatDate(invitation.expiresAt, ru)}</small></div>{canManage && <button className="team-remove" onClick={() => void revokeInvitation(invitation.id)} aria-label={ru ? "Отозвать приглашение" : "Taklifni bekor qilish"}><Trash2 /></button>}</div>)}</div> : <p className="team-empty">{ru ? "Активных приглашений нет." : "Faol takliflar yo‘q."}</p>}</article>
      </div>
    </section>
  );
}

function roleLabel(role: string, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    owner: ["Владелец", "Egasi"], admin: ["Администратор", "Administrator"], lawyer: ["Юрист", "Yurist"],
    employee: ["Сотрудник", "Xodim"], viewer: ["Наблюдатель", "Kuzatuvchi"], external: ["Внешний участник", "Tashqi ishtirokchi"],
  };
  return labels[role]?.[ru ? 0 : 1] ?? role;
}

function formatDate(value: string, ru: boolean) {
  return formatPlatformDate(value, ru ? "ru" : "uz");
}
