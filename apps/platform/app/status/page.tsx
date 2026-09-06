import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicStatusPage } from "../_status/PublicStatusPage";
import "../_status/status.css";
import { runtimeEnv } from "../../lib/document-builder/storage/runtime";
import { dependencyHealthEnvironment } from "../../lib/operations/dependency-health";
import {
  publicStatusMetadata,
  STATUS_ORIGIN_HEADER,
} from "../../lib/operations/status-metadata";
import { readPublicStatus } from "../../lib/operations/system-status";
import { isLocale } from "../../lib/platform/routing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const requestHeaders = await headers();
  const requestedLocale = (await searchParams).lang;
  return publicStatusMetadata(
    requestHeaders.get(STATUS_ORIGIN_HEADER),
    typeof requestedLocale === "string" && isLocale(requestedLocale) ? requestedLocale : "ru",
  );
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const runtime = runtimeEnv();
  if (!runtime.DB) notFound();
  const requestedLocale = (await searchParams).lang;
  const locale = typeof requestedLocale === "string" && isLocale(requestedLocale)
    ? requestedLocale
    : "ru";
  const snapshot = await readPublicStatus({
    db: runtime.DB,
    locale,
    environment: dependencyHealthEnvironment(runtime.APP_ENV),
  });
  return <PublicStatusPage locale={locale} snapshot={snapshot} />;
}
