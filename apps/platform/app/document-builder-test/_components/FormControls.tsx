"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

interface BaseProps {
  label: string;
  help?: string;
  example?: string;
  className?: string;
}

function FieldLabel({ label, help, example }: BaseProps) {
  return <span className="dbt-field-label"><span>{label}</span>{help && <details className="dbt-help"><summary aria-label={`Подсказка: ${label}`}><CircleHelp size={16}/></summary><div><p>{help}</p>{example && <small>Пример: {example}</small>}</div></details>}</span>;
}

export function InputField({ label, help, example, className = "", ...props }: BaseProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className={`dbt-field ${className}`}><FieldLabel label={label} help={help} example={example}/><input {...props}/></label>;
}

export function SelectField({ label, help, example, className = "", children, ...props }: BaseProps & React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return <label className={`dbt-field ${className}`}><FieldLabel label={label} help={help} example={example}/><select {...props}>{children}</select></label>;
}

export function TextAreaField({ label, help, example, className = "", ...props }: BaseProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <label className={`dbt-field ${className}`}><FieldLabel label={label} help={help} example={example}/><textarea {...props}/></label>;
}

export function ChoiceGroup<T extends string>({ label, value, onChange, options, help }: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; description?: string }>;
  help?: string;
}) {
  return <fieldset className="dbt-choice-group"><legend><FieldLabel label={label} help={help}/></legend><div>{options.map((option) => <label className={value === option.value ? "selected" : ""} key={option.value}><input type="radio" name={label} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)}/><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span></label>)}</div></fieldset>;
}

export function Toggle({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (value: boolean) => void; description?: string }) {
  return <label className="dbt-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}/><span aria-hidden="true"/><div><strong>{label}</strong>{description && <small>{description}</small>}</div></label>;
}

export function FormSection({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id?: string }) {
  return <section className="dbt-form-card" id={id}><header><h2>{title}</h2>{description && <p>{description}</p>}</header><div className="dbt-form-card-body">{children}</div></section>;
}
