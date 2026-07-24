"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { BuilderUser } from "./_components/BuilderHeader";

interface DocumentBuilderLoaderProps {
  initialUser: BuilderUser | null;
  signInPath: string;
}

/**
 * Loads the sizeable questionnaire only in the browser. Besides reducing the
 * initial Worker render, this keeps browser-only draft restoration and editor
 * dependencies out of Cloudflare's SSR module evaluation path.
 */
export function DocumentBuilderLoader(props: DocumentBuilderLoaderProps) {
  const [Client, setClient] = useState<ComponentType<DocumentBuilderLoaderProps> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void import("./DocumentBuilderClient")
      .then(({ DocumentBuilderClient }) => {
        if (active) setClient(() => DocumentBuilderClient);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, []);

  if (failed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f8] p-6">
        <section className="max-w-md rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm" role="alert">
          <h1 className="text-xl font-semibold text-[#1b263b]">Не удалось открыть конструктор</h1>
          <p className="mt-3 text-sm text-[#64748b]">Проверьте соединение и обновите страницу. Заполненные в этой вкладке данные сохранятся.</p>
          <button className="mt-5 min-h-11 rounded-xl bg-[#159a9c] px-5 font-semibold text-white" onClick={() => window.location.reload()} type="button">
            Обновить страницу
          </button>
        </section>
      </main>
    );
  }

  if (!Client) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f8]" aria-busy="true" aria-label="Загрузка конструктора">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d7eeee] border-t-[#159a9c]" />
      </main>
    );
  }

  return <Client {...props} />;
}
