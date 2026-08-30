# 07: Protect provider-bound questions

**What to build:** Ensure every formulation sent through the AI Search Adapter passes a deterministic privacy transform, while operational telemetry remains useful and content-free.

Blocked by: 06

Status: ready-for-agent

- [x] Direct names, contacts, addresses, personal/account/case/document identifiers, credentials, payment data, and legally irrelevant narrative are absent from the actual provider-bound request.
- [x] Legally material statuses, events, and dates remain available for retrieval after transformation.
- [x] The exact formulation preserves exact wording only after the privacy transform.
- [x] Secret-bearing input that cannot be transformed safely does not use indexed vector retrieval and continues through a safe Source Ladder outcome.
- [x] Telemetry contains only release identity, hashed correlation identity, counts, token usage, latency, safe provider status, and safe error class.
- [x] Gateway payload logging, Gateway caching, and AI Search similarity caching are disabled and configuration drift fails closed.
- [x] Tests inspect provider-bound requests and emitted telemetry in Russian, Uzbek, and English instead of testing only private transformation helpers.

## Comments

**Verification (2026-08-30):**

- Extended the pinned AI Search configuration contract with environment-specific Gateway/project identities and literal-disabled Gateway payload logging, Gateway caching, and similarity caching; any attested difference becomes configuration drift before search.
- Every formulation now crosses a deterministic NFC privacy boundary that removes multilingual names, contacts, addresses, personal/case/account/document identifiers, credentials, payment data, and labeled irrelevant narrative while preserving the tested legal events, statuses, and dates.
- PEM/private-key, provider-key, cloud-access-key, and JWT-shaped values that cannot be safely reduced are rejected with `PRIVACY_TRANSFORM_REJECTED`; the provider search count remains zero so the caller can continue the Source Ladder.
- Candidate telemetry is schema-limited to release identity, a SHA-256 correlation identity, formulation/instance/candidate counts, token usage, elapsed time, provider status, and a fixed safe error class. Provider queries, evidence, vectors, item keys, and user-linked identifiers are absent.
- Red evidence: `npx tsx --test tests/legal-candidate-index.test.ts` initially failed 13/14 runnable assertions because the configuration and telemetry seams were absent. Green evidence: the candidate suite passed 14/14, including actual Russian, Uzbek, and English provider requests and secret rejection.
- Combined candidate/evidence/storage/release/Worker regression passed 42/42; platform type-check, generated binding check, and the staging legal Worker dry-run all passed. No remote resource was mutated.

### Post-review correction verification (2026-08-30)

- Provider completeness evidence is now mandatory: omitted, duplicated, unknown, or missing `searchedInstanceIds` invalidates the entire Candidate Packet. More than ten instances execute in deterministic waves and are globally rank-fused rather than comparing provider-local scores.
- Unicode-aware provider-bound tests now cover unlabelled Russian personal names and ordinary street addresses in addition to labelled multilingual facts. JavaScript ASCII word-boundary behavior was explicitly avoided with Unicode letter lookarounds.
- The focused Ticket 07 candidate suite passes all privacy, completeness, cache/configuration, telemetry, and secret-rejection cases.
- Final spec review found that the broad unlabelled-name heuristic also removed a title-cased legal act name. The transform now preserves legally structured title phrases such as `Labor Code` and `Civil Procedure Code` while still removing an unlabelled `Ivan Petrov`; the provider-request regression proves both outcomes in the same formulation.
- Final standards review also consolidated the provider configuration into one exported schema/conversion and the ten telemetry branches into one request-scoped, content-free outcome emitter.

### Final privacy-boundary verification (2026-08-31)

- The interpreter/provider contract now carries explicit structured `legalTitleSpans`. Only titles authenticated against the trusted legal-Instrument titles reachable from the pinned local D1 Search Release are protected during transformation; title-like personal data is not preserved by an interpreter label or topic allowlist.
- The provider-bound regression proves `Labor Code`, `Civil Procedure Code`, and `Companies Act` remain exact while adjacent `Ivan Petrov` is removed. A forged `John Law` title label fails closed before provider search.
- Candidate release/configuration/instance/shard identities and provider-returned identifiers are parsed through branded schemas at the adapter boundary. The complete target feature suite passed 86/86 and platform type-check/lint passed; no remote resource was mutated.

### Independent spec-review closure (2026-08-31)

- Provider formulations require an explicit `privateNameSpans` classification. Declared names must be bounded Unicode spans in the source formulation and cannot overlap authenticated legal-title spans; missing or contradictory classification fails closed through Source Unavailability before provider search.
- Privacy does not trust that interpreter classification to be complete. Before AI Search, a trusted private service-binding classifier must return a strict `complete` attestation bound to the SHA-256 of the exact normalized formulation and the pinned `juro-local-pii-v1` policy; uncertainty, malformed evidence, hash mismatch, or classifier-version drift fails closed. Its spans are combined with interpreter declarations, while the conservative unlabelled fallback remains multi-token-only.
- Provider-request regressions deliberately supply empty interpreter span arrays and prove classified names are removed in English subject/object/possessive positions, Russian object position, and Uzbek postpositional form. They also prove `John` is removed beside the authenticated `Companies Act`, while sentence-initial legal facts `Dismissal`, `Pregnancy`, `Увольнение`, and `Homiladorlik` remain intact. An uncertain classifier attestation performs zero provider searches.
- The final target feature suite passed 90/90 after the correction. No remote resource was mutated.
