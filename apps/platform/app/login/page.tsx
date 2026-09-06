import type { Metadata } from "next";
import { AuthPage } from "../_auth/AuthPage";
import { authPageMetadata } from "../_auth/auth-metadata";

export const dynamic = "force-dynamic";

type LoginQuery = { lang?: string; reauth?: string; returnTo?: string };

function localeFromQuery(lang?: string) {
  return lang === "en" ? "en" : lang === "ru" ? "ru" : "uz";
}

export async function generateMetadata({ searchParams }: {
  searchParams: Promise<LoginQuery>;
}): Promise<Metadata> {
  const query = await searchParams;
  return authPageMetadata(localeFromQuery(query.lang), "login");
}

export default async function Login({ searchParams }: {
  searchParams: Promise<LoginQuery>;
}) {
  const query = await searchParams;
  return <AuthPage
    mode="login"
    locale={localeFromQuery(query.lang)}
    returnTo={query.returnTo}
    reauth={query.reauth === "1"}
  />;
}
