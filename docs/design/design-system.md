# JURO design system index

Status: **PARTIAL adoption; canonical source mapped**

Evidence cutoff: **2026-09-01**

## Canonical contract

The detailed platform contract is [`apps/platform/docs/ai-platform/DESIGN-SYSTEM.md`](../../apps/platform/docs/ai-platform/DESIGN-SYSTEM.md). It defines semantic colors, typography, spacing, shape, depth, component behavior, state announcements, responsive gates, accessibility expectations, and motion budgets. v113 makes this required root path the stable index without duplicating the detailed specification.

## Implementation anchors

| Concern | Source |
| --- | --- |
| Global tokens and application styles | `apps/platform/app/globals.css` |
| Shared platform shell | `apps/platform/app/_platform/PlatformShell.tsx` |
| Theme synchronization | `apps/platform/app/_theme/` |
| Authentication UI | `apps/platform/app/_auth/` |
| Document-builder UI | `apps/platform/app/_document-builder/` |
| Staff/admin UI | `apps/platform/app/_staff/` |
| Status UI | `apps/platform/app/_status/` |
| Motion guidance | `apps/platform/docs/ai-platform/MOTION-GUIDELINES.md` |

## Release rule

A component is not considered migrated merely because it renders with shared CSS. It must also preserve locale, focus, keyboard, reduced-motion, responsive, loading, empty, error, permission, and privacy behavior. Full component-by-component adoption remains `PARTIAL` until the authenticated visual/accessibility matrix passes.
