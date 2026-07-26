import Image from "next/image";
import type { RenderedParagraph } from "../../../lib/document-builder/types";

export function PublicDocumentView({ title, paragraphs }: { title: string; paragraphs: RenderedParagraph[] }) {
  return <main className="dbt-public-document">
    <header><Image src="/juro-logo-primary.png" alt="JURO" width={110} height={108} unoptimized/><div><span>Документ предоставлен владельцем</span><h1>{title}</h1></div></header>
    <article className="dbt-a4 dbt-a4-public" aria-label={title}>
      {paragraphs.map((paragraph) => paragraph.kind === "spacer"
        ? <div className="dbt-doc-spacer" key={paragraph.id}/>
        : <p className={`dbt-doc-${paragraph.kind}`} key={paragraph.id}>{paragraph.kind === "list" && <span aria-hidden="true">• </span>}{paragraph.text}</p>)}
      <footer><Image src="/juro-mark.png" alt="" width={18} height={18} unoptimized/><span>Создано в JURO</span><span>Страница 1</span></footer>
    </article>
  </main>;
}
