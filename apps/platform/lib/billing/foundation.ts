type PaymentFoundationEnv = {
  APP_ENV?: "development" | "staging" | "production";
  DB?: D1Database;
  PAYMENT_FOUNDATION_ENABLED?: string;
  PAYMENT_SANDBOX_ENABLED?: string;
  PAYMENT_PRODUCTION_APPROVED?: string;
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
