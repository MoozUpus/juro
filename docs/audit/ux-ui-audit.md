# JURO UX/UI Audit

Status: **living source and evidence index; not a current full visual approval**

## Product direction

JURO uses a controlled navy/gold identity around light, reading-first legal work surfaces. Legal content, evidence, deadlines, and current case context must outrank decoration. The canonical detailed specification is [`DESIGN-SYSTEM.md`](../../apps/platform/docs/ai-platform/DESIGN-SYSTEM.md); the earlier measured audit is [`DESIGN-AUDIT.md`](../../apps/platform/docs/ai-platform/DESIGN-AUDIT.md).

## Verified contracts in the current codebase

- one shared platform shell serves Client, Business, Lawyer, and protected staff surfaces;
- long legal content uses structured product-owned sections rather than model-selected page hierarchy;
- primary mobile navigation, visible focus rules, reduced-motion handling, loading/error/empty states, and RU/UZ copy have automated regression coverage;
- public site and platform share the JURO identity while preserving the indexable-public/private-application boundary;
- document-builder, case, lawyer, admin, and status modules use real routes and server APIs rather than decorative mock actions.

## Open UX evidence

- authenticated first-value journeys for each role;
- current screenshots and visual comparison across all required viewports;
- manual keyboard, screen-reader, zoom, mobile-keyboard, and touch-target checks;
- route-by-route confirmation that loading, empty, error, disabled, success, warning, and destructive states remain consistent;
- measured validation that motion does not worsen Core Web Vitals or document reading.

## Decision rules

1. Preserve the existing server-enforced auth, tenant, AI, document, and lawyer workflows.
2. Use semantic tokens and layout primitives; do not perform global color replacement.
3. Keep frequent legal-work actions immediate. Add motion only when it explains a state or relationship.
4. Never label a source, result, review, payment, or lawyer as verified from appearance alone.
5. Mark every route `PARTIAL` until its significant authenticated and failure states are exercised.
