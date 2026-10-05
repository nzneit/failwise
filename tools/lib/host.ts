// The Node lookup of the runners: the current runtime when it is Node 24.2 or later, otherwise
// the first Node 24.2 or later on PATH, in NVM_BIN, or under nvm's versions directory. A runner
// starts its children with the Node `findNode` returns. Everything it touches goes through an
// injected `Host`, so the tests can stand in for the machine. Its tests are in
// tools/run-tests.test.ts.

import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export const MIN_VERSION: readonly [number, number, number] = [24, 2, 0];
export const MIN_LABEL = MIN_VERSION.join(".").replace(/\.0$/, ""); // "24.2"

export type Spawn = (
  command: string,
  args: string[],
  options: { cwd: string; stdio: "inherit" | "pipe"; env?: Record<string, string | undefined> },
) => { status: number | null; stdout?: string | null; stderr?: string | null };

/** One entry of a folder: its name, and whether it is a folder itself (a symbolic link is not). */
export interface DirEntry {
  name: string;
  dir: boolean;
}

export interface Host {
  execPath: string;
  isNode: boolean;
  env: Record<string, string | undefined>;
  exists: (path: string) => boolean;
  listDir: (path: string) => string[];
  listEntries: (path: string) => DirEntry[];
  spawn: Spawn;
  home: string;
}

export function parseVersion(text: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function nodeVersion(host: Host, command: string): number[] | null {
  const probe = host.spawn(command, ["--version"], { cwd: host.home, stdio: "pipe" });
  if (probe.status !== 0 || typeof probe.stdout === "undefined" || probe.stdout === null) return null;
  return parseVersion(String(probe.stdout));
}

// Where to run the suites: the current runtime when it is Node, otherwise the
// first Node 24.2 or later found on PATH, in NVM_BIN, or under nvm's versions directory.
export function findNode(host: Host): { path: string; version: number[] } | null {
  const candidates: string[] = [];
  if (host.isNode) candidates.push(host.execPath);
  candidates.push("node");
  if (host.env.NVM_BIN) candidates.push(join(host.env.NVM_BIN, "node"));
  for (const candidate of candidates) {
    const version = nodeVersion(host, candidate);
    if (version && compareVersions(version, MIN_VERSION) >= 0) return { path: candidate, version };
  }
  const nvmDir = host.env.NVM_DIR ?? join(host.home, ".nvm");
  const versionsDir = join(nvmDir, "versions", "node");
  let installed: string[] = [];
  try {
    installed = host.listDir(versionsDir);
  } catch {
    return null;
  }
  const best = installed
    .map((name) => ({ name, version: parseVersion(name) }))
    .filter(
      (entry): entry is { name: string; version: number[] } =>
        entry.version !== null && compareVersions(entry.version, MIN_VERSION) >= 0,
    )
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  if (!best) return null;
  const path = join(versionsDir, best.name, "bin", "node");
  return host.exists(path) ? { path, version: best.version } : null;
}

export function defaultHost(): Host {
  return {
    execPath: process.execPath,
    isNode: typeof process.versions.node === "string" && typeof (process.versions as Record<string, unknown>).bun === "undefined",
    env: process.env,
    exists: existsSync,
    listDir: readdirSync,
    listEntries: (path) => readdirSync(path, { withFileTypes: true }).map((entry) => ({ name: entry.name, dir: entry.isDirectory() })),
    spawn: (command, args, options) => spawnSync(command, args, { ...options, encoding: "utf8" }),
    home: homedir(),
  };
}
