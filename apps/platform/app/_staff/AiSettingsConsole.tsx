"use client";

import { RefreshCw, Save, Settings2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import type {
  AiResponseTone,
  AiRuntimeConfigHistoryRow,
  AiRuntimeModelAllowlist,
  AiRuntimeSettings,
} from "../../lib/ai/runtime-settings";
import { DEFAULT_AI_EXECUTION_BUDGET_MS } from "../../lib/ai/execution-budget";
import {
  aiReasoningModes,
  aiReasoningRuntimeRoute,
} from "../../lib/ai/reasoning-mode";

type Locale = "ru" | "uz";
type Dashboard = { current: AiRuntimeSettings; allowlist: AiRuntimeModelAllowlist; history: AiRuntimeConfigHistoryRow[] };
const copy = {
  ru: {
    title: "Настройки AI-моделей", description: "Версионируемые runtime-настройки. Доступны только модели из серверного allowlist; защищённые правила JURO не редактируются.",
    secure: "ADMIN · свежая 2FA", environment: "Среда", chat: "Чат-модель (Быстрый и Сбалансированный)", deep: "Модель глубокого анализа", anthropicChat: "Резерв чата", document: "Анализ документов", openaiDocument: "Резерв анализа", tone: "Тон ответа", clear: "Ясный", formal: "Формальный", concise: "Краткий", reason: "Причина изменения", save: "Создать версию", refresh: "Обновить", success: "Новая версия активна.", loading: "Загрузка…", history: "История версий", empty: "Версий в D1 пока нет — используются server variables.", protected: "Неизменяемые правила", protectedText: "Юрисдикция Узбекистана, allowlist источников, запрет вымышленных ссылок, tenant authorization, privacy, retention и prompt-injection защита остаются в коде.", version: "Версия", created: "Создана", hash: "Config hash", actor: "Автор",
    modesTitle: "Фактическая маршрутизация режимов", modesDescription: "Активная версия: пользовательский режим, provider, модель и жёсткие лимиты одного запроса.", modeNames: { fast: "Быстрый", balanced: "Сбалансированный", deep: "Глубокий" }, defaultMode: "По умолчанию", primary: "Основной маршрут", fallback: "Резерв", effort: "Reasoning effort", providerCap: "Лимит основной попытки", fallbackCap: "Лимит резервной попытки", firstContent: "Первый контент OpenAI", output: "Лимит output: кратко / подробно", sharedDeadline: "Все интерактивные режимы разделяют один абсолютный дедлайн {seconds} с; более длинный provider-лимит обрезается оставшимся бюджетом запроса.", effortNames: { low: "Низкий", medium: "Средний", high: "Высокий" }, seconds: "с", tokens: "токенов", historyChat: "Быстрый / Сбалансированный", historyDeep: "Глубокий", historyFallback: "Anthropic резерв",
  },
  uz: {
    title: "AI-modellar sozlamalari", description: "Versiyalangan runtime-sozlamalar. Faqat server allowlistidagi modellar tanlanadi; JUROning himoyalangan qoidalari tahrirlanmaydi.",
    secure: "ADMIN · yangi 2FA", environment: "Muhit", chat: "Chat modeli (Tezkor va Muvozanatli)", deep: "Chuqur tahlil modeli", anthropicChat: "Chat zaxirasi", document: "Hujjat tahlili", openaiDocument: "Tahlil zaxirasi", tone: "Javob ohangi", clear: "Aniq", formal: "Rasmiy", concise: "Qisqa", reason: "O‘zgartirish sababi", save: "Versiya yaratish", refresh: "Yangilash", success: "Yangi versiya faol.", loading: "Yuklanmoqda…", history: "Versiyalar tarixi", empty: "D1da versiya yo‘q — server variables ishlatilmoqda.", protected: "O‘zgarmas qoidalar", protectedText: "O‘zbekiston yurisdiksiyasi, manbalar allowlisti, soxta havolalarni taqiqlash, tenant authorization, maxfiylik, retention va prompt-injection himoyasi kodda qoladi.", version: "Versiya", created: "Yaratilgan", hash: "Config hash", actor: "Muallif",
    modesTitle: "Rejimlarning amaldagi marshruti", modesDescription: "Faol versiya: foydalanuvchi rejimi, provider, model va bitta so‘rovning qat’iy limitlari.", modeNames: { fast: "Tezkor", balanced: "Muvozanatli", deep: "Chuqur" }, defaultMode: "Standart", primary: "Asosiy marshrut", fallback: "Zaxira", effort: "Reasoning effort", providerCap: "Asosiy urinish limiti", fallbackCap: "Zaxira urinish limiti", firstContent: "OpenAI birinchi kontenti", output: "Output limiti: qisqa / batafsil", sharedDeadline: "Barcha interaktiv rejimlar bitta {seconds} soniyalik mutlaq deadline ichida ishlaydi; uzunroq provider limiti so‘rovning qolgan budjeti bilan cheklanadi.", effortNames: { low: "Past", medium: "O‘rta", high: "Yuqori" }, seconds: "soniya", tokens: "token", historyChat: "Tezkor / Muvozanatli", historyDeep: "Chuqur", historyFallback: "Anthropic zaxirasi",
  },
} as const;

async function post<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/platform/admin/ai-settings", {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", "x-juro-csrf": "1" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as T & { code?: string };
  if (!response.ok) throw new Error(payload.code || `HTTP ${response.status}`);
  return payload;
}

export function AiSettingsConsole({ locale, staffName }: { locale: Locale; staffName: string }) {
  const t = copy[locale];
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [form, setForm] = useState<AiRuntimeSettings | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const value = await post<Dashboard>({ action: "query" });
      setDashboard(value); setForm(value.current);
    } catch (value) { setError(value instanceof Error ? value.message : "REQUEST_FAILED"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const update = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!form || !dashboard) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await post({
        action: "update", expectedVersion: dashboard.current.version,
        openaiChatModel: form.openaiChatModel, openaiDeepModel: form.openaiDeepModel,
        anthropicChatFallbackModel: form.anthropicChatFallbackModel,
        anthropicDocumentModel: form.anthropicDocumentModel,
        openaiDocumentFallbackModel: form.openaiDocumentFallbackModel,
        responseTone: form.responseTone, reason,
      });
      setReason(""); setMessage(t.success); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "REQUEST_FAILED"); setBusy(false); }
  };
  const select = (field: keyof AiRuntimeSettings, values: string[], label: string) => <label>{label}<select value={String(form?.[field] ?? "")} onChange={(event) => setForm((current) => current ? { ...current, [field]: event.target.value } : current)}>{values.map((value) => <option key={value}>{value}</option>)}</select></label>;
  const formatSeconds = (milliseconds: number) => new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 1 }).format(milliseconds / 1_000);
  return <div className="staff-console ai-settings-console">
    <a className="staff-skip" href="#ai-settings-main">{locale === "ru" ? "К настройкам" : "Sozlamalarga o‘tish"}</a>
    <header className="staff-topbar"><div className="staff-brand"><Settings2 aria-hidden="true"/><span><b>JURO</b><small>AI SETTINGS</small></span></div><div className="staff-session"><span>{t.secure}</span><b>{staffName}</b></div><a href={`/${locale === "ru" ? "uz" : "ru"}/admin/ai-settings`} hrefLang={locale === "ru" ? "uz" : "ru"}>{locale === "ru" ? "UZ" : "RU"}</a></header>
    <main id="ai-settings-main" className="staff-main ai-settings-main">
      <section className="staff-heading"><div><span>JURO · {dashboard?.current.environment ?? "—"}</span><h1>{t.title}</h1><p>{t.description}</p></div><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw aria-hidden="true"/>{t.refresh}</button></section>
      <div aria-live="polite">{error && <p className="staff-error" role="alert">{error}</p>}{message && <p className="staff-verified"><ShieldCheck aria-hidden="true"/>{message}</p>}</div>
      {!dashboard || !form ? <p className="staff-loading" role="status">{t.loading}</p> : <>
        <section className="ai-settings-protected"><ShieldCheck aria-hidden="true"/><div><h2>{t.protected}</h2><p>{t.protectedText}</p></div></section>
        <section className="ai-settings-modes" aria-labelledby="ai-settings-modes-title">
          <header><div><h2 id="ai-settings-modes-title">{t.modesTitle}</h2><p>{t.modesDescription}</p></div></header>
          <div className="ai-settings-mode-grid">{aiReasoningModes.map((mode) => {
            const route = aiReasoningRuntimeRoute(dashboard.current, mode);
            const profile = route.profile;
            return <article className="ai-settings-mode-card" data-reasoning-mode={mode} data-default={route.isDefault ? "true" : "false"} key={mode}>
              <header><h3>{t.modeNames[mode]}</h3>{route.isDefault && <strong>{t.defaultMode}</strong>}</header>
              <dl>
                <div><dt>{t.primary}</dt><dd><b>{route.primaryProvider === "openai" ? "OpenAI" : route.primaryProvider}</b><code>{route.primaryModel}</code></dd></div>
                <div><dt>{t.fallback}</dt><dd><b>{route.fallbackProvider === "anthropic" ? "Anthropic" : route.fallbackProvider}</b><code>{route.fallbackModel}</code></dd></div>
                <div><dt>{t.effort}</dt><dd>{t.effortNames[profile.openAiReasoningEffort]}</dd></div>
                <div><dt>{t.providerCap}</dt><dd>{formatSeconds(profile.providerTimeoutMs)} {t.seconds}</dd></div>
                <div><dt>{t.fallbackCap}</dt><dd>{formatSeconds(profile.fallbackTimeoutMs)} {t.seconds}</dd></div>
                <div><dt>{t.firstContent}</dt><dd>{formatSeconds(profile.firstContentTimeoutMs)} {t.seconds}</dd></div>
                <div><dt>{t.output}</dt><dd>{profile.maxOutputTokens.short} / {profile.maxOutputTokens.detailed} {t.tokens}</dd></div>
              </dl>
            </article>;
          })}</div>
          <p className="ai-settings-shared-deadline">{t.sharedDeadline.replace("{seconds}", formatSeconds(DEFAULT_AI_EXECUTION_BUDGET_MS))}</p>
        </section>
        <form className="staff-decision ai-settings-form" onSubmit={(event) => void update(event)}>
          <div className="ai-settings-grid">
            {select("openaiChatModel", dashboard.allowlist.openai, t.chat)}
            {select("openaiDeepModel", dashboard.allowlist.openai, t.deep)}
            {select("anthropicChatFallbackModel", dashboard.allowlist.anthropic, t.anthropicChat)}
            {select("anthropicDocumentModel", dashboard.allowlist.anthropic, t.document)}
            {select("openaiDocumentFallbackModel", dashboard.allowlist.openai, t.openaiDocument)}
            <label>{t.tone}<select value={form.responseTone} onChange={(event) => setForm({ ...form, responseTone: event.target.value as AiResponseTone })}><option value="clear">{t.clear}</option><option value="formal">{t.formal}</option><option value="concise">{t.concise}</option></select></label>
          </div>
          <label>{t.reason}<textarea required minLength={10} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)}/></label>
          <button className="staff-approve" type="submit" disabled={busy || reason.trim().length < 10}><Save aria-hidden="true"/>{t.save}</button>
        </form>
        <section className="feature-history"><h2>{t.history}</h2>{dashboard.history.length === 0 ? <div className="staff-empty"><p>{t.empty}</p></div> : dashboard.history.map((row) => <article className="ai-settings-history" key={row.id}><b>{t.version} {row.version}</b><span><span>{t.historyChat}: <code>{row.openaiChatModel}</code></span><span>{t.historyDeep}: <code>{row.openaiDeepModel}</code></span><span>{t.historyFallback}: <code>{row.anthropicChatFallbackModel}</code></span><small>{row.reason}</small></span><code title={row.configHash}>{row.configHash.slice(0, 16)}…</code><time>{new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(row.createdAt))}</time></article>)}</section>
      </>}
    </main>
  </div>;
}
