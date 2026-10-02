// The runner both browser commands share: tools/check-browser.ts (the gate) and the screenshot
// command. It starts Playwright's CLI, the entry under dev/node_modules/.bin, as a child process
// through the Node 24.2 or later that tools/lib/host.ts finds, and turns Playwright's JSON report
// into a verdict that fails closed: an engine asked for that ran no test, a skipped test, a test
// with a status it does not know, or a report that is absent or unreadable each make the run exit 1
// with an UNVERIFIED line. It imports no package; the one file of dev/browser/ it reads is
// matrix.ts. Everything it touches goes through an injected `Machine`, so the tests stand in for
// the machine (tools/lib/fake-machine.ts).

import { appendFileSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
  writeText: (path: string, text: string) => void; // creates the parent folder
  appendText: (path: string, text: string) => void; // creates the file when absent
  copy: (from: string, to: string) => boolean; // creates the parent folder; false when `from` cannot be copied
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
  name: "gate" | "shots" | "compare";
  config: string; // repository-relative path of the Playwright configuration
  out: string; // repository-relative folder removed before the run; the default results file is <out>/results.json
  accepts: { fetch: boolean; report: boolean; base: boolean }; // the optional flags it takes; any other is "unknown flag"
  prepare?: (machine: Machine) => void;
  /** Steps 6 to 10 when given: the run renders, runs Playwright and judges for itself. */
  execute?: (session: Session) => boolean;
  after?: (machine: Machine, engines: readonly Engine[], report: string) => boolean;
}

/** What `execute` works with. Every child is started from the repository root. */
export interface Session {
  machine: Machine;
  engines: readonly Engine[];
  base: string; // --base; "main" when not given
  nodeVersion: string; // "24.17.0"
  /** Starts `<node> <renderer> <input> --out <out> --force` with stdio "inherit"; its exit status. */
  render: (renderer: string, input: string, out: string) => number | null;
  /** Starts `<node> <playwright> test --config <run.config> --project <engine>... ...args` with stdio "inherit" and
   *  `env` added; its exit status, or null after a TOOLING line. */
  playwright: (args: string[], env: Record<string, string>) => number | null;
  /** The tests of the Playwright JSON report at `results` (repository-relative); null when absent or not one. */
  readTests: (results: string) => ReportedTest[] | null;
  /** Starts `command ...args` from the root with stdio "pipe": git and tar. */
  exec: (command: string, args: string[]) => { status: number | null; stdout: string; stderr: string };
}

/** One test of a JSON report. */
export interface ReportedTest {
  title: string; // the spec's title
  projectName: string;
  status: string; // String(field), so "undefined" when absent
  attachments: { name: string; path: string }[]; // of the last result; one without a string path is left out
  message: string; // the first error message of the last result; "" when none
}

interface Flags {
  engines: Engine[];
  report: string | null;
  base: string | null;
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

/** Sets a flag that takes a value: returns 2, the arguments it took, or `needs` when the value is missing or empty. */
function applyValue(flags: Flags, key: "report" | "base", value: string | undefined, needs: string): number | string {
  if (value === undefined || value === "") return needs;
  flags[key] = value;
  return 2;
}

/** Applies one flag to `flags`. Returns how many arguments it took, or the USAGE message. */
function applyFlag(run: Run, flags: Flags, flag: string, value: string | undefined): number | string {
  if (flag === "--engines") {
    const engines = parseEngines(value);
    if (typeof engines === "string") return engines;
    flags.engines = engines;
    return 2;
  }
  const { accepts } = run;
  if (accepts.report && flag === "--report") return applyValue(flags, "report", value, "--report needs a path");
  if (accepts.base && flag === "--base") return applyValue(flags, "base", value, "--base needs a commit");
  if (accepts.fetch && flag === "--fetch") flags.fetch = true;
  else if (accepts.fetch && flag === "--with-deps") flags.withDeps = true;
  else return `unknown flag ${flag}`;
  return 1;
}

/** Step 1: the flags, or null after a USAGE line. */
function parseFlags(run: Run, argv: string[], writeError: (line: string) => void): Flags | null {
  const flags: Flags = { engines: ["chromium"], report: null, base: null, fetch: false, withDeps: false };
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
function renderFixture(session: Session): string | null {
  const { machine } = session;
  const out = `${OUT}/report.html`;
  machine.files.makeDir(join(machine.root, OUT));
  const status = session.render(RENDER, FIXTURE, out);
  if (status === 0) return join(machine.root, out);
  machine.writeError(`error TOOLING: render.ts exited ${status ?? "without a status"}; the checkout fixture could not be rendered`);
  return null;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function items(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

/** The value when it is a string, else "". */
function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** One `specs[].tests[]` entry of the spec titled `title`, as the runners read it. */
function reportedTest(title: string, one: unknown): ReportedTest {
  const last = items(field(one, "results")).at(-1);
  const attachments = items(field(last, "attachments"))
    .filter((attachment) => typeof field(attachment, "path") === "string")
    .map((attachment) => ({ name: stringOf(field(attachment, "name")), path: stringOf(field(attachment, "path")) }));
  const message = stringOf(field(items(field(last, "errors"))[0], "message"));
  return { title, projectName: stringOf(field(one, "projectName")), status: String(field(one, "status")), attachments, message };
}

/** Every `specs[].tests[]` entry under `suites`, walked recursively; a missing list is empty. */
function testsOf(suites: unknown[]): ReportedTest[] {
  return suites.flatMap((suite) => [
    ...items(field(suite, "specs")).flatMap((spec) =>
      items(field(spec, "tests")).map((one) => reportedTest(stringOf(field(spec, "title")), one)),
    ),
    ...testsOf(items(field(suite, "suites"))),
  ]);
}

/** The tests of Playwright's JSON report, or null when the text is absent, not JSON, or has no `suites` array. */
function reportedTests(text: string | null): ReportedTest[] | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const suites = field(parsed, "suites");
  if (!Array.isArray(suites)) return null;
  return testsOf(suites);
}

/** Step 9: whether the report at `<out>/results.json` proves every engine asked for ran, nothing was
 *  skipped, every test ended as expected, and Playwright exited 0. Each gap in the proof is an
 *  UNVERIFIED line. */
function verdict(session: Session, out: string, exitStatus: number): boolean {
  const { machine, engines } = session;
  const results = `${out}/results.json`;
  const tests = session.readTests(results);
  if (tests === null) {
    machine.writeError(`error UNVERIFIED: ${results} is absent or is not Playwright's JSON report`);
    return false;
  }
  const unrun = engines.filter((engine) => !tests.some((one) => one.projectName === engine));
  for (const engine of unrun) machine.writeError(`error UNVERIFIED: no test ran on ${engine}`);
  const statuses = tests.map((one) => one.status);
  const skipped = statuses.filter((status) => status === "skipped").length;
  if (skipped > 0) machine.writeError(`error UNVERIFIED: ${skipped} test(s) were skipped`);
  const unknown = statuses.filter((status) => !KNOWN_STATUSES.includes(status)).length;
  if (unknown > 0) machine.writeError(`error UNVERIFIED: ${unknown} test(s) have a status the runner does not know`);
  // `unexpected` and `flaky` are failures with no coded line; Playwright has printed them.
  const failed = statuses.some((status) => status === "unexpected" || status === "flaky");
  return unrun.length === 0 && skipped === 0 && unknown === 0 && !failed && exitStatus === 0;
}

/** After step 4, before step 5: prepares the run and removes its folder, `run.out`, so an earlier
 *  run's output survives no failure from here on and cannot stand in for this run's. */
function clearEarlierRun(machine: Machine, run: Run): void {
  run.prepare?.(machine);
  machine.files.remove(join(machine.root, run.out));
}

/** What steps 6 to 10 work with: every child started through the resolved Node from the root. */
function openSession(ctx: Context, run: Run, flags: Flags, nodeVersion: string): Session {
  const { machine } = ctx;
  const projects = flags.engines.flatMap((engine) => ["--project", engine]);
  return {
    machine,
    engines: flags.engines,
    base: flags.base ?? "main",
    nodeVersion,
    render: (renderer, input, out) => start(ctx, renderer, [input, "--out", out, "--force"], "inherit").status,
    playwright: (args, env) => playwright(ctx, ["test", "--config", run.config, ...projects, ...args], env),
    readTests: (results) => reportedTests(machine.files.readText(join(machine.root, results))),
    exec: (command, args) => {
      const { root, host } = machine;
      const { status, stdout, stderr } = host.spawn(command, args, { cwd: root, stdio: "pipe", env: { ...host.env } });
      return { status, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
    },
  };
}

/** Steps 6 to 10 for a run with no `execute`: the report, `playwright test` over it, the verdict,
 *  then the run's own `after`. */
function defaultExecute(run: Run, session: Session, flags: Flags): boolean {
  const { machine, engines } = session;
  const report = flags.report === null ? renderFixture(session) : givenReport(machine, flags.report);
  if (report === null) return false;
  machine.write(`## ${run.name}: playwright test over ${engines.join(", ")} (node v${session.nodeVersion})`);
  const status = session.playwright([], { FAILWISE_REPORT: report });
  if (status === null || !verdict(session, run.out, status)) return false;
  return run.after === undefined || run.after(machine, engines, report);
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
  const session = openSession(ctx, run, flags, node.version.join("."));
  if (!(run.execute ? run.execute(session) : defaultExecute(run, session, flags))) return 1;
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
      writeText: (path, text) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
      },
      appendText: (path, text) => appendFileSync(path, text),
      copy: (from, to) => {
        try {
          mkdirSync(dirname(to), { recursive: true });
          copyFileSync(from, to);
          return true;
        } catch {
          return false;
        }
      },
    },
    write: (line) => process.stdout.write(line + "\n"),
    writeError: (line) => process.stderr.write(line + "\n"),
  };
}
