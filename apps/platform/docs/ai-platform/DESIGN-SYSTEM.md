# JURO platform design system

## Help and knowledge-base surface

Help uses `Read` mode inside the existing application shell. Search and article
metadata lead; long text is constrained to `72ch`, uses the light reading
surface and separates sections with rules rather than nested cards. The public
index shares the same typography and navy/gold identity without importing a
marketing hero into the product.

The purposeful-animation pass rejected page-load reveals, stagger, accordion
motion and decorative cinematic effects. Only existing press feedback and a
fine-pointer arrow translation remain; reduced motion removes the translation.
Search, retry, related links and helpfulness controls are at least 44 px, have
visible focus, text labels and live status. Loading, no-result and recoverable
error states are explicit in both languages.

Updated: 2026-07-30
Status: implemented as a scoped staging-only prototype; production UI is unchanged and replacement is not authorized.

## Purpose and scope

This system translates **Cinematic Legal Intelligence** into a functional application. It creates a dark, controlled orientation shell around light, stable legal work surfaces. It does not turn the dashboard into a landing page and never allows styling, animation, or Jurobek to outrank legal content, evidence, uncertainty, deadlines, or the user's current object context.

The contract is implemented on staging-only routes `/:locale/:accountType/prototypes/platform/cinematic` and `/:locale/business/:workspaceId/prototypes/platform/cinematic`. An exact server environment guard fails closed outside staging, both routes require a real session, and existing production routes retain their current CSS until the owner separately approves visual replacement.

## Current-state defect

`app/globals.css` currently declares one legacy brand `:root` and a second unscoped JURO 2.0 `:root`. The later declaration changes navy, gold, paper, shadow, and both type families for every route; an adjacent global `body` rule also leaks a marketing surface into authentication and platform workspaces. Component files then add many literal colors, radii, and shadows.

Normalization must:

1. preserve the current production selectors while the prototype is isolated;
2. introduce semantic tokens under the prototype/application boundary;
3. migrate shared components by role rather than find-and-replace color values;
4. remove the duplicate global override only during the separately approved production migration;
5. verify each migrated route with visual, contrast, focus, reduced-motion, RU/UZ, and responsive tests.

## Semantic color contract

CSS uses kebab-case variables; the product vocabulary remains the dotted role shown in the first column.

| Semantic role | CSS variable | Candidate value | Use |
|---|---|---:|---|
| `brand.navy` | `--juro-brand-navy` | `#062844` | identity, primary light-surface action |
| `brand.gold` | `--juro-brand-gold` | `#BE974F` | rare brand highlight, premium/selected emphasis |
| `brand.warm` | `--juro-brand-warm` | `#F8F6F2` | warm application background |
| `background.cinematic` | `--juro-bg-cinematic` | `#041F35` | shell/navigation/AI entry only |
| `background.default` | `--juro-bg-default` | `#F8F6F2` | ordinary route background |
| `surface.primary` | `--juro-surface-primary` | `#FFFFFF` | forms, panels, tables |
| `surface.secondary` | `--juro-surface-secondary` | `#F1F3F2` | grouped controls and quiet regions |
| `surface.elevated` | `--juro-surface-elevated` | `#FFFFFF` | dialogs, drawers, popovers |
| `surface.reading` | `--juro-surface-reading` | `#FFFEFC` | long legal answers and sources |
| `surface.document` | `--juro-surface-document` | `#FFFFFF` | document page/canvas |
| `surface.analysis` | `--juro-surface-analysis` | `#F4F6F5` | analysis navigation and evidence rails |
| `text.primary` | `--juro-text-primary` | `#102333` | primary text; 16.03:1 on white |
| `text.secondary` | `--juro-text-secondary` | `#435867` | secondary text; 7.42:1 on white |
| `text.inverse` | `--juro-text-inverse` | `#FFFFFF` | text on navy; 15.06:1 |
| `text.inverse.secondary` | `--juro-text-inverse-secondary` | `#DCE6EC` | secondary shell text |
| `text.inverse.muted` | `--juro-text-inverse-muted` | `#B3C3CD` | noncritical shell metadata only |
| `text.muted` | `--juro-text-muted` | `#5E6E79` | noncritical metadata; 5.27:1 on white |
| `border.default` | `--juro-border-default` | `#D7DCD9` | ordinary separation |
| `border.strong` | `--juro-border-strong` | `#9BA8AF` | decorative structural separation; never the sole control/selected cue |
| `border.interactive` | `--juro-border-interactive` | `#36566F` | control/selected outline; 7.73:1 on white, 6.93:1 on secondary |
| `border.shell` | `--juro-border-shell` | `#8FA7B7` | shell boundary; 6.69:1 on cinematic |
| `focus.ring` | `--juro-focus-ring` | `#8A641A` | 3 px focus indicator; 5.36:1 on white |
| `focus.ring.inverse` | `--juro-focus-ring-inverse` | `#FFD88A` | 3 px focus indicator; 12.33:1 on cinematic |
| `accent.primary` | `--juro-accent-primary` | `#062844` | ordinary primary action |
| `accent.hover` | `--juro-accent-hover` | `#0A3558` | fine-pointer hover only |
| `accent.active` | `--juro-accent-active` | `#041E33` | pressed/active action |
| `accent.disabled` | `--juro-accent-disabled` | `#D7DCD9` | disabled fill; paired with text and disabled semantics |
| `accent.on-disabled` | `--juro-accent-on-disabled` | `#435867` | disabled label/icon; 5.35:1 on disabled fill |
| `accent.subtle` | `--juro-accent-subtle` | `#EEE4D1` | selected background, never sole state cue |
| `risk.critical` | `--juro-risk-critical` | `#7F1D1D` | critical legal risk with icon/text |
| `risk.high` | `--juro-risk-high` | `#9F2D2D` | high legal risk with icon/text |
| `risk.medium` | `--juro-risk-medium` | `#854D0E` | medium legal risk with icon/text |
| `risk.low` | `--juro-risk-low` | `#166534` | low risk with icon/text |
| `status.success` | `--juro-status-success` | `#166534` | completed/safe state |
| `status.warning` | `--juro-status-warning` | `#854D0E` | warning/stale/attention state |
| `status.error` | `--juro-status-error` | `#B42318` | error/failure state |
| `status.info` | `--juro-status-info` | `#175CD3` | neutral informational state |
| `overlay.scrim` | `--juro-overlay-scrim` | `rgb(4 31 53 / 62%)` | dialog/drawer scrim |
| `light.shell.gold` | `--juro-light-shell-gold` | `rgb(190 151 79 / 18%)` | one controlled shell-level light, never component glow |

Risk and status pairings are normative rather than implementation-selected:

| Role | Surface token/value | On-surface token/value |
|---|---|---|
| critical | `--juro-risk-critical-surface: #FEE4E2` | `--juro-risk-critical-on-surface: #7F1D1D` |
| high | `--juro-risk-high-surface: #FEF3F2` | `--juro-risk-high-on-surface: #9F2D2D` |
| medium | `--juro-risk-medium-surface: #FEF0C7` | `--juro-risk-medium-on-surface: #854D0E` |
| low | `--juro-risk-low-surface: #DCFCE7` | `--juro-risk-low-on-surface: #166534` |
| success | `--juro-status-success-surface: #DCFCE7` | `--juro-status-success-on-surface: #166534` |
| warning | `--juro-status-warning-surface: #FEF0C7` | `--juro-status-warning-on-surface: #854D0E` |
| error | `--juro-status-error-surface: #FEE4E2` | `--juro-status-error-on-surface: #B42318` |
| info | `--juro-status-info-surface: #EAF2FF` | `--juro-status-info-on-surface: #175CD3` |

Each pair passes WCAG 2.2 AA for normal text and must include text and/or an icon. Color is never the sole signal.

Gold text on warm/white backgrounds is not accessible for body copy (`#BE974F` on `#F8F6F2` is approximately 2.52:1). Gold remains decorative or paired with navy text; small semantic labels use the darker focus/accent tone. `border.default` and `border.strong` are decorative; interactive boundaries use `border.interactive` or another tested non-color cue.

Focus treatment is mapped by the surrounding surface, not by the control fill:

| Surrounding surface | Indicator | Required implementation |
|---|---|---|
| `background.default`, `brand.warm`, and all light work surfaces | `focus.ring` | `3px` solid outline with `3px` offset; the offset isolates the ring from a dark control fill |
| `background.cinematic` and other navy shell surfaces | `focus.ring.inverse` | `3px` solid outline with `3px` offset; the offset isolates the ring from a light control fill |
| Boundary between unlike surfaces | explicit two-layer treatment validated for those exact colors | do not inherit a single ring token; keep at least 3:1 at both ring edges and preserve a non-color shape cue |

The regular ring is not allowed directly against navy (`2.81:1`), and the inverse ring is not allowed directly against white/light work surfaces (`1.22–1.36:1`). Components that cross a surface boundary need an explicitly tested two-layer recipe, for example white isolation plus navy outer ring on a light canvas, or navy isolation plus inverse outer ring on the shell. Final values require browser contrast verification in every rendered state, including hover and selected fills.

## Typography

- `--juro-font-ui`: current loaded candidate `var(--font-geist-sans), "Segoe UI", Arial, sans-serif`. `app/layout.tsx` currently requests only the Latin Geist subset, so Cyrillic and Uzbek rendering may fall back and must be verified before the prototype claims font consistency. Manrope or Inter requires a separately approved, licensed load and is not treated as currently loaded.
- `--juro-font-brand`: existing `Georgia, "Times New Roman", serif` fallback, restricted to brand/editorial headings where Cyrillic and Uzbek glyph rendering is verified.
- Forms, chat, analysis, tables, builder, calendar, admin, metadata, and code always use the UI stack.
- Legal reading width targets `65–78ch`; source excerpts and long answers use at least `1.55` line-height.
- Meaningful legal, source, risk, validation, and error text starts at `0.875rem` with at least `1.4` line-height. `0.75rem` is reserved for nonessential labels that remain understandable when omitted and must still pass zoom and contrast tests.
- Only dashboard/AI-entry brand headings use fluid `clamp()` sizing. Working-route headings remain compact and stable.

## Spacing, shape, and depth

- Named spacing tokens are `--juro-space-1: .25rem`, `--juro-space-2: .5rem`, `--juro-space-3: .75rem`, `--juro-space-4: 1rem`, `--juro-space-6: 1.5rem`, `--juro-space-8: 2rem`, and `--juro-space-12: 3rem`.
- Touch/pointer target floor: `2.75rem` (44 px at the default root size).
- Radius tokens are `--juro-radius-annotation: 6px`, `--juro-radius-control: 10px`, `--juro-radius-panel: 14px`, and `--juro-radius-major: 18px`. Pills are reserved for tags, status, and compact segmented controls.
- Borders provide ordinary hierarchy. Shadows are fixed tokens rather than component-local values: `--juro-shadow-overlay: 0 24px 72px rgb(4 31 53 / 28%)`, `--juro-shadow-entry: 0 20px 48px rgb(4 31 53 / 22%)`, and `--juro-shadow-document: 0 8px 24px rgb(16 35 51 / 12%)`. They are limited respectively to overlays, the compact cinematic entry surface, and one quiet document-page shadow.
- No cards inside cards solely for decoration. Use grouping, rules, headings, and whitespace before another container.
- Gold glow is a shell-level light token, not a per-component effect.

## Component behavior

### Application shell

- Desktop: stable sidebar, contextual top bar, visible workspace/profile and current-case context, notification center, tariff/usage entry, and fast AI entry.
- Tablet: compact navigation without changing the order or meaning of primary actions.
- Mobile: five-item bottom navigation (`Главная`, `AI`, `Документы`, `Дела`, `Профиль`) plus an accessible `Ещё` surface.
- Global search exposes scope and permission context; results never reveal inaccessible object existence.
- Contextual breadcrumbs appear where they materially improve orientation and use the same hierarchy across neighboring routes.
- Active navigation is conveyed by label, shape, and optional icon treatment in addition to color.
- Navigation placement and primary action order remain stable between neighboring sections and without animation.
- The public-site → localized authentication → platform transition must preserve brand color, type logic, tone, and motion vocabulary without importing marketing sections into the dashboard. Prototype work does not modify `apps/website`, production auth, or production platform routes.

### Dashboard

The cinematic entry zone is compact. It contains greeting/current context, one fast AI entry, one suggested next action, the nearest critical deadline, controlled Jurobek/static fallback, and voice-mode entry when enabled. At 320–390 px, the nearest deadline/next action gets first-view priority; clear navigation exposes cases, tasks, documents, analyses, calendar, lawyer requests, notifications, usage, and tariff without forcing all regions above the fold.

### AI and legal evidence

- Long AI output sits on `surface.reading`; chat chrome may remain inside the cinematic shell.
- Confirmed findings, assumptions, risks, sources, action plan, deadlines, and provider details are structurally distinct.
- A score cannot be the first or largest risk signal. Evidence, severity, uncertainty, consequence, and next action precede it.
- Streaming reserves stable space, exposes stop/retry/partial recovery, and announces useful status without reading every token to assistive technology.
- Until the owner-approved rigged asset exists, plain voice remains functional and may use the canonical existing static Jurobek poster only as a nonanimated identity/fallback surface; the `voice-with-avatar` feature remains off. The current generic `.digital-face` is not migrated. There is no fake lip-sync, listening indicator, or speaking state: each must follow the actual microphone, transcription, processing, and audio lifecycle.

### Documents and analysis

- Reading canvas is light with a neutral surrounding surface; no animated texture sits under document text.
- Source/risk panels maintain a visible relationship to the selected clause and remain available as accessible drawers on narrow screens.
- Consequential changes use review (`old → new → impact → source → confirm`) and create immutable versions.
- Tables and dense admin surfaces favor rules, sticky headers where useful, and keyboard efficiency over cinematic decoration.

### Dialogs, drawers, menus, tabs, and toasts

Use accessible primitives already present or a single justified primitive library selected after `package.json` review. Required behavior includes semantic role/name, initial focus, focus trap where appropriate, Escape, focus restoration, scroll containment, outside-click rules, keyboard tab/arrow contracts, and screen-reader status. A visible result remains in-page when a toast alone would be insufficient.

## Motion tokens and budget

```text
--juro-motion-press: 140ms
--juro-motion-fast: 160ms
--juro-motion-base: 220ms
--juro-motion-panel: 260ms /* drawer/modal entry exception only */
--juro-motion-exit-fast: 120ms
--juro-motion-exit: 160ms
--juro-ease-out: cubic-bezier(0.23, 1, 0.32, 1)
--juro-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)
--juro-ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)
```

- Press feedback may use `scale(.98)` for suitable pressables.
- CSS handles hover/press/focus; hover motion is gated by `(hover: hover) and (pointer: fine)`.
- Tooltip/small popover: 160 ms enter, 120 ms exit. Menu/select: 180 ms enter, 140 ms exit. Source/context panel: 220 ms enter, 160 ms exit. Drawer/modal: 240–260 ms enter, 160–180 ms exit. Avatar state crossfade: 220 ms enter, 160 ms exit. Exit is always faster than enter.
- Transitions are interruptible: a new user action cancels or reverses the current transition from its rendered state, never queues a second sequence, blocks input, or waits for a marketing animation.
- No `transition: all`, `ease-in` UI entrance, layout-property animation, row-by-row table animation, scroll hijacking, or repeated decorative stagger.
- Frequent keyboard/document actions are immediate.
- Jurobek motion is disabled until the approved rig exists; the approved static poster and truthful textual state remain canonical. Generic AI avatars are prohibited.
- `prefers-reduced-motion: reduce` removes tracking, parallax, springs, large translation, and character sequences, while preserving state, status, focus, and a short color/opacity response.
- `prefers-contrast: more` increases structural boundaries and removes low-contrast light effects. `forced-colors: active` preserves native focus, control, link, selected, and error semantics instead of forcing brand colors.
- `Save-Data`, unavailable WebGL, context loss, device limitation, or 3D load failure keeps text/voice functional and selects the static poster. Closing voice/avatar mode must stop media tracks, audio, animation loops, observers, and listeners and dispose GPU resources. `JUROBEK-3D.md`, `VOICE-AVATAR.md`, `3D-PERFORMANCE.md`, and `WEBGL-FALLBACK.md` become authoritative when those implementation documents exist.

## State and announcement contract

Every migrated surface must define loading/skeleton, first-use, empty, success, partial success, recoverable error, fatal error, offline, stale data, permission denied, plan limit, processing, cancelled, retry, and archived states. A state may be structurally impossible for a particular component only when the component contract records why.

- Skeletons match the geometry of the content they replace and do not impersonate completion.
- Streaming announces meaningful phase changes and completion, not every token.
- Upload/analysis announces stage changes, errors, and completion, not every percentage update.
- Avatar/voice announces actual idle, ready, listening, transcribing, thinking, speaking, paused, completed, offline, and error states; animation is never the only signal.
- Recoverable errors keep user input and expose retry. Fatal errors expose a safe route away and a correlation ID without secrets.
- Offline/stale/partial states visibly distinguish cached or incomplete evidence from current verified data.
- Permission and plan-limit states do not disclose inaccessible object existence and provide only authorized next actions.

## Responsive and accessibility gates

Minimum verification widths: 320, 360, 390, 768, 1024, 1280, and 1440+. RU and UZ Latin must pass at every breakpoint, including 200% text zoom. No horizontal scrolling is allowed except an intentional data/table region with an accessible alternate view.

Every migrated surface requires semantic landmarks/headings, logical focus order, visible focus, 44 px targets, accessible names/descriptions, error association, status announcements, keyboard parity, focus restoration, the full state contract above, and WCAG 2.2 AA contrast. RU/UZ `lang` must be correct in the initial server-rendered `<html>` and remain correct without client JavaScript; the current root-layout client repair is not sufficient. Motion and WebGL are progressive enhancements, never information channels.

## Component migration order

1. isolated token scope and base focus/motion primitives;
2. shell navigation, current context, mobile bottom navigation, drawers, and search;
3. dashboard entry and real working-data regions;
4. AI chat/source/risk/plan surfaces;
5. document builder, analysis, comparison, cases, and calendar;
6. onboarding, settings, lawyer handoff, support, and empty/error states;
7. dense admin surfaces;
8. production migration only after prototype approval, visual regression, accessibility, performance, and rollback evidence.

## Evidence boundary

The token candidates were contrast-calculated, and a bounded browser pass exists for the current builder, but font metrics, forced/high contrast, focus visibility over every adjacent color, zoom, motion, touch, GPU/memory, and visual regression remain open until the staging route is implemented and the full matrix passes. This document defines what to implement and test; it does not claim that production already uses the system.

## Dense staff surface implementation

The inactive legal-source review inbox is the first implemented admin-density
surface. It deliberately uses the staff profile `variance 2 / motion 1 /
density 9` rather than the cinematic customer shell.

| Before | After | Why |
|---|---|---|
| No operator surface for the locally implemented review services | Separate RU/UZ staff route with bounded list, filters, review canvas, decision, and publication states | Joins real service behavior without placing staff duties in a tenant shell |
| Review data available only through service tests | Dense metadata table that becomes stacked labeled records below 600 px | Preserves scanning efficiency on desktop and removes mobile horizontal dependency |
| Normalized evidence inspectable only in R2/service output | Light reading canvas with staged 80-block rendering and exact hashes in disclosure | Long legal text remains readable without mounting thousands of blocks at once |
| No motion contract for the staff workflow | Immediate filters/actions, small press feedback, progress spinner only, reduced-motion removal | State and task completion are clear without decorative animation |

The surface maps local semantic variables to navy shell, neutral work surface,
white reading canvas, muted structural border, rare gold accent, and functional
success/warning/error colors. No font, motion, table, state, or UI dependency was
added. Full browser/contrast/zoom/forced-colors verification remains a staging
gate and is not claimed by this implementation record.

Static sRGB contrast calculations for the implemented staff pairs are:
accent/white `5.08:1`, muted/white `5.05:1`, white/navy `17.62:1`,
error/error-surface `6.51:1`, warning/warning-surface `4.94:1`, and
success/success-surface `5.27:1`. The light-surface focus outline is `6.34:1`
against white; the topbar focus outline is `11.77:1` against navy. These
calculations cover declared pairs, not a complete browser contrast audit.

## Document correction review surface

The analysis correction candidate follows the legal-work profile: design
variance 3/10, motion 2/10 and density 8/10. It keeps the cinematic shell outside
the reading canvas, uses a warm light work surface, side-by-side old/new text on
wide screens and a single column on narrow screens. Status is expressed by text
plus color; gold is limited to focus/controlled action; every control is at least
44 px and has a visible focus ring. Loading, empty, recoverable error, success,
partial, stale, ambiguous, accepted, rejected and applied states have explicit
RU/UZ copy. Authenticated staging browser, 200% zoom, forced-colors and touch QA
remain open until migration 0069 is authorized and deployed.

## Document case selector review

This Phase 6 surface uses the legal-work profile: design variance 3/10, motion
2/10 and density 8/10. The control stays beside the document it changes, reuses
the established light reading surface and native select behavior, and introduces
no UI or motion dependency.

| Before | After | Why |
|---|---|---|
| Existing documents could not be attached to or moved between cases | Owner-only RU/UZ case selector inside each active document row | Direct mapping keeps the action near its object and avoids a modal detour |
| Case relation changed only during document creation | Immediate optimistic state with server confirmation, rollback and live status | Preserves agency while making failure recoverable and truthful |
| No motion contract existed for this frequent action | No entrance or layout animation; only native focus, disabled and status feedback | A frequent keyboard-capable data operation must not wait for decorative motion |
| Collaborator list response could have exposed a future raw relation if selected directly | Case projection is null for collaborators and the control is absent | Minimizes tenant context without implying edit authority |

The purposeful-animation review rejected reveal, morph and transition effects for
this control. Animation would not improve explanation, spatial orientation or
confirmation beyond the native focus/disabled state and status announcement.
Staging keyboard, touch, 200% zoom, forced-colors and screen-reader verification
remain open and are not claimed by this local implementation.
