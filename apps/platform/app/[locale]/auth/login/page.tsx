import { notFound } from "next/navigation";
import { AuthPage } from "../../../_auth/AuthPage";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function LocalizedLogin({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reauth?: string; returnTo?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return <AuthPage
    mode="login"
    locale={locale}
    returnTo={query.returnTo}
    reauth={query.reauth === "1"}
  />;
}
