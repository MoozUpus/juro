const lawyerPageMap: Record<string, { module: string; view?: string }> = {
  dashboard: { module: "dashboard" },
  "ai-chat": { module: "ai-chat" },
  "document-builder": { module: "document-builder" },
  "document-review": { module: "document-review" },
  monitoring: { module: "monitoring" },
  requests: { module: "consultations", view: "requests" },
  consultations: { module: "consultations", view: "schedule" },
  clients: { module: "consultations", view: "clients" },
  matters: { module: "consultations", view: "matters" },
  calendar: { module: "calendar" },
  messages: { module: "consultations", view: "messages" },
  documents: { module: "consultations", view: "documents" },
  tasks: { module: "consultations", view: "tasks" },
  knowledge: { module: "knowledge" },
  billing: { module: "billing" },
  "demo-payments": { module: "demo-payments" },
  application: { module: "profile" },
  status: { module: "profile" },
  profile: { module: "profile" },
  security: { module: "security" },
  help: { module: "help" },
  settings: { module: "settings" },
};

export function lawyerHostTarget(url: URL): URL | null {
  const target = new URL(url);
  if (url.pathname === "/") {
    target.pathname = "/ru/auth/login";
    target.searchParams.set("accountType", "lawyer");
    return target;
  }
  const auth = url.pathname.match(/^\/(?:(ru|uz)\/)?(login|register|verify)\/?$/u);
  if (auth) {
    const locale = auth[1] || "ru";
    const action = auth[2] === "verify" ? "login" : auth[2];
    target.pathname = `/${locale}/auth/${action}`;
    target.searchParams.set("accountType", "lawyer");
    return target;
  }
  if (/^\/(?:ru|uz)\/auth\/(?:login|register)\/?$/u.test(url.pathname)) {
    target.searchParams.set("accountType", "lawyer");
    return target;
  }
  const onboarding = url.pathname.match(/^\/(?:(ru|uz)\/)?onboarding\/?$/u);
  if (onboarding) {
    target.pathname = `/${onboarding[1] || "ru"}/onboarding`;
    return target;
  }
  const documentBuilder = url.pathname.match(
    /^\/(?:(ru|uz)\/)?document-builder\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?\/?$/u,
  );
  if (documentBuilder) {
    const [, locale = "ru", categorySlug, documentCode] = documentBuilder;
    target.pathname = `/${locale}/lawyer/document-builder/${categorySlug}${documentCode ? `/${documentCode}` : ""}`;
    return target;
  }
  const unprefixed = url.pathname.match(/^\/([^/]+)\/?$/u);
  if (unprefixed) {
    const mapped = lawyerPageMap[unprefixed[1]];
    if (!mapped) return null;
    target.pathname = `/ru/lawyer/${mapped.module}`;
    if (mapped.view) target.searchParams.set("view", mapped.view);
    return target;
  }
  const clean = url.pathname.match(/^\/(ru|uz)(?:\/([^/]+))?\/?$/u);
  if (clean) {
    const locale = clean[1];
    const page = clean[2] || "dashboard";
    const mapped = lawyerPageMap[page];
    if (!mapped) return null;
    target.pathname = `/${locale}/lawyer/${mapped.module}`;
    if (mapped.view) target.searchParams.set("view", mapped.view);
    return target;
  }
  // Keep previously shared/internal-looking lawyer URLs functional on the
  // dedicated host without duplicating pages. In particular, requests,
  // clients, matters, messages, documents, and tasks are views of the shared
  // consultations module rather than standalone Next routes.
  const nestedClean = url.pathname.match(/^\/(ru|uz)\/lawyer\/([^/]+)\/?$/u);
  if (nestedClean) {
    const locale = nestedClean[1];
    const mapped = lawyerPageMap[nestedClean[2]];
    if (mapped) {
      target.pathname = `/${locale}/lawyer/${mapped.module}`;
      if (mapped.view) target.searchParams.set("view", mapped.view);
      return target;
    }
  }
  if (/^\/(?:ru|uz)\/lawyer(?:\/|$)/u.test(url.pathname)) return target;
  return null;
}
