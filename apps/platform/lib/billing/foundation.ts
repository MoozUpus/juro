type PaymentFoundationEnv = {
  APP_ENV?: "development" | "staging" | "production";
  DB?: D1Database;
  PAYMENT_FOUNDATION_ENABLED?: string;
  PAYMENT_SANDBOX_ENABLED?: string;
  PAYMENT_PRODUCTION_APPROVED?: string;
  PAYMENT_PRODUCTION_DEMO_ENABLED?: string;
};

export type PaymentFoundationStatus = Readonly<{
  enabled: boolean;
  sandboxEnabled: boolean;
  productionApproved: boolean;
  reason: "ready" | "disabled" | "database_unavailable" | "production_approval_required" | "sandbox_forbidden";
}>;

export function paymentFoundationStatus(
  env: PaymentFoundationEnv,
): PaymentFoundationStatus {
  if (env.PAYMENT_FOUNDATION_ENABLED !== "true") {
    return Object.freeze({ enabled: false, sandboxEnabled: false, productionApproved: false, reason: "disabled" });
  }
  if (!env.DB) {
    return Object.freeze({ enabled: false, sandboxEnabled: false, productionApproved: false, reason: "database_unavailable" });
  }
  const productionApproved = env.APP_ENV === "production" && env.PAYMENT_PRODUCTION_APPROVED === "true";
  if (env.APP_ENV === "production" && !productionApproved) {
    return Object.freeze({ enabled: false, sandboxEnabled: false, productionApproved: false, reason: "production_approval_required" });
  }
  const sandboxEnabled = env.APP_ENV !== "production" && env.PAYMENT_SANDBOX_ENABLED === "true";
  if (env.PAYMENT_SANDBOX_ENABLED === "true" && env.APP_ENV === "production") {
    return Object.freeze({ enabled: productionApproved, sandboxEnabled: false, productionApproved, reason: "sandbox_forbidden" });
  }
  return Object.freeze({ enabled: true, sandboxEnabled, productionApproved, reason: "ready" });
}

export type PaymentDemoStatus = Readonly<{
  enabled: boolean;
  provider: "demo";
  isSimulation: true;
  externalNetwork: false;
  entitlementsActivated: false;
  reason: "ready" | "disabled" | "database_unavailable";
}>;

export function paymentDemoStatus(env: PaymentFoundationEnv): PaymentDemoStatus {
  const base = {
    provider: "demo" as const,
    isSimulation: true as const,
    externalNetwork: false as const,
    entitlementsActivated: false as const,
  };
  if (!env.DB) return Object.freeze({ ...base, enabled: false, reason: "database_unavailable" as const });
  if (env.PAYMENT_PRODUCTION_DEMO_ENABLED !== "true") {
    return Object.freeze({ ...base, enabled: false, reason: "disabled" as const });
  }
  return Object.freeze({ ...base, enabled: true, reason: "ready" as const });
}
