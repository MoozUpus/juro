# Voice avatar implementation boundary

Updated: 2026-07-30
Status: feature off; no fake voice or call behavior.

The current real AI route is text-first. No verified STT, TTS, realtime voice, viseme/lip-sync stream, or owner-approved 3D rig is configured in the inspected staging Worker. The prototype links to text AI chat and explains why avatar voice is unavailable.

Future activation requires server-side provider adapters, microphone permission initiated by the user, elapsed time, pause/stop/cancel, editable transcript preview, explicit send, captions, mute/stop/replay, context continuity, network recovery, audio retention/purge, and an avatar-independent text/voice fallback. Audio/video consultation remains a separate feature-off provider abstraction.
