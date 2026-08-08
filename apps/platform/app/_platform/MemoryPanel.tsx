"use client";

import { Brain, CircleAlert, LoaderCircle, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import type { PlatformLocale } from "../../lib/platform/routing";

type Category = "profile_name" | "language" | "company" | "answer_style" | "user_instruction" | "counterparty" | "legal_context" | "typical_requisite";
type Memory = {
  id: string;
  category: Category;
  statement: string;
  scope: "global" | "workspace";
  workspaceId: string | null;
  sourceKind: "manual" | "automatic" | "profile";
  source: { type: "manual" | "chat" | "profile"; savedAt: string } | null;
  createdAt: string;
  updatedAt: string;
};

type MemoryResponse = {
  available: boolean;
  settings: { automaticEnabled: boolean };
  memories: Memory[];
  code?: string;
  error?: string;
};

const categories: Category[] = [
  "profile_name",
  "language",
  "company",
  "answer_style",
  "user_instruction",
  "counterparty",
  "legal_context",
  "typical_requisite",
];

export function MemoryPanel({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [data, setData] = useState<MemoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { category: Category; statement: string; confirmSensitive: boolean }>>({});
  const [create, setCreate] = useState<{ category: Category; statement: string; scope: "global" | "workspace"; confirmSensitive: boolean }>({
    category: "user_instruction",
    statement: "",
    scope: "global",
    confirmSensitive: false,
  });
  const [clearArmed, setClearArmed] = useState(false);

  const requestMemory = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/platform/ai/memory?locale=${locale}`, {
      cache: "no-store",
      signal,
    });
    const body = await response.json() as MemoryResponse;
    if (!response.ok) {
      throw new Error(body.error || (ru ? "Память не загрузилась." : "Xotira yuklanmadi."));
    }
    return body;
  }, [locale, ru]);

  const load = useCallback(async () => {
    try {
      const body = await requestMemory();
      setData(body);
      setDrafts(draftsFor(body.memories));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [requestMemory]);

  useEffect(() => {
    const controller = new AbortController();
    requestMemory(controller.signal).then((body) => {
      setData(body);
      setDrafts(draftsFor(body.memories));
    }).catch((value: unknown) => {
      if (value instanceof DOMException && value.name === "AbortError") return;
      setError(value instanceof Error ? value.message : String(value));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [requestMemory]);

  async function mutate(body: Record<string, unknown>, busyId: string) {
    setBusy(busyId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/platform/ai/memory", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ ...body, locale }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || (ru ? "Память не изменена." : "Xotira o‘zgartirilmadi."));
      setNotice(ru ? "Настройки памяти обновлены." : "Xotira sozlamalari yangilandi.");
      await load();
      return true;
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createMemory(event: FormEvent) {
    event.preventDefault();
    const saved = await mutate({ action: "create", ...create }, "create");
    if (saved) setCreate(current => ({ ...current, statement: "", confirmSensitive: false }));
  }

  async function updateMemory(memory: Memory) {
    const draft = drafts[memory.id];
    if (!draft) return;
    await mutate({
      action: "update",
      memoryId: memory.id,
      category: draft.category,
      statement: draft.statement,
      confirmSensitive: draft.confirmSensitive,
    }, memory.id);
  }

  if (loading) {
    return <section className="memory-panel" aria-labelledby="memory-heading">
      <h2 id="memory-heading"><Brain aria-hidden="true" />{ru ? "Память JURO" : "JURO xotirasi"}</h2>
      <p role="status"><LoaderCircle className="spin" aria-hidden="true" />{ru ? "Загрузка памяти…" : "Xotira yuklanmoqda…"}</p>
    </section>;
  }

  return <section className="memory-panel" aria-labelledby="memory-heading">
    <div className="memory-panel-heading">
      <div>
        <h2 id="memory-heading"><Brain aria-hidden="true" />{ru ? "Память JURO" : "JURO xotirasi"}</h2>
        <p>{ru
          ? "JURO может учитывать только сохранённые здесь устойчивые факты и предпочтения. Пароли, коды и платёжные данные не сохраняются."
          : "JURO faqat shu yerda saqlangan barqaror ma’lumot va afzalliklarni hisobga oladi. Parollar, kodlar va to‘lov ma’lumotlari saqlanmaydi."}</p>
      </div>
      {data && <label className="memory-toggle">
        <input
          type="checkbox"
          checked={data.settings.automaticEnabled}
          disabled={Boolean(busy)}
          onChange={(event) => void mutate({ action: "settings", automaticEnabled: event.target.checked }, "settings")}
        />
        <span>{ru ? "Автоматически сохранять безопасные факты" : "Xavfsiz faktlarni avtomatik saqlash"}</span>
      </label>}
    </div>

    {error && <p className="profile-message error" role="alert"><CircleAlert aria-hidden="true" />{error}</p>}
    {notice && <p className="profile-message success" role="status"><ShieldCheck aria-hidden="true" />{notice}</p>}

    {data && !data.available && <p className="memory-unavailable" role="status">
      <CircleAlert aria-hidden="true" />
      <span>{ru
        ? "Зашифрованная память сейчас недоступна. Автоматическое сохранение можно отключить; новые записи не принимаются, а AI-чат продолжает работать без памяти."
        : "Shifrlangan xotira hozir mavjud emas. Avtomatik saqlashni o‘chirish mumkin; yangi yozuvlar qabul qilinmaydi, AI chat esa xotirasiz ishlashda davom etadi."}</span>
    </p>}

    {data?.available && <>
      <form className="memory-create" onSubmit={createMemory}>
        <h3>{ru ? "Добавить запись" : "Yozuv qo‘shish"}</h3>
        <div className="memory-fields">
          <label>{ru ? "Категория" : "Toifa"}
            <select value={create.category} onChange={(event) => setCreate(current => ({ ...current, category: event.target.value as Category }))}>
              {categories.map(category => <option value={category} key={category}>{categoryLabel(category, ru)}</option>)}
            </select>
          </label>
          <label>{ru ? "Область" : "Doira"}
            <select value={create.scope} onChange={(event) => setCreate(current => ({ ...current, scope: event.target.value as "global" | "workspace" }))}>
              <option value="global">{ru ? "Весь аккаунт" : "Butun hisob"}</option>
              <option value="workspace">{ru ? "Текущее пространство" : "Joriy makon"}</option>
            </select>
          </label>
        </div>
        <label>{ru ? "Что запомнить" : "Nimani eslab qolish"}
          <textarea required minLength={2} maxLength={500} value={create.statement} onChange={(event) => setCreate(current => ({ ...current, statement: event.target.value }))} />
        </label>
        <label className="memory-sensitive-confirmation">
          <input type="checkbox" checked={create.confirmSensitive} onChange={(event) => setCreate(current => ({ ...current, confirmSensitive: event.target.checked }))} />
          <span>{ru
            ? "Явно разрешаю сохранить эту запись, если она содержит чувствительные обстоятельства. Пароли и коды всё равно будут отклонены."
            : "Agar yozuv maxfiy holatlarni o‘z ichiga olsa, uni saqlashga aniq ruxsat beraman. Parol va kodlar baribir rad etiladi."}</span>
        </label>
        <button type="submit" disabled={Boolean(busy) || create.statement.trim().length < 2} aria-busy={busy === "create"}>
          {busy === "create" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {ru ? "Сохранить в память" : "Xotirada saqlash"}
        </button>
      </form>

      <div className="memory-list" aria-live="polite">
        <h3>{ru ? `Сохранённые записи: ${data.memories.length}` : `Saqlangan yozuvlar: ${data.memories.length}`}</h3>
        {data.memories.length === 0 && <p className="memory-empty">{ru
          ? "Память пуста. JURO не переносит обстоятельства между чатами."
          : "Xotira bo‘sh. JURO holatlarni suhbatlar orasida ko‘chirmaydi."}</p>}
        {data.memories.map(memory => {
          const draft = drafts[memory.id] ?? { category: memory.category, statement: memory.statement, confirmSensitive: false };
          return <article className="memory-row" key={memory.id}>
            <div className="memory-row-meta">
              <span>{memory.scope === "global" ? (ru ? "Весь аккаунт" : "Butun hisob") : (ru ? "Это пространство" : "Shu makon")}</span>
              <span>{memory.sourceKind === "automatic" ? (ru ? "Сохранено автоматически" : "Avtomatik saqlandi") : (ru ? "Добавлено вами" : "Siz qo‘shgansiz")}</span>
              <time dateTime={memory.updatedAt}>{formatDate(memory.updatedAt, ru)}</time>
            </div>
            <label className="memory-category">{ru ? "Категория" : "Toifa"}
              <select value={draft.category} onChange={(event) => setDrafts(current => ({ ...current, [memory.id]: { ...draft, category: event.target.value as Category } }))}>
                {categories.map(category => <option value={category} key={category}>{categoryLabel(category, ru)}</option>)}
              </select>
            </label>
            <label className="memory-statement">{ru ? "Запись" : "Yozuv"}
              <textarea maxLength={500} value={draft.statement} onChange={(event) => setDrafts(current => ({ ...current, [memory.id]: { ...draft, statement: event.target.value } }))} />
            </label>
            <label className="memory-sensitive-confirmation memory-row-confirmation">
              <input
                type="checkbox"
                checked={draft.confirmSensitive}
                onChange={(event) => setDrafts(current => ({
                  ...current,
                  [memory.id]: { ...draft, confirmSensitive: event.target.checked },
                }))}
              />
              <span>{ru
                ? "Явно разрешаю сохранить чувствительные обстоятельства в этой редакции. Пароли и коды всё равно запрещены."
                : "Ushbu tahrirdagi maxfiy holatlarni saqlashga aniq ruxsat beraman. Parol va kodlar baribir taqiqlanadi."}</span>
            </label>
            <div className="memory-row-actions">
              <button type="button" disabled={Boolean(busy) || draft.statement.trim().length < 2} onClick={() => void updateMemory(memory)}>
                {busy === memory.id ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}{ru ? "Сохранить" : "Saqlash"}
              </button>
              <button className="danger-outline" type="button" disabled={Boolean(busy)} onClick={() => void mutate({ action: "delete", memoryId: memory.id }, `delete:${memory.id}`)}>
                <Trash2 aria-hidden="true" />{ru ? "Удалить" : "O‘chirish"}
              </button>
            </div>
          </article>;
        })}
      </div>

      {data.memories.length > 0 && <div className="memory-clear">
        {!clearArmed
          ? <button className="danger-outline" type="button" onClick={() => setClearArmed(true)}>{ru ? "Очистить доступную память" : "Mavjud xotirani tozalash"}</button>
          : <div role="group" aria-label={ru ? "Подтверждение очистки памяти" : "Xotirani tozalashni tasdiqlash"}>
            <p>{ru ? "Будут удалены глобальные и доступные записи текущего пространства." : "Global va joriy makondagi mavjud yozuvlar o‘chiriladi."}</p>
            <button className="danger-outline" type="button" disabled={Boolean(busy)} onClick={() => void mutate({ action: "clear", confirmation: "CLEAR" }, "clear")}>{ru ? "Подтвердить очистку" : "Tozalashni tasdiqlash"}</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => setClearArmed(false)}>{ru ? "Отмена" : "Bekor qilish"}</button>
          </div>}
      </div>}
    </>}
  </section>;
}

function categoryLabel(category: Category, ru: boolean) {
  const labels = {
    profile_name: ["Имя", "Ism"],
    language: ["Язык", "Til"],
    company: ["Компания", "Kompaniya"],
    answer_style: ["Стиль ответа", "Javob uslubi"],
    user_instruction: ["Инструкция", "Ko‘rsatma"],
    counterparty: ["Контрагент", "Kontragent"],
    legal_context: ["Юридический контекст", "Huquqiy kontekst"],
    typical_requisite: ["Типовой реквизит", "Doimiy rekvizit"],
  } satisfies Record<Category, [string, string]>;
  return labels[category][ru ? 0 : 1];
}

function draftsFor(memories: Memory[]): Record<string, { category: Category; statement: string; confirmSensitive: boolean }> {
  return Object.fromEntries(memories.map((memory) => [memory.id, {
    category: memory.category,
    statement: memory.statement,
    confirmSensitive: false,
  }]));
}

function formatDate(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tashkent",
  }).format(new Date(value));
}
