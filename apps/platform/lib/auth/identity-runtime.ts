import {
  createIdentityProtectionContext,
  type IdentityProtectionContext,
} from "./identity-protection";
import { runtimeEnv } from "../document-builder/storage/runtime";

export function runtimeIdentityProtection(): IdentityProtectionContext {
  const env = runtimeEnv();
  return createIdentityProtectionContext(
    env.IDENTITY_PROTECTION_MODE,
    env.IDENTITY_KEYRING,
  );
}

/**
 * Authentication codes are low-entropy credentials and must always use the
 * server-held keyring, independently from the gradual identity-encryption
 * rollout mode. Legacy rows without keyed evidence remain verifiable until
 * their short expiry through the challenge compatibility path.
 */
export function runtimeOtpProtection(): IdentityProtectionContext {
  return createIdentityProtectionContext(
    "dual_write",
    runtimeEnv().IDENTITY_KEYRING,
  );
}
