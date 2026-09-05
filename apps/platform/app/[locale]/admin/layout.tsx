import { notFound } from "next/navigation";

import { isAuthenticatedPlatformLocaleReady } from "../../../lib/platform/routing";

export default async function AdminLocaleReadinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAuthenticatedPlatformLocaleReady(locale)) notFound();
  return children;
}
