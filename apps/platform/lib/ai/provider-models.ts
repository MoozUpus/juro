/**
 * Conservative provider fallbacks for missing optional runtime variables.
 *
 * Deployment configuration still takes precedence. Keep this value aligned with
 * the checked-in staging configuration and change it only with provider
 * capability review plus the contract/evaluation suite.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";