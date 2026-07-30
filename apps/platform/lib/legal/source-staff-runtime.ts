import {
  localSessionForRequest,
} from "../auth/mfa-http";
import {
  runtimeEnv,
} from "../document-builder/storage/runtime";
import type {
  LegalSourceStaffHttpDependencies,
} from "./source-staff-http";

export function runtimeLegalSourceStaffDependencies(): LegalSourceStaffHttpDependencies {
  const runtime = runtimeEnv();
  const enabled = runtime.LEGAL_SOURCE_STAFF_API_ENABLED;
  const appEnv = runtime.APP_ENV;
  const env = runtime.DB
      && runtime.BUCKET
      && (appEnv === "development"
        || appEnv === "staging"
        || appEnv === "production")
    ? {
      DB: runtime.DB,
      BUCKET: runtime.BUCKET,
      APP_ENV: appEnv,
      LEGAL_ADVICE_INGESTION_ENABLED:
        runtime.LEGAL_ADVICE_INGESTION_ENABLED ?? "false",
    }
    : undefined;
  return {
    enabled,
    env,
    sessionForRequest: localSessionForRequest,
  };
}
