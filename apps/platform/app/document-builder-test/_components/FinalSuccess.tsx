"use client";

import { Archive, Download, FileText, Headphones, Printer, Sparkles } from "lucide-react";

export interface GeneratedFile {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

export function FinalSuccess({ files, onDownload, onPrint, onConsultation }: { files: { docx: GeneratedFile; pdf: GeneratedFile; zip: GeneratedFile }; onDownload: (file: GeneratedFile) => void; onPrint: () => void; onConsultation: () => void }) {
  const related = ["Договор займа", "Акт передачи денежных средств", "Претензия о возврате долга", "Соглашение о погашении задолженности"];
  return <section className="dbt-success">
    <div className="dbt-success-hero"><span><Sparkles size={30}/></span><h1>Документ успешно создан</h1><p>DOCX, PDF и ZIP сформированы и сохранены в «Моих документах».</p></div>
    <div className="dbt-download-grid"><button type="button" onClick={() => onDownload(files.docx)}><FileText size={24}/><span><strong>Скачать DOCX</strong><small>Редактируемый Word-файл</small></span><Download size={18}/></button><button type="button" onClick={() => onDownload(files.pdf)}><FileText size={24}/><span><strong>Скачать PDF</strong><small>Готово к печати</small></span><Download size={18}/></button><button type="button" onClick={() => onDownload(files.zip)}><Archive size={24}/><span><strong>Скачать всё</strong><small>DOCX + PDF в ZIP</small></span><Download size={18}/></button><button type="button" onClick={onPrint}><Printer size={24}/><span><strong>Распечатать</strong><small>Чистый режим документа</small></span></button></div>
    <div className="dbt-info-block"><h2>Что важно сохранить</h2><ul><li>Сохраняйте подтверждения передачи денег.</li><li>При нарушении срока может потребоваться письменное требование.</li><li>При споре может потребоваться юридическая помощь.</li></ul></div>
    <div className="dbt-related"><h2>Связанные документы</h2><div>{related.map((title) => <article key={title}><FileText size={22}/><strong>{title}</strong><a href="/document-builder-test" title="Начать создание нового документа в тестовом модуле">Создать документ</a></article>)}</div></div>
    <button type="button" className="dbt-consultation-button" onClick={onConsultation}><Headphones size={20}/>Получить консультацию</button>
  </section>;
}
