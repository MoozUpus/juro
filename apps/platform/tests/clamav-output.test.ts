import assert from "node:assert/strict";
import test from "node:test";
import {
  ClamAvProtocolError,
  parseClamAvScan,
  parseClamAvVersion,
} from "../lib/document-analysis/clamav-output";

test("parses the installed ClamAV engine and signature versions", () => {
  assert.deepEqual(
    parseClamAvVersion("ClamAV 1.4.3/29415/Wed Aug 06 12:00:00 2026"),
    { engineVersion: "1.4.3", signatureVersion: "29415" },
  );
});

test("accepts only internally consistent clean and infected ClamAV results", () => {
  assert.deepEqual(parseClamAvScan(0, "stdin: OK\n", ""), { verdict: "clean", threats: [] });
  assert.deepEqual(
    parseClamAvScan(1, "stdin: Eicar-Signature FOUND\n", ""),
    { verdict: "infected", threats: [{ name: "Eicar-Signature", category: "malware" }] },
  );
});

test("fails closed for missing signatures and invalid scanner verdicts", () => {
  assert.throws(() => parseClamAvVersion("ClamAV 1.4.3/0/Wed"), ClamAvProtocolError);
  assert.throws(() => parseClamAvScan(0, "stdin: Eicar-Signature FOUND", ""), ClamAvProtocolError);
  assert.throws(() => parseClamAvScan(2, "ERROR: database unavailable", ""), ClamAvProtocolError);
});
