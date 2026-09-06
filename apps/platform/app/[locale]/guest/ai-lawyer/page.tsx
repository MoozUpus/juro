import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuestAiClient } from "../../../_guest/GuestAiClient";
import { guestAiEnabled } from "../../../../lib/ai/guest-session";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { isLocale } from "../../../../lib/platform/routing";
import "../../../_guest/guest-ai.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function GuestAiLawyerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale) || !guestAiEnabled(runtimeEnv())) {
    notFound();
  }
  return <GuestAiClient locale={locale} />;
}
