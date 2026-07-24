"use client";

import { X } from "lucide-react";
import type { RenderedReceipt } from "../../../lib/document-builder/types";

export function DocumentPreview({ document, mobileOpen = false, onClose, example = false }: { document: RenderedReceipt; mobileOpen?: boolean; onClose?: () => void; example?: boolean }) {
  return <aside className={`dbt-preview ${mobileOpen ? "mobile-open" : ""}`} aria-label={example ? "Пример готового документа" : "Предварительный просмотр документа"}>
    <div className="dbt-preview-toolbar"><div><strong>{example ? "Полный пример" : "Предпросмотр"}</strong><span>A4 · обновляется автоматически</span></div>{onClose && <button type="button" onClick={onClose} aria-label="Закрыть предпросмотр"><X size={20}/></button>}</div>
    <div className="dbt-preview-scroll">
      <article className="dbt-a4">
        {example && <div className="dbt-example-ribbon">Пример — не документ пользователя</div>}
        {document.paragraphs.map((paragraph) => paragraph.kind === "spacer"
          ? <div className="dbt-doc-spacer" key={paragraph.id}/>
          : <p id={paragraph.id} className={`dbt-doc-${paragraph.kind}`} key={paragraph.id}>{paragraph.kind === "list" && <span aria-hidden="true">• </span>}{paragraph.text}</p>)}
        <footer><img src="/juro-mark.png" alt=""/><span>Создано в JURO</span><span>Страница 1 из ~{Math.max(1, Math.ceil(document.plainText.length / 3_500))}</span></footer>
      </article>
    </div>
  </aside>;
}
