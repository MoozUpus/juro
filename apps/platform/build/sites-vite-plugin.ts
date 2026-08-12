import { access, cp, mkdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
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
      await rm(outputDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      await rename(stagingDirectory, outputDirectory);
    },
  };
}
