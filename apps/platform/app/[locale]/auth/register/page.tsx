import { notFound } from "next/navigation";
import { AuthPage, isAuthLocale } from "../../../_auth/AuthPage";

export const dynamic = "force-dynamic";

export default async function LocalizedRegister({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ accountType?: string; returnTo?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isAuthLocale(locale)) notFound();
  return <AuthPage
    mode="register"
    locale={locale}
    accountType={query.accountType}
    returnTo={query.returnTo}
  />;
}
