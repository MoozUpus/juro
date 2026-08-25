# Codex Security Standard scan — e4f407a8

## Result

| Field | Verified value |
| --- | --- |
| Scan ID | `df6f1247-116c-42b8-b233-a693efb52263` |
| Immutable target | `e4f407a8b9fba0db8cac1a3cde681460ab58132f` |
| Mode | Standard whole-repository scan |
| Tracked inventory | 1,898 files |
| Planned surfaces | 8/8 closed |
| Reportable findings | 0 |
| Coverage classification | PARTIAL |

Zero reportable findings means no candidate survived discovery, validation and
reportability gates within the reviewed boundary. It does not mean the entire
system is proven vulnerability-free.

## Reviewed surfaces

1. Public site and anonymous telemetry.
2. Sessions, OTP, MFA and cross-domain routing.
3. Tenant workspaces, cases, search and business routes.
4. Private documents, uploads, signed shares and R2.
5. AI providers, prompt boundaries, legal sources and citation validation.
6. Lawyer messaging, calls, signaling and access grants.
7. Admin, billing, pricing and audit controls.
8. Worker routing, Queues, status, deployment, secrets and supply chain.

The review included repository security policies, Worker routing and security
headers, server authorization and tenant scoping, prepared-statement and
dangerous-sink searches, runtime flags, tracked secret-pattern searches,
per-application production dependency audits and focused regression tests.

## Dependency calibration and hardening

The immutable target resolved advisory-affected PostCSS and Sharp versions.
Reachability review rejected them as reportable production vulnerabilities:
JURO does not accept untrusted CSS for build processing, public `next/image`
usages are unoptimized, and the deployed Vinext image path uses Cloudflare
Images rather than Sharp. The working tree still upgrades PostCSS to `8.5.23`
and Sharp to `0.35.3`, closing the dependency-hygiene gap. See the upstream
[PostCSS advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) and
[Sharp advisory](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).

Verified after the override:

- production `npm audit`: 0 vulnerabilities;
- website tests: 42 passed, 0 failed;
- type-check: pass;
- lint: pass;
- licence policy: pass across 716 locked packages;
- production artifact validation: pass.

## Limitations and follow-up gates

- Independent delegated baseline and focused workers were unavailable under
  host policy.
- TAC was not authenticated.
- No destructive, high-volume or malware production traffic was generated.
- Remote URL document import is disabled in every checked environment. Before
  enabling it, re-run SSRF and DNS-rebinding validation against the exact
  Cloudflare egress path.
- Provider-side retention and regional handling for voice transcription and
  synthesis remain an operational privacy assurance question.
