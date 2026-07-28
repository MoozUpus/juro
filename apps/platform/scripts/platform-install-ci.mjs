import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

class InstallError extends Error {
  constructor(message, exitCode = 1, options) {
    super(message, options);
    this.exitCode = exitCode;
  }
}

async function pathIsDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return false;
    }
    if (error?.code === "EPERM") {
      return true;
    }
    throw error;
  }
}

function lockKey(projectRoot) {
  const normalized = process.platform === "win32"
    ? projectRoot.toLowerCase()
    : projectRoot;
  return createHash("sha256").update(normalized).digest("hex");
}

async function acquireKernelInstallLock(projectRoot) {
  const key = lockKey(projectRoot);
  const endpoint = process.platform === "win32"
    ? `\\\\.\\pipe\\juro-platform-install-${key}`
    : process.platform === "linux"
      ? `\0juro-platform-install-${key}`
      : {
          exclusive: true,
          host: "127.0.0.1",
          port: 49_152 + (Number.parseInt(key.slice(0, 4), 16) % 16_384),
        };
  const server = createServer((socket) => socket.destroy());

  try {
    await new Promise((resolveListening, rejectListening) => {
      const onError = (error) => rejectListening(error);
      server.once("error", onError);
      server.listen(endpoint, () => {
        server.off("error", onError);
        resolveListening();
      });
    });
  } catch (error) {
    if (server.listening) {
      server.close();
    }
    if (["EADDRINUSE", "EACCES"].includes(error?.code)) {
      throw new InstallError(
        `Another dependency install owns the project lock for ${projectRoot}.`,
        75,
      );
    }
    throw error;
  }

  return () =>
    new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
}

async function readLockSnapshot(lockPath) {
  const handle = await open(lockPath, "r");
  try {
    const content = await handle.readFile("utf8");
    const metadata = await handle.stat({ bigint: true });
    return {
      content,
      identity: [
        metadata.dev,
        metadata.ino,
        metadata.size,
      ].map(String).join(":"),
      mtimeMs: Number(metadata.mtimeNs / 1_000_000n),
    };
  } finally {
    await handle.close();
  }
}

function snapshotsMatch(left, right) {
  return left.identity === right.identity && left.content === right.content;
}

function snapshotOwner(snapshot) {
  try {
    return JSON.parse(snapshot.content);
  } catch {
    return null;
  }
}

async function quarantineAndRemoveLock(lockPath, expectedSnapshot, action) {
  const quarantinePath = `${lockPath}.${action}.${process.pid}.${randomUUID()}`;
  try {
    await rename(lockPath, quarantinePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }

  // Rename gives this process a unique path. Verify the moved filesystem
  // object and its content before deleting it, so a replacement at lockPath
  // can never be mistaken for the inspected owner.
  const movedSnapshot = await readLockSnapshot(quarantinePath);
  if (!snapshotsMatch(movedSnapshot, expectedSnapshot)) {
    throw new InstallError(
      `Install lock changed during ${action}; unexpected lock retained at ${quarantinePath}.`,
      75,
    );
  }
  const confirmedSnapshot = await readLockSnapshot(quarantinePath);
  if (!snapshotsMatch(confirmedSnapshot, expectedSnapshot)) {
    throw new InstallError(
      `Install lock changed after ${action}; unexpected lock retained at ${quarantinePath}.`,
      75,
    );
  }
  await unlink(quarantinePath);
  return true;
}

async function acquireInstallLock(projectRoot) {
  const releaseKernelLock = await acquireKernelInstallLock(projectRoot);
  try {
    const lockDirectory = resolve(projectRoot, ".sites-runtime");
    const lockPath = resolve(lockDirectory, "install.lock");
    const owner = {
      ownerId: randomUUID(),
      pid: process.pid,
      projectRoot,
      createdAt: new Date().toISOString(),
    };
    await mkdir(lockDirectory, { recursive: true });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        try {
          await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
        } finally {
          await handle.close();
        }
        const ownedSnapshot = await readLockSnapshot(lockPath);

        return async () => {
          try {
            if (!await quarantineAndRemoveLock(
              lockPath,
              ownedSnapshot,
              "release",
            )) {
              throw new InstallError(
                "Install lock disappeared before its owner released it.",
                75,
              );
            }
          } finally {
            await releaseKernelLock();
          }
        };
      } catch (error) {
        if (error?.code !== "EEXIST") {
          throw error;
        }

        let inspected;
        try {
          inspected = await readLockSnapshot(lockPath);
        } catch (snapshotError) {
          if (snapshotError?.code === "ENOENT") {
            continue;
          }
          throw snapshotError;
        }
        const activeOwner = snapshotOwner(inspected);
        if (activeOwner && await processExists(Number(activeOwner.pid))) {
          throw new InstallError(
            `Another dependency install is already running for ${projectRoot}.`,
            75,
          );
        }

        if (!activeOwner && Date.now() - inspected.mtimeMs < 15 * 60_000) {
          throw new InstallError(
            "Install lock has unknown recent ownership; refusing automatic recovery.",
            75,
          );
        }

        await quarantineAndRemoveLock(lockPath, inspected, "stale-recovery");
      }
    }

    throw new InstallError(
      `Could not acquire the dependency install lock for ${projectRoot}.`,
      75,
    );
  } catch (error) {
    await releaseKernelLock();
    throw error;
  }
}

async function findConcurrentLinuxInstall(projectRoot) {
  if (process.platform !== "linux") {
    return null;
  }

  for (const entry of await readdir("/proc", { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }
    const pid = Number.parseInt(entry.name, 10);
    if (pid === process.pid || pid === process.ppid) {
      continue;
    }

    try {
      const processRoot = await realpath(`/proc/${pid}/cwd`);
      if (resolve(processRoot) !== projectRoot) {
        continue;
      }
      const command = (await readFile(`/proc/${pid}/cmdline`))
        .toString("utf8")
        .replaceAll("\0", " ");
      if (/\bnpm(?:-cli\.js)?\s+ci(?:\s|$)/.test(command)) {
        return pid;
      }
    } catch (error) {
      if (!["EACCES", "ENOENT", "EPERM"].includes(error?.code)) {
        throw error;
      }
    }
  }
  return null;
}

async function resolveNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    resolve(
      dirname(process.execPath),
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return resolve(candidate);
    } catch {
      // Try the next platform-specific npm installation location.
    }
  }
  throw new InstallError(
    "npm CLI is unavailable. Run install:ci through the locked npm toolchain.",
    69,
  );
}

async function npmConfigValue(
  npmCli,
  environment,
  key,
  cancellationSignal,
) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [npmCli, "config", "get", key],
    {
      cwd: environment.SITES_PROJECT_ROOT,
      env: environment,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      signal: cancellationSignal,
      timeout: 30_000,
      windowsHide: true,
    },
  );
  return stdout.trim();
}

async function assertWritableRuntime(
  paths,
  npmCli,
  environment,
  cancellationSignal,
) {
  console.log("[sites] validating writable install environment");
  const actualCache = resolve(
    await npmConfigValue(npmCli, environment, "cache", cancellationSignal),
  );
  if (actualCache !== paths.npmCache) {
    throw new InstallError(
      `Expected npm cache ${paths.npmCache}, got ${actualCache}.`,
      78,
    );
  }

  for (const directory of [
    paths.npmCache,
    paths.xdgConfig,
    paths.temporary,
    paths.wranglerLogs,
  ]) {
    const marker = resolve(directory, `.sites-write-test-${process.pid}`);
    await writeFile(marker, "ok", { flag: "wx" });
    await unlink(marker);
  }
  console.log(`[sites] environment passed: cache=${paths.npmCache}`);
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function readLockedVinext(packageLockPath) {
  const lock = JSON.parse(await readFile(packageLockPath, "utf8"));
  const vinext = lock.packages?.["node_modules/vinext"];
  if (!vinext?.resolved || !vinext?.integrity) {
    throw new InstallError(
      "package-lock.json does not contain a resolved, integrity-pinned vinext tarball",
      65,
    );
  }
  return {
    resolved: String(vinext.resolved),
    integrity: String(vinext.integrity),
  };
}

function parseIntegrity(integrity) {
  const token = integrity.trim().split(/\s+/, 1)[0];
  const separator = token.indexOf("-");
  if (separator <= 0 || separator === token.length - 1) {
    throw new InstallError(`Unsupported integrity value: ${integrity}`, 65);
  }
  return {
    algorithm: token.slice(0, separator),
    expected: token.slice(separator + 1),
  };
}

function lockedTarballUrl(lockedTarball, registryValue) {
  const locked = new URL(lockedTarball);
  const registry = new URL(registryValue);
  for (const [label, url] of [
    ["locked tarball", locked],
    ["npm registry", registry],
  ]) {
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new InstallError(`${label} must use HTTP or HTTPS`, 65);
    }
    if (url.username || url.password) {
      throw new InstallError(
        `${label} must not contain credentials; configure npm authentication separately`,
        65,
      );
    }
    if (url.search || url.hash) {
      throw new InstallError(
        `${label} must not contain query parameters or fragments; configure npm authentication separately`,
        65,
      );
    }
  }
  if (locked.hostname === "registry.npmjs.org") {
    locked.protocol = registry.protocol;
    locked.host = registry.host;
    locked.pathname = `${registry.pathname.replace(/\/$/, "")}${locked.pathname}`;
  }
  return locked.href;
}

async function downloadLockedTarball({
  url,
  destination,
  integrity,
  npmCli,
  environment,
  runNodeEntry,
  parseDuration,
}) {
  const temporaryDirectory = await mkdtemp(
    resolve(dirname(destination), "vinext-pack-"),
  );
  try {
    await runNodeEntry(npmCli, [
      "pack",
      url,
      "--pack-destination",
      temporaryDirectory,
      "--ignore-scripts",
    ], {
      environment,
      label: "locked vinext tarball preflight",
      timeoutMs: parseDuration(
        process.env.SITES_PREFLIGHT_TIMEOUT || "2m",
        "SITES_PREFLIGHT_TIMEOUT",
      ),
      killAfterMs: parseDuration(
        process.env.SITES_INSTALL_KILL_AFTER || "15s",
        "SITES_INSTALL_KILL_AFTER",
      ),
    });
    const packedFiles = (await readdir(temporaryDirectory, {
      withFileTypes: true,
    })).filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"));
    if (packedFiles.length !== 1) {
      throw new InstallError(
        `npm pack produced ${packedFiles.length} tarballs; expected exactly one`,
        65,
      );
    }
    const packedTarball = resolve(temporaryDirectory, packedFiles[0].name);
    await verifyIntegrity(packedTarball, integrity);
    await rename(packedTarball, destination);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function holdValidationLock(cancellationSignal) {
  const value = process.env.SITES_INSTALL_VALIDATE_HOLD_MS;
  if (value === undefined) {
    return;
  }
  if (!/^\d+$/.test(value)) {
    throw new InstallError(
      "SITES_INSTALL_VALIDATE_HOLD_MS must be an integer from 0 to 5000",
      64,
    );
  }
  const milliseconds = Number.parseInt(value, 10);
  if (milliseconds > 5_000) {
    throw new InstallError(
      "SITES_INSTALL_VALIDATE_HOLD_MS must be an integer from 0 to 5000",
      64,
    );
  }
  if (milliseconds === 0) {
    return;
  }
  if (cancellationSignal?.aborted) {
    throw cancellationSignal.reason ?? new Error("Install cancelled");
  }
  await new Promise((resolveHold, rejectHold) => {
    const finish = () => {
      cancellationSignal?.removeEventListener("abort", onAbort);
      resolveHold();
    };
    const timer = setTimeout(finish, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      cancellationSignal?.removeEventListener("abort", onAbort);
      rejectHold(cancellationSignal.reason ?? new Error("Install cancelled"));
    };
    cancellationSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function verifyIntegrity(path, integrity) {
  const { algorithm, expected } = parseIntegrity(integrity);
  let actual;
  try {
    const digest = createHash(algorithm);
    for await (const chunk of createReadStream(path)) {
      digest.update(chunk);
    }
    actual = digest.digest("base64");
  } catch (error) {
    throw new InstallError(
      `Could not verify vinext tarball with ${algorithm}.`,
      65,
      { cause: error },
    );
  }
  if (actual !== expected) {
    throw new InstallError(
      `vinext tarball integrity mismatch for ${algorithm}`,
      65,
    );
  }
}

export async function runInstallCi({
  projectRoot,
  runtimeRoot,
  prepareEnvironment,
  resolvePackageBinary,
  runNodeEntry,
  parseDuration,
  cancellationSignal,
  validateOnly = false,
}) {
  const canonicalProjectRoot = await realpath(projectRoot);
  const { environment, paths } = await prepareEnvironment(
    {},
    { policy: "install" },
  );
  const npmCli = await resolveNpmCli();
  await assertWritableRuntime(
    paths,
    npmCli,
    environment,
    cancellationSignal,
  );

  const releaseLock = await acquireInstallLock(canonicalProjectRoot);
  try {
    if (validateOnly) {
      await holdValidationLock(cancellationSignal);
    }
    const concurrentPid = await findConcurrentLinuxInstall(canonicalProjectRoot);
    if (concurrentPid !== null) {
      throw new InstallError(
        `Another npm ci is visible in ${projectRoot} (pid ${concurrentPid}); refusing to overlap installs.`,
        75,
      );
    }

    const packageLockPath = resolve(projectRoot, "package-lock.json");
    const lockfileSha256 = await sha256(packageLockPath);
    const lockedVinext = await readLockedVinext(packageLockPath);
    parseIntegrity(lockedVinext.integrity);

    if (validateOnly) {
      console.log(
        "[sites] install preflight validation passed; npm ci was not run (--validate-only)",
      );
      return;
    }

    let useSeededCache = false;
    const seedCache = process.env.SITES_NPM_CACHE_SEED
      ? resolve(process.env.SITES_NPM_CACHE_SEED)
      : null;
    if (seedCache && await pathIsDirectory(seedCache)) {
      let seedLockfileSha256 = "";
      try {
        seedLockfileSha256 = (
          await readFile(resolve(seedCache, ".sites-lockfile-sha256"), "utf8")
        ).trim();
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }
      if (seedLockfileSha256 === lockfileSha256) {
        console.log("[sites] restoring image-seeded npm cache");
        if (seedCache !== paths.npmCache) {
          await cp(seedCache, paths.npmCache, { recursive: true, force: true });
        }
        useSeededCache = true;
        console.log(
          "[sites] image cache seed matched; registry fallback remains available",
        );
      } else {
        console.log(
          "[sites] image cache seed does not match this lockfile; using the network path",
        );
      }
    }

    if (!useSeededCache) {
      const registry = await npmConfigValue(
        npmCli,
        environment,
        "registry",
        cancellationSignal,
      );
      const preflightUrl = lockedTarballUrl(lockedVinext.resolved, registry);
      const preflightDirectory = resolve(runtimeRoot, "preflight");
      const preflightTarball = resolve(preflightDirectory, "vinext.tgz");
      await mkdir(preflightDirectory, { recursive: true });

      console.log("[sites] downloading the complete locked vinext tarball");
      await rm(preflightTarball, { force: true });
      const preflightEnvironment = {
        ...environment,
        NPM_CONFIG_MAXSOCKETS: "1",
        NPM_CONFIG_FETCH_RETRIES: "0",
        NPM_CONFIG_FETCH_TIMEOUT: "30000",
      };
      await downloadLockedTarball({
        url: preflightUrl,
        destination: preflightTarball,
        integrity: lockedVinext.integrity,
        npmCli,
        environment: preflightEnvironment,
        runNodeEntry,
        parseDuration,
      });
      console.log("[sites] network and integrity preflight passed");
    }

    console.log("[sites] running exactly one bounded npm ci");
    const installEnvironment = {
      ...environment,
      NPM_CONFIG_MAXSOCKETS: "1",
      NPM_CONFIG_FETCH_RETRIES: "0",
      NPM_CONFIG_FETCH_TIMEOUT: "30000",
    };
    const npmArguments = ["ci", "--cache", paths.npmCache];
    if (useSeededCache) {
      npmArguments.push("--prefer-offline");
    }
    await runNodeEntry(npmCli, npmArguments, {
      environment: installEnvironment,
      label: "npm ci",
      timeoutMs: parseDuration(
        process.env.SITES_INSTALL_TIMEOUT || "8m",
        "SITES_INSTALL_TIMEOUT",
      ),
      killAfterMs: parseDuration(
        process.env.SITES_INSTALL_KILL_AFTER || "15s",
        "SITES_INSTALL_KILL_AFTER",
      ),
    });

    await resolvePackageBinary("vinext", "vinext");
    await writeFile(
      resolve(projectRoot, "node_modules", ".sites-install.json"),
      `${JSON.stringify({
        lockfile_sha256: lockfileSha256,
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
      }, null, 2)}\n`,
    );
    console.log("[sites] npm ci passed and vinext is available");
  } finally {
    await releaseLock();
  }
}
