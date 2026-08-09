export type Language = "ru" | "uz";
export type FeatureCopy = {
  title: string;
  body: string;
  result: string;
  cta: string;
  path: string;
  accountRequired: boolean;
};

export type LandingContent = {
  meta: { title: string; description: string };
  nav: {
    capabilities: string;
    how: string;
    pricing: string;
    security: string;
    faq: string;
    login: string;
    start: string;
    menuOpen: string;
    menuClose: string;
    skip: string;
  };
  hero: {
    eyebrow: string;
    subtitle: string;
    chips: string[];
    primary: string;
    secondary: string;
    jurobekAlt: string;
  };
  demo: {
    label: string;
    title: string;
    description: string;
    placeholder: string;
    send: string;
    analyzing: string;
    error: string;
    continueTitle: string;
    continueBody: string;
    consent: string;
    continueCta: string;
    disclaimer: string;
  };
  audience: {
    eyebrow: string;
    title: string;
    body: string;
    top: Array<{ id: "self" | "business" | "lawyer"; title: string; body: string; scenarios: string[]; cta: string }>;
    business: Array<{ id: string; title: string; body: string; scenarios: string[]; cta: string }>;
  };
  capabilities: { eyebrow: string; title: string; body: string; items: FeatureCopy[] };
  how: { eyebrow: string; title: string; body: string; steps: string[]; note: string };
  comparison: {
    eyebrow: string;
    title: string;
    body: string;
    ordinaryTitle: string;
    juroTitle: string;
    ordinary: string[];
    juro: string[];
  };
  handoff: { eyebrow: string; title: string; body: string; stages: string[]; note: string; cta: string };
  security: { eyebrow: string; title: string; body: string; items: Array<{ title: string; body: string }>; serverLine: string };
  pricing: {
    eyebrow: string;
    title: string;
    body: string;
    plans: Array<{ id: "personal" | "business" | "legal"; title: string; badge?: string; items: string[]; note?: string; cta: string }>;
  };
  knowledge: {
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
    items: Array<{ slug: string; title: string; description: string }>;
  };
  faq: { eyebrow: string; title: string; body: string; items: Array<{ question: string; answer: string }> };
  final: { title: string; body: string; primary: string; secondary: string; disclaimer: string };
  footer: {
    description: string;
    product: string;
    companies: string;
    legal: string;
    contacts: string;
    links: Record<string, string>;
  };
};
