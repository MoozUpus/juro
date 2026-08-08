"use client";

import { CircleAlert, LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { caseScenariosForAccount } from "../../lib/platform/case-create";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

export function CaseCreateClient({ locale, accountType }: { locale: PlatformLocale; accountType: AccountType }) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const router = useRouter();
  const scenarios = caseScenariosForAccount(accountType);
  const [selected, setSelected] = useState(scenarios[0].id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/platform/cases", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ title, description, legalArea: selected, locale, accountType }),
      });
      const body = await response.json() as { caseId?: string; error?: string };
      if (!response.ok || !body.caseId) {
        throw new Error(body.error || (ru ? "Не удалось создать дело." : "Ishni yaratib bo‘lmadi."));
      }
      router.replace(`${base}/cases/${encodeURIComponent(body.caseId)}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
      setSubmitting(false);
    }
  }

  return (
    <section className="case-create">
      <header>
        <div>
          <small>JURO · {ru ? "Новое дело" : "Yangi ish"}</small>
          <h1>{ru ? "Соберите ситуацию в управляемое дело" : "Vaziyatni boshqariladigan ishga aylantiring"}</h1>
          <p>{ru ? "После создания JURO добавит проверяемый стартовый план. Никакие задачи не будут назначены без вашего подтверждения." : "Yaratilgandan so‘ng JURO tekshiriladigan boshlang‘ich reja qo‘shadi. Siz tasdiqlamaguningizcha vazifalar tayinlanmaydi."}</p>
        </div>
        <ShieldCheck aria-hidden="true" />
      </header>

      <form onSubmit={submit} aria-describedby="case-create-note">
        <fieldset>
          <legend>{ru ? "Выберите тип ситуации" : "Vaziyat turini tanlang"}</legend>
          <div className="case-create-scenarios">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                aria-pressed={selected === scenario.id}
                onClick={() => setSelected(scenario.id)}
              >
                {scenario[locale]}
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          <span>{ru ? "Название дела" : "Ish nomi"}</span>
          <input
            autoFocus
            required
            maxLength={180}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={ru ? "Например: возврат долга по расписке" : "Masalan: tilxat bo‘yicha qarzni qaytarish"}
          />
        </label>

        <label>
          <span>{ru ? "Краткое описание" : "Qisqa tavsif"}</span>
          <textarea
            rows={5}
            maxLength={2_000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={ru ? "Что произошло, когда и какой результат вам нужен" : "Nima bo‘ldi, qachon va qanday natija kerak"}
          />
        </label>

        <p id="case-create-note">{ru ? "Дело и первая версия плана сохраняются вместе. При ошибке не будет создана частичная запись." : "Ish va rejaning birinchi versiyasi birga saqlanadi. Xatoda qisman yozuv yaratilmaydi."}</p>
        {error && <p className="case-create-error" role="alert"><CircleAlert />{error}</p>}
        <div className="case-create-actions">
          <button type="button" onClick={() => router.push(`${base}/cases`)}>{ru ? "Отмена" : "Bekor qilish"}</button>
          <button type="submit" disabled={submitting}>
            {submitting ? <LoaderCircle className="spin" /> : <Plus />}
            {submitting ? (ru ? "Создаём…" : "Yaratilmoqda…") : (ru ? "Создать дело" : "Ish yaratish")}
          </button>
        </div>
      </form>
    </section>
  );
}
