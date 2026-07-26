import { runtimeEnv } from "../document-builder/storage/runtime";

export type PaymentProviderStatus = {
  configured: boolean;
  provider: string | null;
};

export function paymentProviderStatus(): PaymentProviderStatus {
  const env = runtimeEnv();
  return {
    configured: Boolean(env.PAYMENT_PROVIDER && env.PAYMENT_API_KEY && env.PAYMENT_WEBHOOK_SECRET),
    provider: env.PAYMENT_PROVIDER || null,
  };
}
