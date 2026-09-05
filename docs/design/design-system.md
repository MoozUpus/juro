# JURO Design System

Status: **implemented baseline with known consolidation work**

Evidence cutoff: **2026-09-02 UZT**

## Product character

JURO uses a trust-first visual language: deep navy for authority, restrained gold for direction, warm neutral canvases, direct hierarchy, and explicit status text. Public presentation and protected product surfaces share that identity, but currently maintain separate CSS implementations.

The public design contract is recorded in `apps/website/DESIGN.md`. Platform primitives start in `apps/platform/app/globals.css`; feature-level styles live beside their components.

## Foundations

| Foundation | Current contract | Implemented source |
| --- | --- | --- |
| Brand | navy `#062844`, gold `#BE974F`, warm canvas `#F8F6F2` | website design metadata and platform CSS variables |
| Typography | modern sans-serif with system fallbacks; size/weight/measure create hierarchy | website design metadata; platform `--font-primary` / `--font-ui` |
| Corners | 10 px controls, 16–18 px primary surfaces | public design contract; platform `--radius` |
| Spacing | public scale 8/12/24/48/96 px; platform uses feature-local spacing around shared shell rules | `apps/website/DESIGN.md`; feature CSS |
| Elevation | flat by default; one meaningful elevated layer; navy-tinted soft shadows | website design contract; platform `--shadow-soft` |
| Motion | 140/220/360/680 ms tiers with bounded easing; reduced-motion overrides required | platform motion variables; public motion system |
| Touch | interactive controls target at least 44 × 44 CSS px | public header tests and feature CSS |

## Semantic platform tokens

The platform root exposes semantic surfaces, text, borders, interactions, focus, status, overlay, and shadow tokens. Dark mode replaces those semantic values rather than forcing components to choose alternate raw colours.

- Surfaces: `--surface-canvas`, `--surface-subtle`, `--surface-raised`, `--surface-elevated`.
- Text: `--text-primary`, `--text-secondary`, `--text-inverse`.
- Borders and focus: `--border-subtle`, `--border-strong`, `--focus-ring`.
- State: `--status-success`, `--status-warning`, `--status-danger` plus paired tonal backgrounds.
- Brand and action: `--brand-navy`, `--brand-gold`, `--interactive-primary`, `--interactive-hover`.

Legacy aliases such as `--navy`, `--gold`, `--ink`, `--muted`, and `--line` remain for compatibility. New shared components should prefer semantic names so dark mode and future contrast work remain centralized.

## Layout rules

- Public desktop content uses a bounded wide container and editorial grids; asymmetric structures collapse to one column below tablet widths.
- The protected platform shell uses a fixed/sidebar desktop model and a responsive mobile navigation model. Every main-content grid must use `minmax(0, 1fr)` or equivalent containment to prevent page-level horizontal overflow.
- Fixed-height content regions are allowed only where the child region owns scrolling. Page shells and hero sections use minimum height.
- Reading content should stay near 68–72 characters per line. Dense data surfaces may use a wider measure when labels, wrapping, and horizontal containment remain clear.

## Interaction and accessibility

- Keyboard focus must remain visible with a high-contrast outline or focus ring; focus must not be conveyed by colour alone.
- Statuses include text and structure, not just colour.
- Buttons, links, fields, and icon controls target a 44 px minimum interactive box where rendered.
- Motion communicates feedback or spatial continuity. `prefers-reduced-motion: reduce` must remove non-essential transforms and long transitions.
- RU and UZ are equal product languages. Layouts must tolerate longer strings and retain the selected locale through navigation.
- Theme preference is represented by the shared `juro_theme` cookie on JURO subdomains, with page theme state and account persistence layered around it.

## Governance

1. Reuse a semantic token before adding a raw colour or a new alias.
2. Reuse an existing component family before adding a visually equivalent local component.
3. Add a focused regression test when changing shell layout, touch size, theme precedence, language controls, or protected authentication UI.
4. Validate public and protected surfaces in Chrome at mobile, tablet, laptop, and wide desktop widths.
5. Treat screenshots and visual review as evidence for the checked state only; they do not certify every route or accessibility criterion.

## Known consolidation work

- Public and platform token sets are not yet generated from one package.
- Several feature styles still use raw colour values and legacy aliases.
- A repository-wide keyboard, zoom, forced-colours, text-spacing, and screen-reader pass remains open.
- Component-level visual regression coverage is partial; the current release proves public/auth/Individual shell boundaries, not every protected feature page.
