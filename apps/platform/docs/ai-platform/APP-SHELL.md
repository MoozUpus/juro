# Cinematic application shell

Updated: 2026-07-30
Status: current production shell; the former isolated cinematic prototype was retired on 2026-08-12. Production replacement is not authorized.

## Implemented boundary

`WorkspaceShellLayout` and `PlatformShell` remain the authoritative working
shell: real authenticated user, active tenant, workspace switcher, global
search, desktop sidebar, mobile navigation, language-preserving routes,
notifications, profile, logout, focus trap, focus restoration and session
refresh. No cinematic or avatar-specific wrapper is currently shipped.

## Stable information architecture

Desktop keeps the existing sidebar and contextual top bar. Mobile keeps the existing five-item bottom navigation and moves the remainder into the accessible drawer. The prototype never hides core navigation for visual effect.

The retired `.cinematic-prototype` CSS is no longer shipped. The current shell
is the rollback surface for any future design experiment.

## Known shell debt

The shared pre-existing desktop collapse transition animates `grid-template-columns` and sidebar `width`. It is outside the isolated prototype and is recorded as P1 motion debt for a separately approved shell migration. Changing it now would alter production UI before owner approval.
