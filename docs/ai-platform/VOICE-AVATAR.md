# Voice and avatar checkpoint

Status: the voice-message slice and migration `0066` are deployed to Access-protected staging in Worker version `d22705e4-446a-47f1-825e-b77f1135504d`; authenticated voice E2E and human RU/UZ QA are still pending.

## Implemented voice-message slice

- Authenticated RU/UZ users can start microphone recording only through an explicit action.
- The browser exposes elapsed time, pause, resume, stop and cancel; recording stops at five minutes.
- The client computes SHA-256, creates an idempotent server record, uploads into private R2 quarantine, finalizes after MIME/magic-byte/size/hash validation, then requests server-side transcription.
- Supported input contracts are WebM, MP4/M4A, WAV and MPEG audio, with a 25 MB ceiling.
- The transcript is returned to the normal composer for review and editing. Sending confirms the exact encrypted transcript and links the recording to the persisted conversation/message in the successful AI transaction.
- Original audio is retained for at most 30 days and can be deleted immediately by the user. Scheduled purge deletes private and quarantine objects and clears transcript ciphertext.
- AI answers can be played through server-side OpenAI TTS with `marin` or `cedar`. The UI identifies the voice as synthetic AI speech and provides native pause/stop controls.
- Voice failures do not block text chat and do not pretend that a microphone, provider or avatar is active.

Models are server-side configuration: `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe` and `OPENAI_TTS_MODEL=gpt-4o-mini-tts`. `OPENAI_API_KEY` remains a Cloudflare secret and is never placed in browser code or committed variables.

## Explicitly not implemented

- Realtime bidirectional voice is feature-disabled.
- No live audio/video call provider is selected.
- No approved rigged Jurobek 3D source asset is present in this worktree, so no arbitrary replacement avatar was created.
- Lip sync, visemes, facial clips and WebGL fallback cannot be claimed until the official asset is supplied and inspected.
- OpenAI's published TTS language list does not explicitly list Uzbek; Uzbek TTS quality therefore requires staging and human language QA before release.

## Staging gate

The private backup, isolated restore, migrations `0065`/`0066`, staging build and staging deployment have passed. Anonymous routes remain protected by Cloudflare Access. Still verify behind Access: microphone denial, upload/finalize/transcription, transcript editing and confirmation, AI send, TTS playback/stop, early delete, 30-day purge scheduling, RU/UZ human quality, mobile keyboard, reduced motion and text-only fallback. Detailed evidence is in `STAGING-0066-VOICE-EVIDENCE.md`.
