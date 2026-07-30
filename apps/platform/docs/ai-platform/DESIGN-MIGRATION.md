# Cinematic design migration plan

Updated: 2026-07-30
Status: staging prototype only; production migration not authorized.

## Expand

1. Keep current routes and shell as the rollback surface.
2. Ship scoped `.cinematic-prototype` tokens and route-only CSS.
3. Prove real tenant data and links in protected staging.
4. Complete authenticated visual/accessibility/performance regression.

## Owner review

The owner reviews `/ru/individual/prototypes/platform/cinematic` or the equivalent RU/UZ persona/business route. Publishing this staging prototype does not authorize production functionality or UI replacement.

## Contract, only after separate UI approval

Migrate semantic tokens and shell components route-by-route behind a server-side flag, retain the previous CSS/component path, compare production baseline screenshots, and remove the prototype surface only after rollback rehearsal. Document builder, analysis, tables, and long legal text remain light reading surfaces.

## Rollback

Disable the prototype/visual flag or roll Worker traffic to the previous verified version. No schema migration is required for this design slice. Production deployment of functionality and production replacement of UI require two separate explicit owner confirmations.
