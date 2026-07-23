import { strToU8, zipSync } from "fflate";

export function generateZip(files: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const archive: Record<string, Uint8Array> = {};
  for (const file of files) archive[file.name] = file.bytes;
  const bytes = zipSync(archive, { level: 6 });
  if (bytes.byteLength < 100 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("Generated ZIP is invalid");
  return bytes;
}

export function utf8Text(value: string): Uint8Array {
  return strToU8(value);
}
