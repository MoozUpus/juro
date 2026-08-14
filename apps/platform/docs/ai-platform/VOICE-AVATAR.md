# Voice and avatar implementation boundary

Updated: 2026-08-04
Status: plain voice implemented locally; protected staging deploy pending; voice-with-avatar remains disabled.

## Implemented plain-voice flow

The authenticated AI-lawyer uses one conversation and case context for text
and voice. Canonical `/:locale/:accountType/ai-lawyer/voice` and explicit
business-workspace routes redirect permanently to the same `ai-chat` surface
with `mode=voice`; no parallel or mock chat history is created.

The real server-side flow is:

1. microphone access starts only after an explicit button press;
2. the browser records at most five minutes, with pause, resume, stop and
   cancel controls;
3. SHA-256, bounded MIME, size and duration metadata initialize an idempotent
   tenant-owned D1 row;
4. bytes upload to private quarantine R2, then finalize only after magic-byte,
   declared-size and hash checks;
5. the server calls the configured OpenAI transcription model;
6. the transcript is encrypted at rest and shown in an editable field;
7. explicit send confirms the edited transcript and links the recording to the
   persisted user message in the same AI conversation;
8. original audio expires after 30 days and the scheduled retention runtime
   purges R2 bytes and transcript ciphertext;
9. a persisted assistant answer can be synthesized server-side with selectable
   voice, captions remaining visible, mute, pause, stop and replay controls.

The visual state contract exposes `ready`, `listening`, `transcribing`,
`thinking`, `speaking`, `paused`, `completed`, `offline` and `error` as text
and ARIA status. It never infers listening when the microphone is off.

## Avatar boundary

The repository still has no owner-approved rigged GLB/FBX/USDZ/BLEND asset.
Plain voice does not use an avatar poster. `/jurobek-avatar.webp` remains a
static onboarding brand image only. No “voice with avatar” control is shipped;
it must not return until an approved rig, animation clips, visual review and
GPU/memory gates exist.

Realtime voice and audio/video consultation providers remain separate
feature-off capabilities. Plain voice and text continue to work without WebGL.

## Evidence still required

- Access-authorized RU/UZ staging traversal with microphone allow/deny;
- real synthetic STT/TTS provider execution in staging without sensitive data;
- mobile keyboard, background/interruption, network recovery and Save-Data;
- axe/screen-reader, 200% zoom, reduced motion and 320–1440+ visual matrix;
- a verified scheduled 30-day purge against a synthetic staging recording.

Production is unchanged and separately gated.
