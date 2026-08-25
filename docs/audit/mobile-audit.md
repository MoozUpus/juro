# Mobile audit

## Implemented mobile contract

The platform uses a drawer and five-destination bottom navigation at 800 px and
below, with a compact-layout bridge through 900 px. Primary shell actions target
44 CSS pixels, content reserves bottom safe-area/navigation space, and the 320 px
shell hides the duplicated topbar sign-out action in favor of the drawer action.
The public site uses 980 px and 620 px breakpoints and touch-specific navigation
targets.

The mobile experience retains AI sources, case state, document workflows, lawyer
requests, settings, and recovery actions. It is not intentionally reduced to a
read-only dashboard.

## Acceptance matrix

| Width | Required checks |
| ---: | --- |
| 320 | No horizontal page scroll; every topbar/drawer action reachable; no duplicated sign-out control; legal source text wraps. |
| 360 | Composer remains above the virtual-keyboard area; 44 px actions do not clip. |
| 390 | Bottom navigation, safe area, source cards, dialogs and document result tabs remain usable. |
| 768 | Tablet layout does not expose both desktop rail and mobile navigation; tables provide a deliberate overflow or stacked mode. |
| 1024 | Desktop grid enters without clipped headings, side panels, or sticky content collisions. |

Test portrait and landscape where the browser supports it. Do not use browser
zoom as a viewport substitute. This release excludes Edge, Firefox, WebKit, and
physical mobile devices by explicit project constraint; final evidence therefore
uses Chrome/in-app responsive emulation only and must say so.

## Static risk candidates

- Dense administration tables, comparison results, and document-builder panels
  have the highest overflow risk.
- Sticky side panels must become static on compact layouts and must not obscure
  validation errors or primary actions.
- Small status labels are common; essential legal meaning must remain readable at
  200% zoom and must not rely on color.
- Touch flows must not rely on hover-only affordances or precision drag.

Static CSS contains responsive rules in all 56 audited stylesheets and reduced-
motion handling in 38. That indicates coverage, not proof. The QA report owns the
final per-viewport browser result.
