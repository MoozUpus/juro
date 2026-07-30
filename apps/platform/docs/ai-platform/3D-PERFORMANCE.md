# Jurobek 3D performance gate

Updated: 2026-07-30
Status: not applicable to the current static prototype; no 3D runtime shipped.

The prototype adds the existing 60,670-byte WebP and no JavaScript animation dependency. There is no WebGL context, render loop, mesh, texture upload, camera, audio graph, or cleanup lifecycle to measure.

Any future 3D candidate must be route-split and lazy, preserve an intrinsic-size poster, stop outside the viewport and hidden tab, release renderer/audio/listeners on close, recover from context loss, honor Save-Data and reduced motion, and preserve full text/voice function if loading fails. Acceptance requires mobile GPU/memory and long-session measurements against the avatar-off baseline.
