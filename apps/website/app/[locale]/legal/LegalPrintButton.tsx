"use client";

export function LegalPrintButton({ label }: { label: string }) {
  return <button onClick={() => window.print()} type="button">{label}</button>;
}
