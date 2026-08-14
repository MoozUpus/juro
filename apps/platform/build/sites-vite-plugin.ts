import { access, cp, mkdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function replaceArtifactDirectory(stagingDirectory: string, outputDirectory: string): Promise<void> {
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await rm(outputDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });

    try {
      await rename(stagingDirectory, outputDirectory);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = code === "EBUSY" || code === "ENOTEMPTY" || code === "EPERM";

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      await delay(attempt * 125);
    }
  }
}

// Packages Sites metadata and migrations after Vite finishes compiling.
export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, "dist", ".openai");
      const stagingDirectory = resolve(root, "dist", ".openai.staging");
      const hostingConfig = resolve(root, ".openai", "hosting.json");
      const drizzleSource = resolve(root, "drizzle");

      // Build tooling can still have a handle open beneath the previous
      // artifact on Windows. Package into a sibling directory first, then
      // swap it into place only after both metadata and migrations are fully
      // copied. This avoids a partially deleted `.openai/drizzle` artifact
      // and makes retrying the build deterministic.
      await rm(stagingDirectory, { recursive: true, force: true });
      await mkdir(stagingDirectory, { recursive: true });

      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(stagingDirectory, "hosting.json"));
      }
      if (await exists(drizzleSource)) {
        await cp(drizzleSource, resolve(stagingDirectory, "drizzle"), {
          recursive: true,
        });
      }
      await replaceArtifactDirectory(stagingDirectory, outputDirectory);
    },
  };
}
