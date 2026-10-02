// A fake machine for the tests of the browser runners (tools/lib/browser.ts): Node 24.17 at
// /opt/node/bin/node, every path present unless named as missing, and children that answer as
// Playwright and render.ts would without starting anything. Files live in an in-memory disk, a map
// of absolute path to text, which `Files` reads and removes from and `host.exists` and
// `host.listDir` consult; the fake `playwright test` call writes its JSON report there and any
// further files a test names. It holds no test and no entry point.

import { isAbsolute, join } from "node:path";
import type { Spawn } from "./host.ts";
import type { Machine, Run } from "./browser.ts";

const PLAYWRIGHT = "dev/node_modules/.bin/playwright";
const DRY_RUN = "browser: chromium version 1\n  Install location:    /cache/chromium-1\n  Download url:        https://example.invalid/c.zip\n";

/** Playwright's JSON report with one test per pair of engine and status. */
export const report = (...tests: [string, string][]): string =>
  JSON.stringify({ suites: [{ specs: [], suites: [{ specs: tests.map(([projectName, status]) => ({ tests: [{ projectName, status }] })) }] }] });

export interface FakeOptions {
  noNode?: boolean;
  missing?: string[]; // paths that do not exist: absolute, or relative to the root
  dryRun?: string; // what `playwright install --dry-run` prints
  statuses?: { render?: number | null; install?: number | null; dryRun?: number | null; test?: number | null };
  results?: string | null; // what `playwright test` writes to the results file; null writes nothing.
  // Default: one "expected" test per --project named.
  stale?: string; // what the results file holds before the run
  cwd?: string; // default: the root
  written?: Record<string, string>; // further files `playwright test` leaves, by absolute path
}

/** One child process as the runner started it. */
export interface Call {
  command: string;
  args: string[];
  cwd: string;
  stdio: string;
  env: Record<string, string | undefined> | undefined;
}

/** What the fake records while a runner uses it. */
interface Recorded {
  calls: Call[];
  lines: string[];
  errors: string[];
  removed: string[];
}

/** The status the fake gives a child of the given kind: 0 unless `statuses` names it. */
function statusOf(options: FakeOptions, kind: keyof NonNullable<FakeOptions["statuses"]>): number | null {
  const statuses = options.statuses ?? {};
  return kind in statuses ? (statuses[kind] ?? null) : 0;
}

/** What the fake `playwright test` writes as its JSON report. */
function resultsOf(options: FakeOptions, args: string[]): string | null {
  if (options.results !== undefined) return options.results;
  const projects = args.flatMap((arg, i) => (args[i - 1] === "--project" ? [arg] : []));
  return report(...projects.map((name): [string, string] => [name, "expected"]));
}

/** A machine for `run` ("gate" or "shots") rooted at `root`, and what it records. */
export function fakeMachine(run: Run["name"], root: string, options: FakeOptions = {}): { machine: Machine } & Recorded {
  const recorded: Recorded = { calls: [], lines: [], errors: [], removed: [] };
  const resultsPath = join(root, "build", "browser", run, "results.json");
  const disk = new Map<string, string>(options.stale === undefined ? [] : [[resultsPath, options.stale]]);
  const under = (path: string, dir: string): boolean => path === dir || path.startsWith(dir + "/");
  const onDisk = (path: string): boolean => [...disk.keys()].some((key) => under(key, path));
  const missing = (path: string): boolean =>
    (options.missing ?? []).some((gone) => under(path, isAbsolute(gone) ? gone : join(root, gone)));
  const removed = (path: string): boolean => recorded.removed.some((dir) => under(path, dir));

  const playwrightTest = (args: string[]): number | null => {
    const results = resultsOf(options, args);
    if (results !== null) disk.set(resultsPath, results);
    for (const [path, text] of Object.entries(options.written ?? {})) disk.set(path, text);
    return statusOf(options, "test");
  };
  const spawn: Spawn = (command, args, spawnOptions) => {
    if (args[0] === "--version") return options.noNode ? { status: null } : { status: 0, stdout: "v24.17.0\n" };
    recorded.calls.push({ command, args, cwd: spawnOptions.cwd, stdio: spawnOptions.stdio, env: spawnOptions.env });
    if (args[0] !== PLAYWRIGHT) return { status: statusOf(options, "render"), stdout: "" };
    if (args[1] === "test") return { status: playwrightTest(args), stdout: "" };
    if (args.includes("--dry-run")) return { status: statusOf(options, "dryRun"), stdout: options.dryRun ?? DRY_RUN };
    return { status: statusOf(options, "install"), stdout: "" };
  };

  const machine: Machine = {
    root,
    cwd: options.cwd ?? root,
    host: {
      execPath: "/opt/node/bin/node",
      isNode: true,
      env: { PATH: "/usr/bin:/bin" },
      exists: (path) => onDisk(path) || !(missing(path) || removed(path)),
      listDir: (path) => [...new Set([...disk.keys()].filter((key) => key.startsWith(path + "/")).map((key) => key.slice(path.length + 1).split("/")[0]))],
      spawn,
      home: "/home/u",
    },
    files: {
      readText: (path) => disk.get(path) ?? null,
      remove: (path) => {
        recorded.removed.push(path);
        for (const key of disk.keys()) if (under(key, path)) disk.delete(key);
      },
      makeDir: () => {},
    },
    write: (line) => recorded.lines.push(line),
    writeError: (line) => recorded.errors.push(line),
  };
  return { machine, ...recorded };
}
