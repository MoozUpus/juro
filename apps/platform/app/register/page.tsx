import { AuthPage } from "../_auth/AuthPage";

export const dynamic = "force-dynamic";

export default async function Register({ searchParams }: {
  searchParams: Promise<{
    lang?: string;
    accountType?: string;
    returnTo?: string;
  }>;
}) {
  const query = await searchParams;
  return <AuthPage
    mode="register"
    locale={query.lang === "en" ? "en" : query.lang === "ru" ? "ru" : "uz"}
    accountType={query.accountType}
    returnTo={query.returnTo}
  />;
}
