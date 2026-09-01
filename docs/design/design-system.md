# JURO Design System

Status: **canonical repository index; implementation is incremental**

The detailed platform specification is maintained in [`apps/platform/docs/ai-platform/DESIGN-SYSTEM.md`](../../apps/platform/docs/ai-platform/DESIGN-SYSTEM.md). This file fixes the cross-application contract required by the execution brief.

## Brand foundation

| Role | Reference | Use |
| --- | --- | --- |
| JURO navy | `#062844` | identity, primary light-surface actions, controlled shell regions |
| JURO gold | `#BE974F` | rare brand/selected emphasis, never dense body text |
| warm background | `#F8F6F2` | application background and quiet public surfaces |
| reading surface | white/warm white | legal answers, documents, forms, and tables |

Serif typography is reserved for selected high-level public or editorial headings. Application navigation, controls, forms, data, and long legal text use a modern sans-serif stack. Color never acts as the only state signal.

## Shared interaction contract

- visible keyboard focus with sufficient contrast;
- minimum 44 px primary touch targets where the interface is touch-oriented;
- explicit loading, empty, error, disabled, success, warning, and destructive states;
- `prefers-reduced-motion`, forced-colors, zoom/reflow, and RU/UZ expansion support;
- no `transition: all`, infinite decorative motion, or layout-shifting entrance animation;
- dialogs trap and restore focus; status changes use appropriate live regions;
- long legal reading widths remain bounded and do not become card walls.

## Surface modes

| Mode | Surfaces | Density and motion |
| --- | --- | --- |
| Orient | dashboard entry, onboarding, AI start | moderately expressive, purposeful state transitions |
| Read | Legal Answer, knowledge, document review | quiet, bounded line length, evidence-first |
| Work | cases, plans, builder, comparison, lawyer workspace | compact, predictable, low motion |
| Operate | admin, moderation, audit, jobs, costs | dense, explicit, minimal motion |

## Change gate

A global token or shared-component change requires rendered route, RU/UZ, focus, reduced-motion, narrow-width, and artifact-budget checks. A source-level token table alone is not visual approval.
