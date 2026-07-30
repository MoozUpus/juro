# Cinematic application shell

Updated: 2026-07-30
Status: current shell reused by the isolated staging prototype; production replacement not authorized.

## Implemented boundary

The prototype inherits `WorkspaceShellLayout` and `PlatformShell`, so it uses the real authenticated user, active tenant, workspace switcher, global search, desktop sidebar, mobile navigation, language-preserving routes, notifications, profile, logout, focus trap, focus restoration, and session refresh. It does not fork these services into demo state.

The prototype adds only a scoped orientation layer inside the existing shell:

- staging-only status;
- compact static Jurobek companion entry;
- the real dashboard client and `/api/platform/dashboard` data;
- explicit links through AI chat, analysis, builder, cases, plan, and specialist handoff.

## Stable information architecture

Desktop keeps the existing sidebar and contextual top bar. Mobile keeps the existing five-item bottom navigation and moves the remainder into the accessible drawer. The prototype never hides core navigation for visual effect.

The prototype CSS is scoped by `.cinematic-prototype`. No prototype selector is imported by canonical production routes. The current shell remains the rollback surface.

## Known shell debt

The shared pre-existing desktop collapse transition animates `grid-template-columns` and sidebar `width`. It is outside the isolated prototype and is recorded as P1 motion debt for a separately approved shell migration. Changing it now would alter production UI before owner approval.
