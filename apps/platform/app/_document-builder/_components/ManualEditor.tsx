"use client";

import { Redo2, RotateCcw, Undo2 } from "lucide-react";
import type { PlatformLocale } from "../../../lib/platform/routing";
import { builderText } from "../builder-localization";

export function ManualEditor({
  value,
  onChange,
  onUndo,
  onRedo,
  onReset,
  canUndo,
  canRedo,
  locked,
  locale = "ru",
}: {
  value: string;
  onChange: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  canUndo: boolean;
  canRedo: boolean;
  locked: boolean;
  locale?: PlatformLocale;
}) {
  const copy = builderText(locale, {
    ru: {
      title: "Полный текст документа",
      subtitle: "Стиль и оформление фиксированы; редактируется только текст.",
      undo: "Отменить",
      redo: "Повторить",
      reset: "Вернуть исходный текст",
      locked: "Ручное редактирование полного текста доступно после входа.",
      editor: "Редактор полного текста документа",
    },
    uz: {
      title: "Hujjatning to‘liq matni",
      subtitle: "Uslub va format belgilangan; faqat matn tahrirlanadi.",
      undo: "Bekor qilish",
      redo: "Qaytarish",
      reset: "Dastlabki matnni tiklash",
      locked: "To‘liq matnni qo‘lda tahrirlash tizimga kirgandan keyin mavjud.",
      editor: "Hujjatning to‘liq matn muharriri",
    },
    en: {
      title: "Full document text",
      subtitle: "Formatting is fixed; only the document wording can be edited.",
      undo: "Undo",
      redo: "Redo",
      reset: "Restore original text",
      locked: "Sign in to edit the full document text manually.",
      editor: "Full document text editor",
    },
  });

  return <section className="dbt-editor">
    <header><div><h2>{copy.title}</h2><p>{copy.subtitle}</p></div><div><button type="button" onClick={onUndo} disabled={!canUndo || locked} aria-label={copy.undo}><Undo2 size={17}/>{copy.undo}</button><button type="button" onClick={onRedo} disabled={!canRedo || locked} aria-label={copy.redo}><Redo2 size={17}/>{copy.redo}</button><button type="button" onClick={onReset} disabled={locked}><RotateCcw size={17}/>{copy.reset}</button></div></header>
    {locked ? <div className="dbt-editor-locked"><p>{copy.locked}</p></div> : <textarea aria-label={copy.editor} value={value} onChange={(event) => onChange(event.target.value)} spellCheck/>}
  </section>;
}
