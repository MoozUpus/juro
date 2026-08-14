import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { LegalEvaluationReviewConsole } from "../../../../_staff/LegalEvaluationReviewConsole";
import "../../../../_staff/legal-source-reviews.css";
import { requirePlatformStaffAccess } from "../../../../../lib/auth/staff-access";
import { localSessionForRequest } from "../../../../../lib/auth/mfa-http";
import { runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import { isLocale } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

async function reviewerSession(locale: "ru" | "uz") {
  const runtime = runtimeEnv();
  if (!isLocale(locale) || runtime.APP_ENV !== "staging" || !runtime.DB) notFound();
  try {
    const incoming = await headers(); const now = new Date();
    const session = await localSessionForRequest(new Request("https://app.juro.local/staff-access", { headers: new Headers(incoming) }), { now });
    await requirePlatformStaffAccess(runtime.DB, session, "ai.quality.review", { now, freshMfaWithinMs: 15 * 60 * 1_000 });
    return session;
  } catch { notFound(); }
}

export default async function LegalEvaluationReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const pageLocale = isLocale(locale) ? locale : notFound();
  const session = await reviewerSession(pageLocale);
  return <LegalEvaluationReviewConsole locale={pageLocale} reviewerName={session.fullName || session.email}/>;
}
