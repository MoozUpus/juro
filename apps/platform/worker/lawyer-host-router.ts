const lawyerPageMap: Record<string, { module: string; view?: string }> = {
  dashboard: { module: "dashboard" },
  requests: { module: "consultations", view: "requests" },
  consultations: { module: "consultations", view: "schedule" },
  clients: { module: "consultations", view: "clients" },
  matters: { module: "consultations", view: "matters" },
  calendar: { module: "calendar" },
  messages: { module: "consultations", view: "messages" },
  documents: { module: "consultations", view: "documents" },
  tasks: { module: "consultations", view: "tasks" },
  application: { module: "profile" },
  status: { module: "profile" },
  profile: { module: "profile" },
  settings: { module: "settings" },
};

export function lawyerHostTarget(url: URL): URL | null {
  const target = new URL(url);
  if (url.pathname === "/") {
    target.pathname = "/ru/auth/login";
    target.searchParams.set("accountType", "lawyer");
    return target;
  }
  const auth = url.pathname.match(/^\/(ru|uz)\/(login|register)$/u);
  if (auth) {
    target.pathname = `/${auth[1]}/auth/${auth[2]}`;
    target.searchParams.set("accountType", "lawyer");
    return target;
  }
  if (/^\/(?:ru|uz)\/auth\/(?:login|register)\/?$/u.test(url.pathname)) {
    target.searchParams.set("accountType", "lawyer");
    return target;
  }
  if (/^\/(?:ru|uz)\/onboarding\/?$/u.test(url.pathname)) return target;
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
  if (/^\/(?:ru|uz)\/lawyer(?:\/|$)/u.test(url.pathname)) return target;
  return null;
}
