"use client";

import { CircleAlert, LoaderCircle, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type InviteState = "idle" | "accepting" | "accepted" | "error";

const copy = {
  ru: {
    eyebrow: "JURO · КОМАНДА",
    title: "Присоединиться к рабочему пространству",
    description: "JURO проверит одноразовый токен, срок действия и совпадение email вашего аккаунта. Доступ будет выдан только после подтверждения.",
    idle: "Приглашение готово к подтверждению.",
    accepting: "Проверяем приглашение и добавляем вас в пространство…",
    accepted: "Приглашение принято. Открываем рабочее пространство…",
    button: "Принять приглашение",
    fallbackError: "Приглашение не принято.",
    networkError: "Не удалось проверить приглашение. Проверьте соединение и повторите попытку.",
  },
  uz: {
    eyebrow: "JURO · JAMOA",
    title: "Ish makoniga qo‘shilish",
    description: "JURO bir martalik tokenni, uning amal qilish muddatini va hisobingiz email manzili mosligini tekshiradi. Kirish faqat tasdiqlaganingizdan keyin beriladi.",
    idle: "Taklif tasdiqlashga tayyor.",
    accepting: "Taklif tekshirilmoqda va siz makonga qo‘shilmoqdasiz…",
    accepted: "Taklif qabul qilindi. Ish makoni ochilmoqda…",
    button: "Taklifni qabul qilish",
    fallbackError: "Taklif qabul qilinmadi.",
    networkError: "Taklifni tekshirib bo‘lmadi. Ulanishni tekshirib, qayta urinib ko‘ring.",
  },
} as const;

export function InviteAcceptClient({
  token,
  locale,
}: {
  token: string;
  locale: "ru" | "uz";
}) {
  const router = useRouter();
  const [state, setState] = useState<InviteState>("idle");
  const [error, setError] = useState("");
  const text = copy[locale];

  async function accept() {
    setState("accepting");
    setError("");
    try {
      const response = await fetch(
        `/api/platform/team/invitations/accept?lang=${locale}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-juro-csrf": "1",
          },
          body: JSON.stringify({ token, locale }),
        },
      );
      const body = await response.json() as {
        error?: string;
        redirectTo?: string;
      };
      if (!response.ok) {
        setError(body.error || text.fallbackError);
        setState("error");
        return;
      }
      setState("accepted");
      router.replace(body.redirectTo || `/${locale}/individual/main`);
    } catch {
      setError(text.networkError);
      setState("error");
    }
  }

  const statusText = state === "accepting"
    ? text.accepting
    : state === "accepted"
      ? text.accepted
      : text.idle;

  return (
    <main className="invite-accept" lang={locale}>
      <section aria-busy={state === "accepting"}>
        <UsersRound />
        <small>{text.eyebrow}</small>
        <h1>{text.title}</h1>
        <p>{text.description}</p>
        {error
          ? <div className="invite-status error" role="alert"><CircleAlert />{error}</div>
          : <div className={`invite-status ${state}`} aria-live="polite">{statusText}</div>}
        <button
          onClick={() => void accept()}
          disabled={state === "accepting" || state === "accepted"}
        >
          {state === "accepting"
            ? <LoaderCircle className="spin" />
            : <UsersRound />}
          {state === "accepted" ? text.accepted : text.button}
        </button>
      </section>
    </main>
  );
}
