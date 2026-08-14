# Cinematic design migration plan

Updated: 2026-07-30
Status: the previous staging prototype was retired on 2026-08-12; production migration is not authorized.

## Expand

1. Keep current routes and shell as the rollback surface.
2. Create a new isolated prototype only after a concrete owner-approved visual
   scope exists; do not reintroduce the retired avatar prototype.
3. Prove real tenant data and links in protected staging.
4. Complete authenticated visual/accessibility/performance regression.

## Owner review

The retired route is not an owner-review surface. A future owner review must
use a newly documented isolated route; it still does not authorize production
functionality or UI replacement.

## Contract, only after separate UI approval

Migrate semantic tokens and shell components route-by-route behind a server-side
flag, retain the previous CSS/component path, compare production baseline
screenshots, and remove any prototype surface only after rollback rehearsal.
Document builder, analysis, tables, and long legal text remain light reading
surfaces.

## Rollback

Disable the prototype/visual flag or roll Worker traffic to the previous verified version. No schema migration is required for this design slice. Production deployment of functionality and production replacement of UI require two separate explicit owner confirmations.
