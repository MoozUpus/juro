# JURO Component Inventory

Status: **source inventory at v99; visual-state coverage remains partial**

## Component families

| Root | TSX files | CSS files | Primary responsibility |
| --- | ---: | ---: | --- |
| `apps/platform/app/_platform` | 53 | 29 | shell, dashboard, AI, cases, plans, lawyers, billing, search, help, settings |
| `apps/platform/app/_document-builder` | 32 | 1 | questionnaire, configurable builder, preview, collaboration, versions, documents, sharing |
| `apps/platform/app/_staff` | 19 | 1 | admin access, quality, costs, audit, jobs, sources, moderation, support, status |
| `apps/website/app` | 27 | 18 | localized public site routes and public marketing/legal content |

Counts describe files, not unique reusable components or quality scores.

## Shared high-impact components

- navigation/layout: `PlatformShell`, `WorkspaceShellLayout`, `PlatformRouteContext`, `SidebarSectionLabel`;
- Legal Answer and safe content: `LegalAnswerView`, `SafeMarkdown`, `AiLawyerClient`;
- cases/actions: `CasesClient`, `CaseWorkspaceClient`, `ActionPlanClient`, `CalendarClient`;
- document work: `DocumentBuilderClient`, `ConfigurableDocumentBuilder`, `DocumentPreview`, `DocumentReviewClient`, `DocumentComparisonClient`;
- lawyer journey: directory, profile, request, consultation, handoff, message, review, phone-consent, and workspace clients;
- operations: access, AI quality/settings, costs, audit, jobs, feature flags, moderation, support, and status consoles.

## Consolidation findings

- `apps/platform/app/_platform` has the highest CSS fragmentation and is the first candidate for semantic primitives and state normalization;
- document-builder components already share one principal CSS surface and should not be split into unrelated visual systems;
- staff consoles intentionally use a dense Operate mode and should reuse form/table/state primitives without inheriting public-site presentation;
- route-level clients remain domain components; extracting them into generic components is justified only when behavior, accessibility, and state contracts genuinely match.

## Required follow-up evidence

Storybook is not treated as required because the repository does not currently use it as a release authority. The next consolidation pass must inventory duplicate button, field, dialog, table, badge, toast, skeleton, and empty-state implementations and prove replacements through rendered and visual regression tests.
