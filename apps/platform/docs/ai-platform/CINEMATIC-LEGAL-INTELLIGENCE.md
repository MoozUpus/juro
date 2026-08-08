# Cinematic Legal Intelligence

Updated: 2026-07-28
Status: approved design contract; not yet implemented as the staging application shell; production unchanged.

## Product expression

JURO should feel like a legal command center that turns an uncertain situation into a controlled sequence:

```text
question → facts → applicable law → risk → document → action plan → live lawyer
```

The visual system supports this sequence through persistent case/workspace context, clear source status, reading-first work surfaces, and controlled state transitions. It must never imply that a model output is law, that a generated document is already approved, or that Jurobek is a human lawyer.

## Two-level system

### Cinematic shell

Applicable to navigation, dashboard introduction, AI entry, onboarding, selected empty states, voice/avatar entry, and transitions between major modes.

Allowed: deep navy, restrained gold light, subtle texture, modest depth, selected translucency, short directional movement, contextual panel expansion.

### Legal work surfaces

Applicable to chats with long answers, documents, analysis, redline, comparisons, sources, forms, tables, cases, tasks, calendars, and admin.

Required: light/neutral reading canvas, high contrast, comfortable line length, inspectable source/deadline math, explicit current/historical/assumption states, stable tool placement, and no animated background under legal content.

## Semantic token contract

The implementation will expose at least these semantic roles; exact accessible values are set only after contrast testing:

`brand.navy`, `brand.gold`, `brand.warm`, `background.cinematic`, `background.default`, `surface.primary`, `surface.secondary`, `surface.elevated`, `surface.reading`, `surface.document`, `surface.analysis`, `text.primary`, `text.secondary`, `text.inverse`, `text.muted`, `border.default`, `border.strong`, `focus.ring`, `accent.primary`, `accent.subtle`, `risk.critical`, `risk.high`, `risk.medium`, `risk.low`, `status.success`, `status.warning`, `status.error`, and `status.info`.

Brand anchors remain approximately navy `#062844`, gold `#BE974F`, and warm background `#F8F6F2`. Gold is not a generic interactive color; functional states retain functional colors and non-color labels.

## Motion contract

Allowed vocabulary: controlled fade, short directional slide, content reveal, panel expansion, source-panel transition, state morph, avatar-state transition, restrained light shift, and focus transition between AI and document.

Frequent keyboard/document/table actions receive no animation or only immediate feedback. Standard UI transitions are 150–250 ms; exit is usually faster than enter. Hover behavior is gated by `(hover: hover) and (pointer: fine)`. Motion uses `transform` and `opacity`, never `transition: all`, and is fully interruptible where user control requires it.

Reduced motion removes tracking, parallax, springs, large translations, and avatar sequences while preserving final state, focus, status, and all controls.

## Jurobek contract

Jurobek is allowed only in onboarding, dashboard AI entry, voice/avatar mode, approved empty states, controlled contextual help, and completion of important AI processes. It must not occupy document analysis, redline, builder, or long reading surfaces.

The approved rigged source is currently absent. `JUROBEK-3D.md` defines the verified static fallback and disabled 3D state. No generic avatar or raster-derived rig is permitted.

## Evidence hierarchy

For legal output, the visual reading order is:

1. summary and urgency;
2. confirmed findings with exact source status;
3. assumptions/unconfirmed basis;
4. risks with evidence and consequence;
5. action plan/deadline calculation;
6. document/lawyer next actions;
7. technical provider/model details.

Numeric scores never replace severity, evidence, uncertainty, or explanation.

## Release boundary

This document is a design contract, not an implementation claim. The new system must first run on the isolated staging prototype with real staging components/data, RU/UZ, responsive/accessibility/performance evidence, 3D-off and WebGL-fallback paths, and rollback to the previous UI. Production replacement requires a separate owner approval from functional production deployment.
