"use client";

import { RotateCcw, Undo2, Redo2 } from "lucide-react";

export function ManualEditor({ value, onChange, onUndo, onRedo, onReset, canUndo, canRedo, locked }: {
  value: string;
  onChange: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  canUndo: boolean;
  canRedo: boolean;
  locked: boolean;
}) {
  return <section className="dbt-editor">
    <header><div><h2>Полный текст документа</h2><p>Стиль и оформление фиксированы; редактируется только текст.</p></div><div><button type="button" onClick={onUndo} disabled={!canUndo || locked} aria-label="Отменить"><Undo2 size={17}/>Отменить</button><button type="button" onClick={onRedo} disabled={!canRedo || locked} aria-label="Повторить"><Redo2 size={17}/>Повторить</button><button type="button" onClick={onReset} disabled={locked}><RotateCcw size={17}/>Вернуть исходный текст</button></div></header>
    {locked ? <div className="dbt-editor-locked"><p>Ручное редактирование полного текста доступно после входа.</p></div> : <textarea aria-label="Редактор полного текста документа" value={value} onChange={(event) => onChange(event.target.value)} spellCheck/>}
  </section>;
}
