import { AuthPage } from "../_auth/AuthPage";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: {
  searchParams: Promise<{ lang?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  return <AuthPage
    mode="login"
    locale={query.lang === "ru" ? "ru" : "uz"}
    returnTo={query.returnTo}
  />;
}
