"use client";

import Link from "next/link";
import { Archive, Download, FileText, Headphones, Printer, Sparkles } from "lucide-react";
import type { PlatformLocale } from "../../../lib/platform/routing";
import { builderText } from "../builder-localization";

export interface GeneratedFile {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

export function FinalSuccess({
  files,
  libraryPath,
  onDownload,
  onPrint,
  onConsultation,
  locale = "ru",
}: {
  files: { docx: GeneratedFile; pdf: GeneratedFile; zip: GeneratedFile };
  libraryPath: string;
  onDownload: (file: GeneratedFile) => void;
  onPrint: () => void;
  onConsultation: () => void;
  locale?: PlatformLocale;
}) {
  const copy = builderText(locale, {
    ru: {
      title: "Документ успешно создан",
      subtitle: "DOCX, PDF и ZIP сформированы и сохранены в «Моих документах».",
      docx: "Скачать DOCX", docxHint: "Редактируемый Word-файл",
      pdf: "Скачать PDF", pdfHint: "Готово к печати",
      zip: "Скачать всё", zipHint: "DOCX + PDF в ZIP",
      print: "Распечатать", printHint: "Чистый режим документа",
      keepTitle: "Что важно сохранить",
      keep: ["Сохраняйте подтверждения передачи денег.", "При нарушении срока может потребоваться письменное требование.", "При споре может потребоваться юридическая помощь."],
      relatedTitle: "Связанные документы",
      related: ["Договор займа", "Акт передачи денежных средств", "Претензия о возврате долга", "Соглашение о погашении задолженности"],
      libraryTitle: "Выбрать документ в библиотеке JURO",
      create: "Создать документ",
      consultation: "Получить консультацию",
    },
    uz: {
      title: "Hujjat muvaffaqiyatli yaratildi",
      subtitle: "DOCX, PDF va ZIP yaratildi hamda «Mening hujjatlarim» bo‘limida saqlandi.",
      docx: "DOCX-ni yuklab olish", docxHint: "Tahrirlanadigan Word fayli",
      pdf: "PDF-ni yuklab olish", pdfHint: "Chop etishga tayyor",
      zip: "Hammasini yuklab olish", zipHint: "ZIP ichida DOCX va PDF",
      print: "Chop etish", printHint: "Toza hujjat rejimi",
      keepTitle: "Nimani saqlash muhim",
      keep: ["Pul o‘tkazilganini tasdiqlovchi dalillarni saqlang.", "Muddat buzilsa, yozma talab talab etilishi mumkin.", "Nizo yuzaga kelsa, yuridik yordam zarur bo‘lishi mumkin."],
      relatedTitle: "Tegishli hujjatlar",
      related: ["Qarz shartnomasi", "Pul mablag‘larini topshirish dalolatnomasi", "Qarzni qaytarish talabi", "Qarzni to‘lash bo‘yicha kelishuv"],
      libraryTitle: "JURO kutubxonasidan hujjat tanlash",
      create: "Hujjat yaratish",
      consultation: "Maslahat olish",
    },
    en: {
      title: "Document created",
      subtitle: "Your DOCX, PDF and ZIP files are ready and saved in My documents.",
      docx: "Download DOCX", docxHint: "Editable Word file",
      pdf: "Download PDF", pdfHint: "Ready to print",
      zip: "Download all", zipHint: "DOCX and PDF in one ZIP",
      print: "Print", printHint: "Document-only print view",
      keepTitle: "Important records to keep",
      keep: ["Keep evidence that the money was transferred.", "A written demand may be required if the repayment deadline is missed.", "Seek legal advice if a dispute arises."],
      relatedTitle: "Related documents",
      related: ["Loan agreement", "Funds transfer record", "Debt repayment demand", "Debt repayment agreement"],
      libraryTitle: "Choose a document in the JURO library",
      create: "Create document",
      consultation: "Get legal guidance",
    },
  });

  return <section className="dbt-success">
    <div className="dbt-success-hero"><span><Sparkles size={30}/></span><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
    <div className="dbt-download-grid"><button type="button" onClick={() => onDownload(files.docx)}><FileText size={24}/><span><strong>{copy.docx}</strong><small>{copy.docxHint}</small></span><Download size={18}/></button><button type="button" onClick={() => onDownload(files.pdf)}><FileText size={24}/><span><strong>{copy.pdf}</strong><small>{copy.pdfHint}</small></span><Download size={18}/></button><button type="button" onClick={() => onDownload(files.zip)}><Archive size={24}/><span><strong>{copy.zip}</strong><small>{copy.zipHint}</small></span><Download size={18}/></button><button type="button" onClick={onPrint}><Printer size={24}/><span><strong>{copy.print}</strong><small>{copy.printHint}</small></span></button></div>
    <div className="dbt-info-block"><h2>{copy.keepTitle}</h2><ul>{copy.keep.map((item) => <li key={item}>{item}</li>)}</ul></div>
    <div className="dbt-related"><h2>{copy.relatedTitle}</h2><div>{copy.related.map((title) => <article key={title}><FileText size={22}/><strong>{title}</strong><Link href={libraryPath} title={copy.libraryTitle}>{copy.create}</Link></article>)}</div></div>
    <button type="button" className="dbt-consultation-button" onClick={onConsultation}><Headphones size={20}/>{copy.consultation}</button>
  </section>;
}
