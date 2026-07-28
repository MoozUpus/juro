import { notFound } from "next/navigation";
import { AuthPage } from "../../../_auth/AuthPage";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function LocalizedRegister({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ accountType?: string; returnTo?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return <AuthPage
    mode="register"
    locale={locale}
    accountType={query.accountType}
    returnTo={query.returnTo}
  />;
}
