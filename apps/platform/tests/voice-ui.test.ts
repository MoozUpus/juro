import assert from "node:assert/strict";
import test from "node:test";

import { resolveVoiceModeState } from "../lib/ai/voice-ui";

const base = {
  configured: true,
  answerReady: false,
  sending: false,
  recorderPhase: "idle" as const,
  speechPhase: "idle" as const,
};

test("voice presentation follows actual microphone, provider, and playback state", () => {
  assert.equal(resolveVoiceModeState(base), "ready");
  assert.equal(resolveVoiceModeState({ ...base, configured: false }), "offline");
  assert.equal(resolveVoiceModeState({ ...base, recorderPhase: "listening" }), "listening");
  assert.equal(resolveVoiceModeState({ ...base, recorderPhase: "paused" }), "paused");
  assert.equal(resolveVoiceModeState({ ...base, recorderPhase: "transcribing" }), "transcribing");
  assert.equal(resolveVoiceModeState({ ...base, sending: true }), "thinking");
  assert.equal(resolveVoiceModeState({ ...base, speechPhase: "preparing" }), "thinking");
  assert.equal(resolveVoiceModeState({ ...base, speechPhase: "speaking" }), "speaking");
  assert.equal(resolveVoiceModeState({ ...base, speechPhase: "completed" }), "completed");
  assert.equal(resolveVoiceModeState({ ...base, answerReady: true }), "completed");
  assert.equal(resolveVoiceModeState({ ...base, recorderPhase: "error" }), "error");
});

test("error and offline states take precedence over decorative status", () => {
  assert.equal(resolveVoiceModeState({ ...base, configured: false, speechPhase: "speaking" }), "offline");
  assert.equal(resolveVoiceModeState({ ...base, recorderPhase: "error", speechPhase: "speaking" }), "error");
});
