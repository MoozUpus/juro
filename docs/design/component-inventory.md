# JURO component inventory

Status: **VERIFIED for commit `beae3e05`; behavior coverage remains partial**

Evidence cutoff: **2026-09-01**

## Inventory summary

| Group | TSX files | Primary role |
| --- | ---: | --- |
| `app/_auth` | 3 | OTP/login and authentication presentation |
| `app/_document-builder` | 32 | document creation, review, comparison, and versions |
| `app/_guest` | 1 | anonymous product entry |
| `app/_platform` | 53 | shared shell and client/business/lawyer product modules |
| `app/_staff` | 20 | admin and operational consoles |
| `app/_status` | 1 | public-safe service status |
| `app/_theme` | 1 | shared theme synchronization |
| **Total** | **111** | shared/shell components |

The same commit contains 165 `page.tsx` route definitions, 233 API `route.ts` definitions, 38 CSS files under `apps/platform`, and 225 platform test files. These counts are reproducible inventory facts, not a coverage score.

## High-impact shared components

- `PlatformShell.tsx` and `WorkspaceShellLayout.tsx`: navigation, role/workspace framing, and responsive shell.
- `SafeMarkdown.tsx` and `LegalAnswerView.tsx`: AI text rendering and legal-source presentation.
- `AiLawyerClient.tsx`: main legal AI interaction.
- `DocumentComparisonClient.tsx`, `ComparisonResultClient.tsx`, and document-builder components: document workflows.
- `LawyerDirectoryClient.tsx`, `LawyerWorkspaceClient.tsx`, and marketplace components: lawyer journey.
- `ProductMetricsConsole.tsx`, `JobOperationsConsole.tsx`, and staff consoles: privileged operations.

## Inventory maintenance rule

Refresh the counts and the high-impact list whenever a route family or shared component group changes. Component presence must be paired with its role, permissions, locale, responsive behavior, and test evidence before it is counted as complete.
