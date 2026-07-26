"use client";

import { CircleAlert, LoaderCircle, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function InviteAcceptClient({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function accept() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/platform/team/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json", "x-juro-csrf": "1" },
      body: JSON.stringify({ token }),
    });
    const body = await response.json() as { error?: string; redirectTo?: string };
    if (!response.ok) { setError(body.error || "Приглашение не принято."); setLoading(false); return; }
    router.replace(body.redirectTo || "/main");
  }
  return <main className="invite-accept"><section><UsersRound /><small>JURO · TEAM</small><h1>Присоединиться к рабочему пространству</h1><p>JURO проверит одноразовый токен, срок действия и совпадение email вашего аккаунта. Доступ будет выдан только после подтверждения.</p>{error && <div role="alert"><CircleAlert />{error}</div>}<button onClick={() => void accept()} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <UsersRound />}Принять приглашение</button></section></main>;
}
