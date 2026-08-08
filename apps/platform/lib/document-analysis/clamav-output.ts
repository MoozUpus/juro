const engineVersionPattern = /^[0-9][0-9A-Za-z.+_-]{0,79}$/;
const signatureVersionPattern = /^[0-9][0-9A-Za-z.+_-]{0,79}$/;

export class ClamAvProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClamAvProtocolError";
  }
}

export function parseClamAvVersion(output: string): {
  engineVersion: string;
  signatureVersion: string;
} {
  const match = /^ClamAV\s+([^/\s]+)\/([^/\s]+)\//m.exec(output.trim());
  if (!match || !engineVersionPattern.test(match[1]) || !signatureVersionPattern.test(match[2])) {
    throw new ClamAvProtocolError("ClamAV version output is invalid.");
  }
  if (match[2] === "0") {
    throw new ClamAvProtocolError("ClamAV signatures are unavailable.");
  }
  return { engineVersion: match[1], signatureVersion: match[2] };
}

export function parseClamAvScan(
  exitCode: number,
  stdout: string,
  stderr: string,
): { verdict: "clean" | "infected"; threats: Array<{ name: string; category: string }> } {
  const output = `${stdout}\n${stderr}`.replace(/\r/g, "").trim();
  if (output.length > 12_288) {
    throw new ClamAvProtocolError("ClamAV scan output is too large.");
  }
  const found = [...output.matchAll(/^.+?:\s+(.+?)\s+FOUND\s*$/gm)]
    .map((match) => match[1].trim())
    .filter((name) => name.length > 0 && name.length <= 240);

  if (exitCode === 0) {
    if (found.length > 0 || !/^.+?:\s+OK\s*$/m.test(output)) {
      throw new ClamAvProtocolError("Clean ClamAV result is inconsistent.");
    }
    return { verdict: "clean", threats: [] };
  }
  if (exitCode === 1 && found.length > 0) {
    return {
      verdict: "infected",
      threats: [...new Set(found)].map((name) => ({ name, category: "malware" })),
    };
  }
  throw new ClamAvProtocolError("ClamAV did not produce a valid verdict.");
}
