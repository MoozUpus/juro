import { AuthPage } from "../_auth/AuthPage";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: {
  searchParams: Promise<{ lang?: string; reauth?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  return <AuthPage
    mode="login"
    locale={query.lang === "en" ? "en" : query.lang === "ru" ? "ru" : "uz"}
    returnTo={query.returnTo}
    reauth={query.reauth === "1"}
  />;
}
