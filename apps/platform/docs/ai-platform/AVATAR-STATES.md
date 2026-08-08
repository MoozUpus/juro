# Jurobek avatar state contract

Updated: 2026-07-30
Status: state model defined; animated clips not implemented because the approved rig is absent.

Required future states are `idle`, `attentive`, `greeting`, `listening`, `processing`, `speaking`, `success`, `warning`, `error`, and `goodbye`. Voice UI also distinguishes `ready`, `transcribing`, `paused`, `completed`, and `offline`.

Every state must have a visible text label and screen-reader announcement independent of animation. `listening` is legal only while the microphone is actually active. `speaking` is legal only while audio is playing. `processing` cannot replace the real job status. No state may imply that Jurobek is a human lawyer.

The current staging prototype exposes only the static identity state and the explicit label “static fallback · no WebGL”.
