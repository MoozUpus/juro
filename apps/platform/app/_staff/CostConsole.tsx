"use client";

import { BarChart3, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AiCostDashboard } from "../../lib/ai/provider-usage";

type Locale = "ru" | "uz";

const copy = {
  ru: { title: "Стоимость и использование AI", eyebrow: "Операционная наблюдаемость", secure: "Защищённая рабочая зона", fresh: "Недавняя 2FA", refresh: "Обновить", unpriced: "Вызовы без цены", prices: "Версии цен", usage: "Дневное использование", add: "Добавить версию цены", provider: "Провайдер", model: "Модель", operation: "Операция", inputRate: "Input, µUSD / 1 млн токенов", outputRate: "Output, µUSD / 1 млн токенов", cachedRate: "Cached input, µUSD / 1 млн", effective: "Действует с", source: "Официальный URL цены", save: "Сохранить неизменяемую версию", date: "Дата", feature: "Функция", requests: "Запросы", failures: "Ошибки", tokens: "Токены", cost: "Оценка, USD", noData: "Данных пока нет", success: "Версия цены добавлена" },
  uz: { title: "AI xarajati va foydalanish", eyebrow: "Operatsion kuzatuv", secure: "Himoyalangan ish maydoni", fresh: "Yaqindagi 2FA", refresh: "Yangilash", unpriced: "Narxsiz chaqiruvlar", prices: "Narx versiyalari", usage: "Kunlik foydalanish", add: "Narx versiyasini qo‘shish", provider: "Provayder", model: "Model", operation: "Operatsiya", inputRate: "Input, µUSD / 1 mln token", outputRate: "Output, µUSD / 1 mln token", cachedRate: "Cached input, µUSD / 1 mln", effective: "Amal qilish vaqti", source: "Rasmiy narx URL manzili", save: "O‘zgarmas versiyani saqlash", date: "Sana", feature: "Funksiya", requests: "So‘rovlar", failures: "Xatolar", tokens: "Tokenlar", cost: "Baholash, USD", noData: "Hozircha ma’lumot yo‘q", success: "Narx versiyasi qo‘shildi" },
} as const;

function usd(microusd: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(microusd / 1_000_000);
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { code?: string };
  if (!response.ok) throw new Error(body.code || `HTTP_${response.status}`);
  return body;
}

export function CostConsole({ locale, staffName, initial }: { locale: Locale; staffName: string; initial: AiCostDashboard }) {
  const t = copy[locale];
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    setBusy(true);
    try {
      setData(await json<AiCostDashboard>(await fetch("/api/platform/admin/costs", { cache: "no-store" })));
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "ERROR");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setNotice("");
    try {
      await json(await fetch("/api/platform/admin/costs", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({
          provider: form.get("provider"), model: form.get("model"), operation: form.get("operation"),
          inputMicrousdPerMillionTokens: Number(form.get("inputRate")),
          outputMicrousdPerMillionTokens: Number(form.get("outputRate")),
          cachedInputMicrousdPerMillionTokens: Number(form.get("cachedRate")),
          effectiveFrom: new Date(String(form.get("effectiveFrom"))).toISOString(),
          sourceUrl: String(form.get("sourceUrl") || "") || null,
        }),
      }));
      formElement.reset();
      setNotice(t.success);
      setError("");
      setData(await json<AiCostDashboard>(await fetch("/api/platform/admin/costs", { cache: "no-store" })));
    } catch (value) {
      setError(value instanceof Error ? value.message : "ERROR");
    } finally {
      setBusy(false);
    }
  }

  return <div className="staff-console cost-console" aria-busy={busy}>
    <header className="staff-topbar"><div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>{t.secure}</small></span></div><div className="staff-session"><span>{t.fresh}</span><b>{staffName}</b></div></header>
    <main className="staff-main" id="main-content">
      <section className="staff-heading"><div><p>{t.eyebrow}</p><h1>{t.title}</h1></div><button type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw aria-hidden="true"/>{t.refresh}</button></section>
      <div className="cost-summary" role="status"><BarChart3 aria-hidden="true"/><span>{t.unpriced}</span><b>{data.unpricedEvents}</b></div>
      {error && <p className="staff-error" role="alert">{error}</p>}{notice && <p className="cost-success" role="status">{notice}</p>}
      <section className="cost-layout">
        <form className="cost-price-form" onSubmit={(event) => void submit(event)}>
          <h2><Plus aria-hidden="true"/>{t.add}</h2>
          <label>{t.provider}<select name="provider" defaultValue="openai"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label>
          <label>{t.model}<input name="model" defaultValue="text-embedding-3-large" required maxLength={120}/></label>
          <label>{t.operation}<input name="operation" defaultValue="embeddings" required pattern="[a-z0-9._-]+" maxLength={64}/></label>
          <label>{t.inputRate}<input name="inputRate" type="number" min="0" step="1" required/></label>
          <label>{t.outputRate}<input name="outputRate" type="number" min="0" step="1" defaultValue="0" required/></label>
          <label>{t.cachedRate}<input name="cachedRate" type="number" min="0" step="1" defaultValue="0" required/></label>
          <label>{t.effective}<input name="effectiveFrom" type="datetime-local" required/></label>
          <label>{t.source}<input name="sourceUrl" type="url" inputMode="url" placeholder="https://openai.com/api/pricing/"/></label>
          <button className="staff-approve" disabled={busy}><Plus aria-hidden="true"/>{t.save}</button>
        </form>
        <section className="cost-prices" aria-labelledby="cost-prices-title"><h2 id="cost-prices-title">{t.prices}</h2>{data.prices.length ? <div className="cost-table-wrap"><table><thead><tr><th>{t.provider}</th><th>{t.model}</th><th>{t.operation}</th><th>{t.inputRate}</th><th>{t.effective}</th></tr></thead><tbody>{data.prices.map((price) => <tr key={price.id}><td>{price.provider}</td><td><code>{price.model}</code></td><td>{price.operation}</td><td>{price.inputMicrousdPerMillionTokens.toLocaleString("en-US")}</td><td><time dateTime={price.effectiveFrom}>{new Date(price.effectiveFrom).toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ")}</time></td></tr>)}</tbody></table></div> : <p className="staff-empty">{t.noData}</p>}</section>
      </section>
      <section className="cost-usage" aria-labelledby="cost-usage-title"><h2 id="cost-usage-title">{t.usage}</h2>{data.daily.length ? <div className="cost-table-wrap"><table><thead><tr><th>{t.date}</th><th>{t.feature}</th><th>{t.provider}</th><th>{t.model}</th><th>{t.requests}</th><th>{t.failures}</th><th>{t.tokens}</th><th>{t.cost}</th></tr></thead><tbody>{data.daily.map((row) => <tr key={`${row.usageDay}:${row.feature}:${row.provider}:${row.model}`}><td>{row.usageDay}</td><td>{row.feature}</td><td>{row.provider}</td><td><code>{row.model}</code></td><td>{row.requestCount}</td><td>{row.failedRequestCount}</td><td>{row.inputTokens + row.outputTokens}</td><td>{usd(row.estimatedCostMicrousd)}{row.unpricedRequestCount > 0 ? ` · ${t.unpriced}: ${row.unpricedRequestCount}` : ""}</td></tr>)}</tbody></table></div> : <p className="staff-empty">{t.noData}</p>}</section>
    </main>
  </div>;
}
