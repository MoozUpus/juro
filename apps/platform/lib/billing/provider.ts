import { runtimeEnv } from "../document-builder/storage/runtime";

export type PaymentProviderStatus = {
  credentialsConfigured: boolean;
  checkoutAvailable: boolean;
  provider: string | null;
};

export function paymentProviderStatus(): PaymentProviderStatus {
  const env = runtimeEnv();
  return {
    credentialsConfigured: Boolean(env.PAYMENT_PROVIDER && env.PAYMENT_API_KEY && env.PAYMENT_WEBHOOK_SECRET),
    // A provider credential is not a checkout integration. Keep purchase UI
    // disabled until an approved adapter and verified webhook are implemented.
    checkoutAvailable: false,
    provider: env.PAYMENT_PROVIDER || null,
  };
}
