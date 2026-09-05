import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicStatusPage } from "../../_status/PublicStatusPage";
import "../../_status/status.css";
import { runtimeEnv } from "../../../lib/document-builder/storage/runtime";
import { dependencyHealthEnvironment } from "../../../lib/operations/dependency-health";
import {
  publicStatusMetadata,
  STATUS_ORIGIN_HEADER,
} from "../../../lib/operations/status-metadata";
import { readPublicStatus } from "../../../lib/operations/system-status";
import { isLocale } from "../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  return publicStatusMetadata(requestHeaders.get(STATUS_ORIGIN_HEADER));
}

export default async function LocalizedStatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const runtime = runtimeEnv();
  if (!isLocale(locale) || !runtime.DB) notFound();
  const snapshot = await readPublicStatus({
    db: runtime.DB,
    locale,
    environment: dependencyHealthEnvironment(runtime.APP_ENV),
  });
  return <PublicStatusPage locale={locale} snapshot={snapshot} />;
}
