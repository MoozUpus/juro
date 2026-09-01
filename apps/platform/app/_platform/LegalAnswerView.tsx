"use client";

import { ExternalLink } from "lucide-react";
import { lazy, Suspense, useId, type ReactNode } from "react";
import { deriveLegalEvidenceMode } from "../../lib/ai/legal-evidence-mode";

const SafeMarkdown = lazy(() => import("./SafeMarkdown").then((module) => ({ default: module.SafeMarkdown })));

export type LegalAnswerViewSource = {
  sourceId: string;
  actTitle: string;
  actIdentifier?: string | null;
  article?: string | null;
  originalUrl: string;
  status: string;
  effectiveDate?: string | null;
  verifiedAt?: string;
  documentNumber?: string | null;
  sourceClass?: string;
  sourceOrigin?: "indexed" | "live" | "web";
};

export type LegalAnswerViewResult = {
  responseKind: "answer" | "clarification_required";
  summary: string;
  answer: string;
  clarificationQuestions: string[];
  confirmedFindings: Array<{ title: string; explanation: string; sourceIds?: string[] }>;
  assumptions: Array<{ statement: string; impact: string }>;
  risks: Array<{ level: "low" | "medium" | "high" | "critical"; title: string; explanation: string; sourceIds?: string[] }>;
  sources: LegalAnswerViewSource[];
  requiredDocuments: Array<{ name: string; reason: string; required: boolean }>;
  actionPlan: Array<{ title: string; description: string; sourceIds?: string[] }>;
  deadlines: Array<{ title: string; dueDate: string | null; calculationMethod: string; confidence: string; sourceIds?: string[] }>;
  urgency: "normal" | "high" | "critical";
  suggestedDocument: { templateCode?: string | null; title: string; reason: string } | null;
  legalDatabaseAsOf: string;
  evidenceMode?: "official" | "mixed" | "secondary_only" | "private_only" | "none";
  referenceNotes?: Array<{ title: string; note: string; sourceIds: string[] }>;
  conditionalBranches?: Array<{ condition: string; outcome: string; sourceIds: string[] }>;
};

type AnswerCopy = {
  main: string;
  law: string;
  branches: string;
  next: string;
  important: string;
  deadlines: string;
  prepare: string;
  additional: string;
  clarify: string;
  insufficient: string;
  checked: string;
  checkedBody: string;
  missing: string;
  authority: Record<NonNullable<LegalAnswerViewResult["evidenceMode"]>, string>;
  citationLabel: string;
  openSource: string;
};

const COPY: Record<"ru" | "uz", AnswerCopy> = {
  ru: {
    main: "Главное",
    law: "Что говорит закон",
    branches: "Как меняется ответ",
    next: "Что делать дальше",
    important: "Важно учесть",
    deadlines: "Сроки",
    prepare: "Что подготовить",
    additional: "Дополнительные материалы",
    clarify: "Что нужно уточнить",
    insufficient: "Пока нельзя подтвердить ответ",
    checked: "Что удалось проверить",
    checkedBody: "JURO проверил доступный индекс официальных источников и предусмотренные уровни поиска, но не получил достаточного подтверждения для правового вывода.",
    missing: "Нужны дополнительные факты или подтверждённая применимая норма. JURO не заменяет их предположением из общих знаний модели.",
    authority: {
      official: "Подтверждено официальными источниками",
      mixed: "Официальные и контекстные источники",
      secondary_only: "Только справочные материалы",
      private_only: "Факты из ваших документов",
      none: "Правовое основание не подтверждено",
    },
    citationLabel: "Правовые основания",
    openSource: "Открыть источник",
  },
  uz: {
    main: "Asosiysi",
    law: "Qonunda nima deyilgan",
    branches: "Javob qachon o‘zgaradi",
    next: "Keyingi qadamlar",
    important: "Muhim jihatlar",
    deadlines: "Muddatlar",
    prepare: "Nimalarni tayyorlash kerak",
    additional: "Qo‘shimcha materiallar",
    clarify: "Nimani aniqlashtirish kerak",
    insufficient: "Javobni hozircha tasdiqlab bo‘lmaydi",
    checked: "Nimalar tekshirildi",
    checkedBody: "JURO rasmiy manbalarning mavjud indeksini va nazarda tutilgan qidiruv bosqichlarini tekshirdi, ammo huquqiy xulosa uchun yetarli tasdiq topmadi.",
    missing: "Qo‘shimcha faktlar yoki tasdiqlangan amaldagi norma kerak. JURO ularning o‘rniga modelning umumiy bilimiga asoslangan taxmin bermaydi.",
    authority: {
      official: "Rasmiy manbalar bilan tasdiqlangan",
      mixed: "Rasmiy va kontekst manbalari",
      secondary_only: "Faqat ma’lumotnoma materiallari",
      private_only: "Hujjatlaringizdagi faktlar",
      none: "Huquqiy asos tasdiqlanmagan",
    },
    citationLabel: "Huquqiy asoslar",
    openSource: "Manbani ochish",
  },
};

function publicSourceUrl(source: LegalAnswerViewSource): string | null {
  try {
    const url = new URL(source.originalUrl);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    if (source.sourceClass === "SECONDARY_REFERENCE" || ["lex.uz", "www.lex.uz"].includes(url.hostname.toLocaleLowerCase())) return url.href;
    return null;
  } catch {
    return null;
  }
}

function citationText(source: LegalAnswerViewSource, locale: "ru" | "uz"): string {
  const article = source.article?.replace(/^(?:статья|ст\.?|modda)\s*/iu, "").trim();
  const act = source.actTitle
    .replace(/Республики Узбекистан/giu, locale === "ru" ? "РУз" : "O‘zR")
    .replace(/O‘zbekiston Respublikasi/giu, locale === "ru" ? "РУз" : "O‘zR");
  if (article) return locale === "ru" ? `ст. ${article} · ${act}` : `${article}-modda · ${act}`;
  if (source.documentNumber) return `${act} · № ${source.documentNumber}`;
  return act;
}

function CitationList({
  sourceIds,
  result,
  locale,
  onCitationSelect,
}: {
  sourceIds?: readonly string[];
  result: LegalAnswerViewResult;
  locale: "ru" | "uz";
  onCitationSelect?: (sourceId: string) => void;
}) {
  const copy = COPY[locale];
  const sources = (sourceIds ?? []).flatMap((sourceId) => {
    const source = result.sources.find((candidate) => candidate.sourceId === sourceId);
    return source ? [source] : [];
  });
  if (!sources.length) return null;
  return <span className="legal-answer__citations" aria-label={copy.citationLabel}>
    {sources.map((source) => {
      const label = citationText(source, locale);
      const href = publicSourceUrl(source);
      if (onCitationSelect) return <button type="button" key={source.sourceId} onClick={() => onCitationSelect(source.sourceId)}>{label}</button>;
      return href
        ? <a href={href} data-juro-product-event="source_opened" target="_blank" rel="noopener noreferrer" key={source.sourceId} title={copy.openSource}>{label}<ExternalLink aria-hidden="true" /></a>
        : <span key={source.sourceId}>{label}</span>;
    })}
  </span>;
}

function Markdown({ children, result, locale }: { children: string; result: LegalAnswerViewResult; locale: "ru" | "uz" }) {
  const allowedLinks = result.sources.flatMap((source) => publicSourceUrl(source) ?? []);
  return <Suspense fallback={<p className="legal-answer__markdown-fallback" aria-busy="true">{children}</p>}>
    <SafeMarkdown locale={locale} allowedLinks={allowedLinks}>{children}</SafeMarkdown>
  </Suspense>;
}

function Section({ id, title, children, className = "" }: { id: string; title: string; children: ReactNode; className?: string }) {
  return <section className={`legal-answer__section ${className}`.trim()} aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    {children}
  </section>;
}

export function LegalAnswerView({
  result,
  locale,
  className = "",
  onQuestionSelect,
  onCitationSelect,
}: {
  result: LegalAnswerViewResult;
  locale: "ru" | "uz";
  className?: string;
  onQuestionSelect?: (question: string) => void;
  onCitationSelect?: (sourceId: string) => void;
}) {
  const id = useId().replace(/:/gu, "");
  const copy = COPY[locale];
  const mode = deriveLegalEvidenceMode(result);
  const rootClass = `legal-answer ${className}`.trim();

  if (result.responseKind === "clarification_required") {
    return <article className={`${rootClass} legal-answer--insufficient`} data-answer-kind="insufficient-evidence">
      <p className="legal-answer__authority">{copy.authority.none}</p>
      <header className="legal-answer__insufficient-heading">
        <span>{copy.checked}</span>
        <h2>{copy.insufficient}</h2>
        <Markdown result={result} locale={locale}>{result.answer}</Markdown>
      </header>
      <section className="legal-answer__checked" aria-labelledby={`${id}-checked`}>
        <h3 id={`${id}-checked`}>{copy.checked}</h3>
        <p>{copy.checkedBody}</p>
        <p>{copy.missing}</p>
      </section>
      {result.clarificationQuestions.length > 0 && <section className="legal-answer__questions" aria-labelledby={`${id}-clarify`}>
        <h3 id={`${id}-clarify`}>{copy.clarify}</h3>
        <div>{result.clarificationQuestions.map((question) => onQuestionSelect
          ? <button type="button" key={question} onClick={() => onQuestionSelect(question)}>{question}</button>
          : <p key={question}>{question}</p>)}</div>
      </section>}
    </article>;
  }

  const important = result.assumptions.length > 0 || result.risks.length > 0 || result.urgency !== "normal";
  const prepare = result.requiredDocuments.length > 0 || Boolean(result.suggestedDocument);
  const mainSourceIds = [
    ...result.confirmedFindings.map((finding) => finding.sourceIds),
    ...(result.conditionalBranches ?? []).map((branch) => branch.sourceIds),
    ...result.actionPlan.map((step) => step.sourceIds),
    ...result.risks.map((risk) => risk.sourceIds),
    ...result.deadlines.map((deadline) => deadline.sourceIds),
  ].find((sourceIds) => (sourceIds?.length ?? 0) > 0) ?? [];
  return <article className={rootClass} data-answer-kind="legal-answer">
    <p className={`legal-answer__authority legal-answer__authority--${mode}`}>{copy.authority[mode]}</p>
    <Section id={`${id}-main`} title={copy.main} className="legal-answer__section--main">
      <Markdown result={result} locale={locale}>{result.summary}</Markdown>
      <CitationList sourceIds={mainSourceIds} result={result} locale={locale} onCitationSelect={onCitationSelect} />
    </Section>
    {(result.conditionalBranches ?? []).length > 0 && <Section id={`${id}-branches`} title={copy.branches}>
      <div className="legal-answer__findings">{(result.conditionalBranches ?? []).map((branch) => <article key={`${branch.condition}:${branch.sourceIds.join(":")}`}>
        <h3>{branch.condition}</h3>
        <Markdown result={result} locale={locale}>{branch.outcome}</Markdown>
        <CitationList sourceIds={branch.sourceIds} result={result} locale={locale} onCitationSelect={onCitationSelect} />
      </article>)}</div>
    </Section>}
    {result.confirmedFindings.length > 0 && <Section id={`${id}-law`} title={copy.law}>
      <div className="legal-answer__findings">{result.confirmedFindings.map((finding) => <article key={`${finding.title}:${finding.sourceIds?.join(":") ?? ""}`}>
        <h3>{finding.title}</h3>
        <Markdown result={result} locale={locale}>{finding.explanation}</Markdown>
        <CitationList sourceIds={finding.sourceIds} result={result} locale={locale} onCitationSelect={onCitationSelect} />
      </article>)}</div>
    </Section>}
    {result.actionPlan.length > 0 && <Section id={`${id}-next`} title={copy.next}>
      <ol className="legal-answer__steps">{result.actionPlan.map((step) => <li key={step.title}>
        <div><h3>{step.title}</h3><Markdown result={result} locale={locale}>{step.description}</Markdown></div>
        <CitationList sourceIds={step.sourceIds} result={result} locale={locale} onCitationSelect={onCitationSelect} />
      </li>)}</ol>
    </Section>}
    {important && <Section id={`${id}-important`} title={copy.important} className="legal-answer__section--important">
      {result.urgency !== "normal" && <p className={`legal-answer__urgency legal-answer__urgency--${result.urgency}`}>{result.urgency === "critical"
        ? (locale === "ru" ? "Критическая срочность: проверьте ближайший срок и возможность немедленной помощи." : "Juda shoshilinch: yaqin muddat va zudlik bilan yordam olish imkonini tekshiring.")
        : (locale === "ru" ? "Вопрос требует приоритетного внимания." : "Masala ustuvor e’tiborni talab qiladi.")}</p>}
      {result.assumptions.map((assumption) => <article key={assumption.statement}><h3>{assumption.statement}</h3><Markdown result={result} locale={locale}>{assumption.impact}</Markdown></article>)}
      {result.risks.map((risk) => <article className={`legal-answer__risk legal-answer__risk--${risk.level}`} key={`${risk.level}:${risk.title}`}>
        <h3>{risk.title}</h3><Markdown result={result} locale={locale}>{risk.explanation}</Markdown>
        <CitationList sourceIds={risk.sourceIds} result={result} locale={locale} onCitationSelect={onCitationSelect} />
      </article>)}
    </Section>}
    {result.deadlines.length > 0 && <Section id={`${id}-deadlines`} title={copy.deadlines}>
      <div className="legal-answer__deadlines">{result.deadlines.map((deadline) => <article key={deadline.title}>
        <h3>{deadline.title}{deadline.dueDate ? ` · ${deadline.dueDate}` : ""}</h3>
        <Markdown result={result} locale={locale}>{deadline.calculationMethod}</Markdown>
        <CitationList sourceIds={deadline.sourceIds} result={result} locale={locale} onCitationSelect={onCitationSelect} />
      </article>)}</div>
    </Section>}
    {prepare && <Section id={`${id}-prepare`} title={copy.prepare}>
      {result.requiredDocuments.length > 0 && <ul className="legal-answer__documents">{result.requiredDocuments.map((document) => <li key={document.name}>
        <strong>{document.name}</strong><span>{document.reason}</span>
      </li>)}</ul>}
      {result.suggestedDocument && <article className="legal-answer__suggested-document"><h3>{result.suggestedDocument.title}</h3><p>{result.suggestedDocument.reason}</p></article>}
    </Section>}
    {(result.referenceNotes ?? []).length > 0 && <Section id={`${id}-additional`} title={copy.additional} className="legal-answer__section--additional">
      <p className="legal-answer__secondary-note">{locale === "ru"
        ? "Эти материалы поясняют контекст, но не устанавливают правовые нормы, сроки, расчёты или обязательные действия."
        : "Bu materiallar kontekstni tushuntiradi, lekin huquqiy norma, muddat, hisob-kitob yoki majburiy harakatni belgilamaydi."}</p>
      {(result.referenceNotes ?? []).map((note) => <article key={`${note.title}:${note.sourceIds.join(":")}`}>
        <h3>{note.title}</h3><Markdown result={result} locale={locale}>{note.note}</Markdown>
        <CitationList sourceIds={note.sourceIds} result={result} locale={locale} onCitationSelect={onCitationSelect} />
      </article>)}
    </Section>}
    {result.clarificationQuestions.length > 0 && <section className="legal-answer__questions" aria-labelledby={`${id}-clarify`}>
      <h2 id={`${id}-clarify`}>{copy.clarify}</h2>
      <div>{result.clarificationQuestions.map((question) => onQuestionSelect
        ? <button type="button" key={question} onClick={() => onQuestionSelect(question)}>{question}</button>
        : <p key={question}>{question}</p>)}</div>
    </section>}
  </article>;
}
