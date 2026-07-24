"use client";

import { AlertTriangle, CheckCircle2, Circle, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import type { AiReviewResult, ValidationIssue } from "../../../lib/document-builder/types";

const labels = { critical: "Критично", recommended: "Рекомендуется", optional: "Необязательно" } as const;

export function ReviewPanel({ review, onApply, onNavigate }: { review: AiReviewResult | null; onApply: (issue: ValidationIssue) => void; onNavigate: (anchor?: string) => void }) {
  if (!review) return null;
  return <section className="dbt-review-panel" aria-live="polite">
    <header><div><Sparkles size={21}/><span><strong>Результат проверки JURO</strong><small>{review.status === "completed" ? "AI + детерминированные правила" : "Детерминированные правила"}</small></span></div><span className={`dbt-review-status ${review.status}`}>{review.status === "completed" ? "Завершена" : "AI недоступен"}</span></header>
    {review.message && <div className="dbt-review-message"><AlertTriangle size={18}/><p>{review.message}</p></div>}
    <div className="dbt-quality-grid"><article><strong>{review.quality.legalCompleteness}%</strong><span>Юридическая полнота</span></article><article><strong>{review.quality.dataCompleteness}%</strong><span>Заполненность данных</span></article><article><strong>{review.quality.riskLevel}</strong><span>Уровень рисков</span></article><article><strong>{review.quality.partyProtection}</strong><span>Защита сторон</span></article></div>
    <details className="dbt-quality-explain"><summary><ShieldCheck size={17}/>Как рассчитана оценка</summary>{review.quality.explanation.map((item) => <p key={item}>{item}</p>)}</details>
    <div className="dbt-issues">{review.issues.length ? review.issues.map((issue) => <article className={`dbt-issue ${issue.level}`} key={issue.id}><div className="dbt-issue-icon">{issue.level === "critical" ? <AlertTriangle size={18}/> : issue.level === "recommended" ? <Circle size={17}/> : <CheckCircle2 size={18}/>}</div><div><span className="dbt-issue-level">{labels[issue.level]}</span><h3>{issue.title}</h3><p>{issue.message}</p>{issue.originalText && issue.proposedText && <div className="dbt-diff"><div><small>Исходный текст</small><p>{issue.originalText}</p></div><div><small>Предложенный текст</small><p>{issue.proposedText}</p></div></div>}<div className="dbt-issue-actions">{issue.anchor && <button type="button" onClick={() => onNavigate(issue.anchor)}>Перейти к разделу</button>}{issue.patch && <button type="button" className="primary" onClick={() => onApply(issue)}><WandSparkles size={15}/>Исправить автоматически</button>}</div></div></article>) : <div className="dbt-review-clean"><CheckCircle2 size={24}/><strong>Критических замечаний не найдено</strong><p>Проверьте документ самостоятельно перед подписанием.</p></div>}</div>
    <p className="dbt-review-disclaimer">Оценка JURO является вспомогательной технической проверкой и не является официальным юридическим заключением.</p>
  </section>;
}
