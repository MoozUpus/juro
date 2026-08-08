import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AiQualityConsole } from "../../../_staff/AiQualityConsole";
import "../../../_staff/legal-source-reviews.css";
import { requirePlatformStaffAccess } from "../../../../lib/auth/staff-access";
import { localSessionForRequest } from "../../../../lib/auth/mfa-http";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function AiQualityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const runtime = runtimeEnv();
  if (!isLocale(locale) || !runtime.DB) notFound();
  let reviewerName = "";
  try {
    const incoming = await headers();
    const now = new Date();
    const session = await localSessionForRequest(
      new Request("https://app.juro.local/staff-access", { headers: new Headers(incoming) }),
      { now },
    );
    await requirePlatformStaffAccess(runtime.DB, session, "ai.quality.review", {
      now,
      freshMfaWithinMs: 15 * 60 * 1_000,
    });
    reviewerName = session.fullName || session.email;
  } catch {
    notFound();
  }
  return <AiQualityConsole locale={locale} reviewerName={reviewerName}/>;
}
