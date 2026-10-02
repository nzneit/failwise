// The runner both browser commands share: tools/check-browser.ts (the gate) and the screenshot
// command. It starts Playwright's CLI, the entry under dev/node_modules/.bin, as a child process
// through the Node 24.2 or later that tools/lib/host.ts finds, and turns Playwright's JSON report
// into a verdict that fails closed: an engine asked for that ran no test, a skipped test, a test
// with a status it does not know, or a report that is absent or unreadable each make the run exit 1
// with an UNVERIFIED line. It imports no package; the one file of dev/browser/ it reads is
// matrix.ts. Everything it touches goes through an injected `Machine`, so the tests stand in for
// the machine (tools/lib/fake-machine.ts).

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ENGINES, type Engine } from "../../dev/browser/matrix.ts";
import { defaultHost, findNode, MIN_LABEL, type Host } from "./host.ts";

const PLAYWRIGHT = "dev/node_modules/.bin/playwright";
const RENDER = "skills/fmea-software/scripts/render.ts";
const FIXTURE = "skills/fmea-software/evals/fixtures/checkout-service.fmea.json";
const OUT = "build/browser";
const INSTALL = "run npm ci --prefix dev --ignore-scripts";
const ENGINE_LIST = ENGINES.join(", ");
const NEEDS_ENGINES = `--engines needs a comma-separated list of ${ENGINE_LIST}`;
/** The statuses Playwright's JSON report gives a test; any other, or none, is UNVERIFIED. */
const KNOWN_STATUSES = ["expected", "unexpected", "flaky", "skipped"];

export interface Files {
  readText: (path: string) => string | null; // null when the file is absent or unreadable
  remove: (path: string) => void; // recursive; an absent path is not an error
  makeDir: (path: string) => void; // recursive
}

export interface Machine {
  root: string; // the repository root
  cwd: string; // the caller's working directory, for a relative --report
  host: Host;
  files: Files;
  write: (line: string) => void;
  writeError: (line: string) => void;
}

export interface Run {
  name: "gate" | "shots";
  config: string; // repository-relative path of the Playwright configuration
  fetch: boolean; // whether --fetch and --with-deps are accepted
  prepare?: (machine: Machine) => void;
  after?: (machine: Machine, engines: readonly Engine[], report: string) => boolean;
}

interface Flags {
  engines: Engine[];
  report: string | null;
  fetch: boolean;
  withDeps: boolean;
}

/** The machine and the resolved Node every child is started through. */
interface Context {
  machine: Machine;
  node: string;
}

/** The engines a `--engines` value names, deduplicated and in `ENGINES` order, or the USAGE message. */
function parseEngines(value: string | undefined): Engine[] | string {
  if (value === undefined) return NEEDS_ENGINES;
  const names = value.split(",");
  if (names.includes("")) return NEEDS_ENGINES;
  const unknown = names.find((name) => !(ENGINES as readonly string[]).includes(name));
  if (unknown !== undefined) return `unknown engine ${unknown}; the engines are ${ENGINE_LIST}`;
  return ENGINES.filter((engine) => names.includes(engine));
}

/** Applies one flag to `flags`. Returns how many arguments it took, or the USAGE message. */
function applyFlag(run: Run, flags: Flags, flag: string, value: string | undefined): number | string {
  if (flag === "--engines") {
    const engines = parseEngines(value);
    if (typeof engines === "string") return engines;
    flags.engines = engines;
    return 2;
  }
  if (flag === "--report") {
    if (value === undefined || value === "") return "--report needs a path";
    flags.report = value;
    return 2;
  }
  if (run.fetch && flag === "--fetch") flags.fetch = true;
  else if (run.fetch && flag === "--with-deps") flags.withDeps = true;
  else return `unknown flag ${flag}`;
  return 1;
}

/** Step 1: the flags, or null after a USAGE line. */
function parseFlags(run: Run, argv: string[], writeError: (line: string) => void): Flags | null {
  const flags: Flags = { engines: ["chromium"], report: null, fetch: false, withDeps: false };
  let i = 0;
  while (i < argv.length) {
    const taken = applyFlag(run, flags, argv[i], argv[i + 1]);
    if (typeof taken === "string") {
      writeError(`error USAGE: ${taken}`);
      return null;
    }
    i += taken;
  }
  if (flags.withDeps && !flags.fetch) {
    writeError("error USAGE: --with-deps is only used with --fetch");
    return null;
  }
  return flags;
}

/** Step 3: whether dev/node_modules and Playwright's entry exist, with a TOOLING line for the first absent. */
function toolingPresent(machine: Machine): boolean {
  const absent = ["dev/node_modules", PLAYWRIGHT].find((path) => !machine.host.exists(join(machine.root, path)));
  if (absent === undefined) return true;
  machine.writeError(`error TOOLING: ${absent} is absent; ${INSTALL}`);
  return false;
}

/** Starts `<node> <entry> ...args` from the repository root. */
function start(
  ctx: Context,
  entry: string,
  args: string[],
  stdio: "inherit" | "pipe",
  extraEnv: Record<string, string> = {},
): { status: number | null; stdout?: string | null } {
  const { root, host } = ctx.machine;
  return host.spawn(ctx.node, [entry, ...args], { cwd: root, stdio, env: { ...host.env, ...extraEnv } });
}

/** Starts Playwright's CLI. Returns its exit status, or null after a TOOLING line when it has none. */
function playwright(ctx: Context, args: string[], extraEnv: Record<string, string> = {}): number | null {
  const { status } = start(ctx, PLAYWRIGHT, args, "inherit", extraEnv);
  if (status === null) {
    ctx.machine.writeError(`error TOOLING: playwright could not be started or ended without an exit status; ${INSTALL}`);
  }
  return status;
}

/** Step 4: `playwright install` for the engines named; its exit status is the run's. */
function fetchBrowsers(ctx: Context, flags: Flags): number {
  const status = playwright(ctx, ["install", ...(flags.withDeps ? ["--with-deps"] : []), ...flags.engines]);
  return status ?? 1;
}

/** Step 5: whether every install location `playwright install --dry-run` names exists. */
function browsersPresent(ctx: Context, engines: Engine[]): boolean {
  const dryRun = start(ctx, PLAYWRIGHT, ["install", "--dry-run", ...engines], "pipe");
  const paths = [...String(dryRun.stdout ?? "").matchAll(/^\s*Install location:\s*(\S.*?)\s*$/gm)].map((match) => match[1]);
  if (dryRun.status !== 0 || paths.length === 0) {
    ctx.machine.writeError(`error TOOLING: playwright install --dry-run named no install location; ${INSTALL}`);
    return false;
  }
  const absent = paths.filter((path) => !ctx.machine.host.exists(path));
  for (const path of absent) {
    ctx.machine.writeError(`error BROWSER: ${path} is absent; run node tools/check-browser.ts --fetch --engines ${engines.join(",")}`);
  }
  return absent.length === 0;
}

/** Step 6 with --report: its absolute path, or null after a USAGE line when there is no such file. */
function givenReport(machine: Machine, report: string): string | null {
  const path = resolve(machine.cwd, report);
  if (machine.host.exists(path)) return path;
  machine.writeError(`error USAGE: no such report: ${path}`);
  return null;
}

/** Step 6 without --report: renders the checkout fixture, and returns the report's absolute path or
 *  null after a TOOLING line. */
function renderFixture(ctx: Context): string | null {
  const out = `${OUT}/report.html`;
  ctx.machine.files.makeDir(join(ctx.machine.root, OUT));
  const { status } = start(ctx, RENDER, [FIXTURE, "--out", out, "--force"], "inherit");
  if (status === 0) return join(ctx.machine.root, out);
  ctx.machine.writeError(`error TOOLING: render.ts exited ${status ?? "without a status"}; the checkout fixture could not be rendered`);
  return null;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function items(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

/** Every `specs[].tests[]` entry under `suites`, walked recursively; a missing list is empty. */
function testsOf(suites: unknown[]): unknown[] {
  return suites.flatMap((suite) => [
    ...items(field(suite, "specs")).flatMap((spec) => items(field(spec, "tests"))),
    ...testsOf(items(field(suite, "suites"))),
  ]);
}

/** The tests of Playwright's JSON report, or null when the text is absent, not JSON, or has no `suites` array. */
function reportedTests(text: string | null): unknown[] | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const suites = field(parsed, "suites");
  return Array.isArray(suites) ? testsOf(suites) : null;
}

/** Step 9: whether the report proves every engine asked for ran, nothing was skipped, every test
 *  ended as expected, and Playwright exited 0. Each gap in the proof is an UNVERIFIED line. */
function verdict(machine: Machine, run: Run, engines: Engine[], exitStatus: number): boolean {
  const results = `${OUT}/${run.name}/results.json`;
  const tests = reportedTests(machine.files.readText(join(machine.root, results)));
  if (tests === null) {
    machine.writeError(`error UNVERIFIED: ${results} is absent or is not Playwright's JSON report`);
    return false;
  }
  const unrun = engines.filter((engine) => !tests.some((one) => field(one, "projectName") === engine));
  for (const engine of unrun) machine.writeError(`error UNVERIFIED: no test ran on ${engine}`);
  const statuses = tests.map((one) => String(field(one, "status")));
  const skipped = statuses.filter((status) => status === "skipped").length;
  if (skipped > 0) machine.writeError(`error UNVERIFIED: ${skipped} test(s) were skipped`);
  const unknown = statuses.filter((status) => !KNOWN_STATUSES.includes(status)).length;
  if (unknown > 0) machine.writeError(`error UNVERIFIED: ${unknown} test(s) have a status the runner does not know`);
  // `unexpected` and `flaky` are failures with no coded line; Playwright has printed them.
  const failed = statuses.some((status) => status === "unexpected" || status === "flaky");
  return unrun.length === 0 && skipped === 0 && unknown === 0 && !failed && exitStatus === 0;
}

/** After step 4, before step 5: prepares the run and removes build/browser/<run>, so an earlier
 *  run's output survives no failure from here on and cannot stand in for this run's. */
function clearEarlierRun(machine: Machine, run: Run): void {
  run.prepare?.(machine);
  machine.files.remove(join(machine.root, OUT, run.name));
}

/** Steps 7 to 9: starts `playwright test` and gives the verdict. */
function testRun(ctx: Context, run: Run, engines: Engine[], report: string, version: string): boolean {
  const { machine } = ctx;
  machine.write(`## ${run.name}: playwright test over ${engines.join(", ")} (node v${version})`);
  const projects = engines.flatMap((engine) => ["--project", engine]);
  const status = playwright(ctx, ["test", "--config", run.config, ...projects], { FAILWISE_REPORT: report });
  return status !== null && verdict(machine, run, engines, status);
}

export function runBrowser(run: Run, argv: string[], machine: Machine): number {
  const flags = parseFlags(run, argv, machine.writeError);
  if (!flags) return 1;
  const node = findNode(machine.host);
  if (!node) {
    machine.writeError(`error NODE: no Node ${MIN_LABEL} or later found on PATH, in NVM_BIN, or under nvm's versions directory`);
    return 1;
  }
  if (!toolingPresent(machine)) return 1;
  const ctx: Context = { machine, node: node.path };
  if (flags.fetch) return fetchBrowsers(ctx, flags);
  clearEarlierRun(machine, run);
  if (!browsersPresent(ctx, flags.engines)) return 1;
  const report = flags.report === null ? renderFixture(ctx) : givenReport(machine, flags.report);
  if (report === null) return 1;
  if (!testRun(ctx, run, flags.engines, report, node.version.join("."))) return 1;
  if (run.after && !run.after(machine, flags.engines, report)) return 1;
  const others = ENGINES.filter((engine) => !flags.engines.includes(engine));
  if (others.length > 0) machine.write(`## not run here: ${others.join(", ")}`);
  return 0;
}

export function defaultMachine(): Machine {
  return {
    root: join(import.meta.dirname, "..", ".."),
    cwd: process.cwd(),
    host: defaultHost(),
    files: {
      readText: (path) => {
        try {
          return readFileSync(path, "utf8");
        } catch {
          return null;
        }
      },
      remove: (path) => rmSync(path, { recursive: true, force: true }),
      makeDir: (path) => {
        mkdirSync(path, { recursive: true });
      },
    },
    write: (line) => process.stdout.write(line + "\n"),
    writeError: (line) => process.stderr.write(line + "\n"),
  };
}
