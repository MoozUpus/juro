# 04: Resolve a Controlling Text and Official Translation

**What to build:** Extend the one-provision tracer to a multilingual Legal Instrument whose user-language expression is a translation. Retrieval may use that translation for discovery and presentation, but a material proposition must resolve to the evidenced Controlling Text.

Blocked by: 03

Status: ready-for-agent

- [x] Official Expressions record language/script, textual authority, origin, publication status, controlling-on-conflict behavior, derivation, and authority evidence.
- [x] Uzbek Latin and Uzbek Cyrillic authority is decided from evidence for the Text Revision rather than from script preference or route prefix.
- [x] Russian and English expressions are labeled translations and cannot independently resolve a conflict with a Controlling Text.
- [x] A Russian-language retrieval can present a labeled Russian translation while the material proposition and Citation resolve to controlling Uzbek evidence.
- [x] Unknown textual authority fails Official Eligibility and continues the Source Ladder instead of silently selecting a preferred language.
- [x] Tests cover controlling/translation disagreement, historical Cyrillic originals, misleading route-language prefixes, and absent controlling evidence.

## Comments

**Verification (2026-08-30):**

- `legal-drizzle/0003_textual_authority.sql` persists expression- and revision-level script, textual authority, origin, publication status, derivation, controlling-on-conflict, and explicit authority evidence without adding body text to D1.
- The Official Evidence resolver selects one eligible, authority-evidenced Controlling Text for the shared Provision Concept; a discovered Russian translation is returned only as a labeled `Official Translation`, while the material Citation and proposition use the controlling rendition.
- Revision evidence—not language, script preference, route prefix, or article-number coincidence—drives selection. Unknown authority writes an explicit ineligible finding with `TEXTUAL_AUTHORITY_UNKNOWN` and yields Source Unavailability.
- The target evidence suite passed 9/9, including a deliberately disagreeing Russian translation, a historical Uzbek Cyrillic adopted original served through a misleading `/ru/` route, and missing authority evidence.
- Platform type-check, legal Worker dry-run, and target/Worker regression group passed (26/26). No remote resource was mutated.
