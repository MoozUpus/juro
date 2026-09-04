import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthPage, isAuthLocale } from "../../../_auth/AuthPage";
import { authPageMetadata } from "../../../_auth/auth-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return isAuthLocale(locale) ? authPageMetadata(locale, "login") : {};
}

export default async function LocalizedLogin({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reauth?: string; returnTo?: string; accountType?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isAuthLocale(locale)) notFound();
  return <AuthPage
    mode="login"
    locale={locale}
    returnTo={query.returnTo}
    reauth={query.reauth === "1"}
    accountType={query.accountType}
  />;
}
