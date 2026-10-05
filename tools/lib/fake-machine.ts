// A fake machine for the tests of the browser runners (tools/lib/browser.ts): Node 24.17 at
// /opt/node/bin/node, every path present unless named as missing, and children that answer as
// Playwright, render.ts, git and tar would without starting anything. Files live in an in-memory
// disk, a map of absolute path to text, which `Files` reads, writes, appends to, copies within and
// removes from and `host.exists` and `host.listDir` consult; the disk may start with files a test
// names (a report's HTML), and the fake `playwright test` call writes its JSON report there and any
// further files a test names. On a compare run the fake children also leave what the real ones
// would: the tar file, the unpacked renderer, each rendered report, each pass's JSON report, the
// first pass's reference images and every attachment a pass reports. `host.listDir` throws for a
// folder with nothing under it, as the real one does for an absent folder. `host.listEntries`
// throws whatever it is asked, because the browser runners do not use it. It holds no test and no
// entry point.

import { isAbsolute, join } from "node:path";
import { VIEWS } from "../../dev/browser/matrix.ts";
import type { Spawn } from "./host.ts";
import type { Machine, Run } from "./browser.ts";

const PLAYWRIGHT = "dev/node_modules/.bin/playwright";
const DRY_RUN = "browser: chromium version 1\n  Install location:    /cache/chromium-1\n  Download url:        https://example.invalid/c.zip\n";
/** Where viewReport's attachments sit: the compare run's folder under the root the tests use, /repo. */
const COMPARE = "/repo/build/compare";
const BEFORE_TREE = "build/compare/before-tree/";

/** The SHA the fake `git merge-base` prints unless a test names another. */
export const MERGE_BASE = "309e081b53da16c037beeae73a3ccebce8db1bd8";

/** Playwright's JSON report with one test per pair of engine and status. */
export const report = (...tests: [string, string][]): string =>
  JSON.stringify({ suites: [{ specs: [], suites: [{ specs: tests.map(([projectName, status]) => ({ tests: [{ projectName, status }] })) }] }] });

type Image = "expected" | "actual" | "diff";

/** One test of a compare pass's JSON report, titled "<view> <stem>", on `engine` (default chromium), with
 *  `status` (default "expected"). `attachments` names which of the three images it carries, as Playwright
 *  1.63.0 writes them: named "<view>/<stem>-expected.png", "-actual.png" and "-diff.png", the first at
 *  /repo/build/compare/refs/<engine>/<view>/<stem>.png and the other two in
 *  /repo/build/compare/output/views.compare.ts-<view>-<stem>-<engine>/<view>/. A failed test also carries
 *  Playwright's fourth attachment, "error-context". `changed: true` is status "unexpected" with all three. */
export interface ViewTest {
  view: string;
  stem: string;
  engine?: string;
  status?: string;
  changed?: boolean;
  attachments?: Image[];
  message?: string;
}

/** The test's output folder, as Playwright names it from the file, the title and the project. */
function outputFolder(test: ViewTest, engine: string): string {
  return `${COMPARE}/output/views.compare.ts-${test.view}-${test.stem}-${engine}`;
}

function image(test: ViewTest, engine: string, kind: Image): { name: string; contentType: string; path: string } {
  const path =
    kind === "expected"
      ? `${COMPARE}/refs/${engine}/${test.view}/${test.stem}.png`
      : `${outputFolder(test, engine)}/${test.view}/${test.stem}-${kind}.png`;
  return { name: `${test.view}/${test.stem}-${kind}.png`, contentType: "image/png", path };
}

/** One spec of a compare pass's JSON report. */
function viewSpec(test: ViewTest): unknown {
  const engine = test.engine ?? "chromium";
  const status = test.status ?? (test.changed === true ? "unexpected" : "expected");
  const kinds: Image[] = test.changed === true ? ["expected", "actual", "diff"] : (test.attachments ?? []);
  const context = { name: "error-context", contentType: "text/markdown", path: `${outputFolder(test, engine)}/error-context.md` };
  const attachments = [...kinds.map((kind) => image(test, engine, kind)), ...(status === "unexpected" ? [context] : [])];
  const errors = test.message === undefined ? [] : [{ message: test.message }];
  return { title: `${test.view} ${test.stem}`, tests: [{ projectName: engine, status, results: [{ attachments, errors }] }] };
}

/** A compare pass's JSON report with one test per view test given. */
export const viewReport = (...tests: ViewTest[]): string =>
  JSON.stringify({ suites: [{ title: "views.compare.ts", specs: tests.map(viewSpec), suites: [] }] });

export interface FakeOptions {
  noNode?: boolean;
  missing?: string[]; // paths that do not exist: absolute, or relative to the root
  dryRun?: string; // what `playwright install --dry-run` prints
  statuses?: {
    render?: number | null;
    install?: number | null;
    dryRun?: number | null;
    test?: number | null;
    gitStatus?: number | null;
    archive?: number | null;
    tar?: number | null;
    renderBefore?: number | null;
    revParse?: number | null; // null: git could not be started
  };
  stderr?: { archive?: string; tar?: string }; // what a failing git archive or tar writes to stderr
  results?: string | null; // what `playwright test` writes to the results file; null writes nothing.
  // Default: one "expected" test per --project named.
  stale?: string; // what the results file holds before the run
  cwd?: string; // default: the root
  written?: Record<string, string>; // further files `playwright test` leaves, by absolute path
  present?: Record<string, string>; // files on the disk before the run, by absolute path
  git?: { commit?: boolean; mergeBase?: string | null; dirty?: boolean }; // defaults: true, MERGE_BASE, false
  rendered?: { before?: string | null; after?: string | null }; // what each render writes on a compare run; default "";
  // null: the render succeeds and writes nothing
  passes?: { 1?: string | null; 2?: string | null }; // what each compare pass writes; null writes nothing
  // Default: one "expected" test per project named, view of VIEWS and stem of FAILWISE_COMPARE_PARTS.
  lost?: string[]; // attachment paths a pass reports but leaves off the disk
  unreferenced?: string[]; // titles "<view> <stem>" pass 1 reports "expected" without writing their reference
  env?: Record<string, string>; // added to the host's environment
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
  writes: string[]; // the paths written, appended or copied to
}

/** What the fake children work on. */
interface Fake {
  run: Run["name"];
  root: string;
  options: FakeOptions;
  disk: Map<string, string>;
}

interface Child {
  status: number | null;
  stdout: string;
  stderr?: string;
}

/** The status the fake gives a child of the given kind: 0 unless `statuses` names it. */
function statusOf(options: FakeOptions, kind: keyof NonNullable<FakeOptions["statuses"]>): number | null {
  const statuses = options.statuses ?? {};
  return kind in statuses ? (statuses[kind] ?? null) : 0;
}

/** The engines a `playwright test` call names with --project. */
function projectsOf(args: string[]): string[] {
  return args.flatMap((arg, i) => (args[i - 1] === "--project" ? [arg] : []));
}

/** What the fake `playwright test` writes as its JSON report. */
function resultsOf(options: FakeOptions, args: string[]): string | null {
  if (options.results !== undefined) return options.results;
  return report(...projectsOf(args).map((name): [string, string] => [name, "expected"]));
}

/** A child of `kind` whose success puts `path` (repository-relative) on the disk. */
function leaving(fake: Fake, kind: "archive" | "tar", path: string): Child {
  const status = statusOf(fake.options, kind);
  if (status === 0) fake.disk.set(join(fake.root, path), kind);
  return { status, stdout: "", stderr: status === 0 ? "" : (fake.options.stderr?.[kind] ?? "") };
}

/** A line of output when `value` is a string, else status 1 and nothing. */
function printing(value: string | null): Child {
  return value === null ? { status: 1, stdout: "" } : { status: 0, stdout: `${value}\n` };
}

/** The fake git, by subcommand. */
const GIT: Record<string, (fake: Fake, args: string[]) => Child> = {
  "rev-parse": (fake) =>
    statusOf(fake.options, "revParse") === null ? { status: null, stdout: "" } : printing(fake.options.git?.commit === false ? null : MERGE_BASE),
  "merge-base": (fake) => {
    const mergeBase = fake.options.git?.mergeBase;
    return printing(mergeBase === undefined ? MERGE_BASE : mergeBase);
  },
  status: (fake) => ({ status: statusOf(fake.options, "gitStatus"), stdout: fake.options.git?.dirty === true ? " M x\n" : "" }),
  archive: (fake, args) => leaving(fake, "archive", (args.find((arg) => arg.startsWith("--output=")) ?? "").slice("--output=".length)),
};

/** A git or tar call. */
function gitOrTar(fake: Fake, command: string, args: string[]): Child {
  if (command === "tar") return leaving(fake, "tar", join(args[args.indexOf("-C") + 1], "skills/fmea-software/scripts/render.ts"));
  const answer = GIT[args[0]];
  return answer === undefined ? { status: 1, stdout: "" } : answer(fake, args.slice(1));
}

/** A render.ts call: the unpacked tree's on `renderBefore`, any other on `render`. On a compare run its
 *  success leaves the side's report at its --out. */
function render(fake: Fake, args: string[]): number | null {
  const before = args[0].startsWith(BEFORE_TREE);
  const status = statusOf(fake.options, before ? "renderBefore" : "render");
  const rendered = fake.options.rendered ?? {};
  const text = before ? rendered.before : rendered.after;
  if (fake.run === "compare" && status === 0 && text !== null) {
    fake.disk.set(join(fake.root, args[args.indexOf("--out") + 1]), text ?? "");
  }
  return status;
}

/** Every test object of a JSON report, with the title of the spec it sits in. */
function testsIn(value: unknown, title = ""): { title: string; test: Record<string, unknown> }[] {
  if (Array.isArray(value)) return value.flatMap((one) => testsIn(one, title));
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  if (typeof record.projectName === "string") return [{ title, test: record }];
  const own = typeof record.title === "string" ? record.title : title;
  return Object.values(record).flatMap((one) => testsIn(one, own));
}

/** Every attachment path a test's results name. */
function attachmentPaths(test: Record<string, unknown>): string[] {
  const results = Array.isArray(test.results) ? (test.results as { attachments?: { path?: unknown }[] }[]) : [];
  return results.flatMap((result) => (result.attachments ?? []).flatMap((one) => (typeof one.path === "string" ? [one.path] : [])));
}

/** What a compare pass leaves beside its JSON report: in pass 1, the reference of each "expected" test not
 *  `unreferenced`; in either, every attachment path but those `lost`. */
function passFiles(fake: Fake, pass: string, results: string): void {
  const unreferenced = fake.options.unreferenced ?? [];
  for (const { title, test } of testsIn(JSON.parse(results))) {
    if (pass === "1" && test.status === "expected" && !unreferenced.includes(title)) {
      const [view, stem] = title.split(" ");
      fake.disk.set(join(fake.root, "build/compare/refs", String(test.projectName), view, `${stem}.png`), "reference");
    }
    for (const path of attachmentPaths(test)) if (!(fake.options.lost ?? []).includes(path)) fake.disk.set(path, "image");
  }
}

/** One `playwright test` pass of a compare run, from FAILWISE_COMPARE_PASS in its environment. */
function comparePass(fake: Fake, args: string[], env: Record<string, string | undefined>): number | null {
  const pass = env.FAILWISE_COMPARE_PASS ?? "";
  const given = (fake.options.passes ?? {})[Number(pass) as 1 | 2];
  const parts = (env.FAILWISE_COMPARE_PARTS ?? "").split(",").filter((stem) => stem !== "");
  const owed = projectsOf(args).flatMap((engine) => VIEWS.flatMap((view) => parts.map((stem) => ({ view: String(view), stem, engine }))));
  const results = given === undefined ? viewReport(...owed) : given;
  if (results !== null) {
    fake.disk.set(join(fake.root, `build/compare/pass${pass}/results.json`), results);
    passFiles(fake, pass, results);
  }
  return statusOf(fake.options, "test");
}

/** A machine for `run` rooted at `root`, and what it records. */
export function fakeMachine(run: Run["name"], root: string, options: FakeOptions = {}): { machine: Machine } & Recorded {
  const recorded: Recorded = { calls: [], lines: [], errors: [], removed: [], writes: [] };
  const resultsPath = join(root, "build", "browser", run, "results.json");
  const disk = new Map<string, string>(Object.entries(options.present ?? {}));
  const fake: Fake = { run, root, options, disk };
  if (options.stale !== undefined) disk.set(resultsPath, options.stale);
  const under = (path: string, dir: string): boolean => path === dir || path.startsWith(dir + "/");
  const onDisk = (path: string): boolean => [...disk.keys()].some((key) => under(key, path));
  const missing = (path: string): boolean =>
    (options.missing ?? []).some((gone) => under(path, isAbsolute(gone) ? gone : join(root, gone)));
  const removed = (path: string): boolean => recorded.removed.some((dir) => under(path, dir));
  const put = (path: string, text: string): void => {
    disk.set(path, text);
    recorded.writes.push(path);
  };

  const playwrightTest = (args: string[], env: Record<string, string | undefined>): number | null => {
    if (run === "compare") return comparePass(fake, args, env);
    const results = resultsOf(options, args);
    if (results !== null) disk.set(resultsPath, results);
    for (const [path, text] of Object.entries(options.written ?? {})) disk.set(path, text);
    return statusOf(options, "test");
  };
  const spawn: Spawn = (command, args, spawnOptions) => {
    if (args[0] === "--version") return options.noNode ? { status: null } : { status: 0, stdout: "v24.17.0\n" };
    recorded.calls.push({ command, args, cwd: spawnOptions.cwd, stdio: spawnOptions.stdio, env: spawnOptions.env });
    if (command === "git" || command === "tar") return gitOrTar(fake, command, args);
    if (args[0] !== PLAYWRIGHT) return { status: render(fake, args), stdout: "" };
    if (args[1] === "test") return { status: playwrightTest(args, spawnOptions.env ?? {}), stdout: "" };
    if (args.includes("--dry-run")) return { status: statusOf(options, "dryRun"), stdout: options.dryRun ?? DRY_RUN };
    return { status: statusOf(options, "install"), stdout: "" };
  };

  const machine: Machine = {
    root,
    cwd: options.cwd ?? root,
    host: {
      execPath: "/opt/node/bin/node",
      isNode: true,
      env: { PATH: "/usr/bin:/bin", ...options.env },
      exists: (path) => onDisk(path) || !(missing(path) || removed(path)),
      listDir: (path) => {
        const below = [...disk.keys()].filter((key) => key.startsWith(path + "/"));
        if (below.length === 0) throw new Error(`ENOENT: no such directory, scandir '${path}'`);
        return [...new Set(below.map((key) => key.slice(path.length + 1).split("/")[0]))];
      },
      listEntries: () => {
        throw new Error("listEntries: not used by the browser runners");
      },
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
      writeText: put,
      appendText: (path, text) => put(path, (disk.get(path) ?? "") + text),
      copy: (from, to) => {
        const text = disk.get(from);
        if (text !== undefined) put(to, text);
        return text !== undefined;
      },
    },
    write: (line) => recorded.lines.push(line),
    writeError: (line) => recorded.errors.push(line),
  };
  return { machine, ...recorded };
}
