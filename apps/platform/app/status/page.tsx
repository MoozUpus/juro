import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicStatusPage, publicStatusMetadata } from "../_status/PublicStatusPage";
import "../_status/status.css";
import { runtimeEnv } from "../../lib/document-builder/storage/runtime";
import { dependencyHealthEnvironment } from "../../lib/operations/dependency-health";
import { readPublicStatus } from "../../lib/operations/system-status";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  return publicStatusMetadata((await searchParams).lang === "uz" ? "uz" : "ru");
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const runtime = runtimeEnv();
  if (!runtime.DB) notFound();
  const locale = (await searchParams).lang === "uz" ? "uz" : "ru";
  const snapshot = await readPublicStatus({
    db: runtime.DB,
    locale,
    environment: dependencyHealthEnvironment(runtime.APP_ENV),
  });
  return <PublicStatusPage locale={locale} snapshot={snapshot} />;
}
