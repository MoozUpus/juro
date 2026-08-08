"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { ArrowRight, FileCheck2, LockKeyhole } from "lucide-react";

export function SignedShareAccessClient({ token }: { token: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const target = window.open("about:blank", "_blank");
    setLoading(true);
    try {
      const response = await fetch(`/api/document-builder/standalone-signed-shares/${token}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json() as { viewerUrl?: string; error?: string };
      if (!response.ok || !data.viewerUrl) {
        target?.close();
        setError(data.error || "Доступ запрещён");
        return;
      }
      if (target) target.location.href = data.viewerUrl;
      else window.open(data.viewerUrl, "_blank", "noopener,noreferrer");
    } catch {
      target?.close();
      setError("Не удалось проверить код. Повторите попытку.");
    } finally {
      setLoading(false);
    }
  };
  return <main className="dbt-signed-access">
    <section>
      <Image src="/juro-logo-primary.png" alt="JURO" width={125} height={122} unoptimized/>
      <span className="dbt-access-icon"><FileCheck2 size={30}/></span>
      <h1>Подписанный документ</h1>
      <p>Введите четырёхзначный код доступа, который сообщил владелец файла.</p>
      <form onSubmit={submit}>
        <label htmlFor="access-code">Код доступа</label>
        <div className="dbt-code-input"><LockKeyhole size={19}/><input id="access-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" maxLength={4} aria-describedby={error ? "access-error" : undefined}/></div>
        {error && <p id="access-error" className="dbt-form-error" role="alert">{error}</p>}
        <button type="submit" disabled={loading || code.length !== 4}>{loading ? "Проверяем…" : "Подтвердить"}<ArrowRight size={18}/></button>
      </form>
    </section>
  </main>;
}
