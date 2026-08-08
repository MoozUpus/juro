import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicStatusPage } from "../_status/PublicStatusPage";
import "../_status/status.css";
import { runtimeEnv } from "../../lib/document-builder/storage/runtime";
import { readPublicStatus } from "../../lib/operations/system-status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Статус платформы",
  robots: { index: false, follow: false, nocache: true },
};

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const runtime = runtimeEnv();
  if (!runtime.DB) notFound();
  const locale = (await searchParams).lang === "uz" ? "uz" : "ru";
  const snapshot = await readPublicStatus({ db: runtime.DB, locale });
  return <PublicStatusPage locale={locale} snapshot={snapshot} />;
}
