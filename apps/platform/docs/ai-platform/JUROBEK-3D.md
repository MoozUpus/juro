# JUROBEK 3D asset audit

Updated: 2026-07-28
Status: owner-approved rigged source asset not present; 3D/avatar feature remains disabled; static fallback verified.

## Source asset

No editable 3D source was found in the reconciled GitHub/Sites checkouts, synced workspace sources, or the two inspected delivery archives. The audit covered `GLB`, `GLTF`, `FBX`, `USDZ`, `BLEND`, `DAE`, `OBJ`, `MTL`, `STL`, `3DS`, `ABC`, and `VRM` formats. No Jurobek SVG/vector source was found.

The canonical platform fallback files are:

| Path | Format | Dimensions | Bytes | SHA-256 |
|---|---|---:|---:|---|
| `apps/platform/public/jurobek-avatar.webp` | WebP, sRGB RGBA | 1024×1792 | 60,670 | `9f42f50c39b71abb8a1792ab67780b08b010b28439437d4789d55aa72a83c8df` |
| `apps/platform/public/jurobek-avatar.png` | PNG, sRGB RGBA | 1024×1792 | 1,517,797 | `ea7df2dd2a694548eb852d6c052630dcc61d24704e03bc87d1124c1a43e030ca` |

The WebP is the preferred static poster/fallback. The PNG is a lossless source render, not a rigged or editable character model.

An adjacent asset audit found three additional static poses outside the canonical platform package (`wave`, `point`, and `approve`) plus neutral AVIF/WebP derivatives. They are raster renders and do not establish an animation system or permission to synthesize missing 3D states.

## Mesh, rig, materials, and animations

| Required evidence | Result |
|---|---|
| Mesh statistics/topology | unavailable — no mesh source |
| Armature/bone hierarchy | unavailable |
| Skinning/bone weights | unavailable |
| Blendshapes/morph targets | unavailable |
| Facial rig/lip-sync readiness | unavailable |
| Materials/texture slots/UV | unavailable |
| Existing animation clips | none verifiable |
| Clothing clipping/deformation | cannot be evaluated from a static render |
| Editable shirt lettering/decal | unavailable |
| LOD and WebGL performance | not applicable until a source model exists |

No `three`, `@react-three/*`, Babylon.js, or `<model-viewer>` runtime dependency is present in the canonical platform package. CSS transform/keyframe reactions applied to a raster image are not 3D rig animation.

## Requested state coverage

The required states are `idle`, `attentive`, `greeting`, `listening`, `processing`, `speaking`, `success`, `warning`, `error`, and `goodbye`. None can be represented as verified rig clips with the available files.

Until the approved rigged package is supplied:

- the animated avatar and `voice-with-avatar` feature flags remain off;
- text and voice flows remain fully usable without WebGL;
- plain voice may use the canonical existing static WebP as a nonanimated identity/fallback surface; this does not enable `voice-with-avatar` or imply lip-sync;
- the UI may otherwise use the static WebP only in approved onboarding, dashboard AI-entry, empty-state, or controlled help contexts;
- listening, recording, processing, speaking, paused, offline, and error states are conveyed with text, semantic status, and screen-reader announcements;
- the UI never animates a recording/listening state unless the microphone is actually active;
- the UI never implies that Jurobek is a human lawyer;
- reduced-motion users receive the same information and actions without character motion.

## Optimization performed

No 3D optimization was performed because there is no 3D source. The existing static fallback is already available as a 60,670-byte WebP. It must be loaded responsively and outside the critical legal-work rendering path; the larger PNG should not be sent when the WebP is sufficient.

## Browser and mobile behavior

Current safe behavior is a normal responsive image with intrinsic dimensions and no WebGL requirement. Browser support therefore follows the platform image pipeline. Voice/text operation must not depend on the image loading successfully.

When a rigged source is later supplied, acceptance requires:

1. source provenance and owner approval;
2. SHA-256 and immutable original preservation;
3. mesh, texture, material, rig, skinning, morph-target, and clip inventory;
4. visual approval of shirt lettering, facial proportions/expression, gaze, skin/fabric/headwear materials, and deformation;
5. proof that optimization preserves armature, skinning, weights, materials, and approved identity;
6. route-level lazy loading, poster fallback, Save-Data/reduced-motion behavior, context-loss recovery, disposal on close, and mobile memory/GPU tests;
7. accessible state labels and a complete text/voice fallback.

## Known limitations and owner action

The source blocker is exact: the owner-approved GLB/FBX/USDZ/BLEND package is absent. Armature, skinning, bone weights, animation clips, materials, facial rig, lip sync, mesh corrections, and shirt-lettering corrections cannot be implemented or verified from raster images. The source must be supplied through an approved file channel; it must not be pasted into chat or reconstructed from the poster.
