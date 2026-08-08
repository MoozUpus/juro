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
