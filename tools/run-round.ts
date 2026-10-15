// tools/run-round.ts <stage> [--parallel <n>] [--force-parallel] [--cells p<prompt>:<capability>:<run>,...] [--no-canary] [--publish-root <dir>]
//
// One sixteen-run eval round of the prose evals (prose design 2026-10-14, §8.1)
// on DeepSeek Flash through the Anthropic-compatible gateway, run in parallel
// rather than one cell after another (§11.5 ruling 10: built while round 1b ran,
// used from the stage-2 round on). The roster is the sequential script's:
// prompts 1, 5, 6 and 7 at high and medium, runs 1 and 2, in that order. Each
// cell is one tools/run-eval.sh child, which already gives a run its own
// working, plugin and config folders, its own /autocompact probe and its own
// publish folder, so cells share nothing but the gateway.
//
//   node tools/run-round.ts 2                        the whole round, four at once
//   node tools/run-round.ts 2 --parallel 6           six at once
//   node tools/run-round.ts 2 --no-canary --cells p5:high:2,p6:medium:1
//                                                    a re-run of named cells
//
// The same command works in bash and fish, and `bun tools/run-round.ts …` works
// too. The steps:
//
// 1. Preflight, as the sequential script does. The DeepSeek key is read from
//    the login keyring (`secret-tool search --all service goose`, the JSON
//    field DEEPSEEK_API_KEY) and is never printed or written; with no key the
//    launch is refused. The environment gets ANTHROPIC_BASE_URL,
//    ANTHROPIC_AUTH_TOKEN, FMEA_EVAL_MODELS and DISABLE_AUTOUPDATER=1, and nvm's
//    newest node goes first on PATH ($NVM_DIR, or ~/.nvm). node and claude must
//    be on PATH; their paths and the CLI version are printed. One cheap call
//    through the gateway, under a fresh CLAUDE_CONFIG_DIR that is removed after,
//    must answer `ok`; otherwise its reply is printed with the key and its last
//    four characters replaced, and the launch is refused. Before any of this, a
//    cell whose run folder already holds a transcript is refused, as
//    tools/run-eval.sh would refuse it after the canary.
// 2. The canary: the first cell runs alone to the end. A canary that refuses or
//    ends with an artefact missing stops the round, the sequential script's
//    first-refusal guard kept. --no-canary skips it, for a re-run of named cells.
// 3. The fan-out: the other cells, at most --parallel at once (4 by default;
//    above 8 only with --force-parallel, since each session takes a core and 1
//    to 2 GB). Each child's stdout and stderr go to
//    <root>/logs/p<p>-<cap>-run<n>.log. A child gets the environment of step 1,
//    the repository root as its working folder, no stdin and a process group of
//    its own, so the controlling terminal's signals reach the launcher alone.
// 4. The output: the summary lines in roster order once all are in, then a
//    `round finished` line with the elapsed time, the concurrency and the
//    canary, then the run folders. Exit 0 when every line shows every artefact
//    present, validate_exit=0 and final=complete; otherwise exit 1 after naming
//    the cells to re-run and the --cells command that re-runs them.
// 5. The record: <root>/round.json (tools/lib/round-record.ts), which
//    tools/eval-report.ts reads for its Harness section. A --cells launch into a
//    round that has one replaces those cells' entries and keeps the round's own
//    fields.
// 6. Signals: on SIGINT or SIGTERM every running child's process group gets
//    SIGTERM, and after 30 seconds SIGKILL; the launcher writes round.json and
//    exits 130. The finished cells' folders stay in place.
//
// The publish root is build/evals/prose-<stage>/ unless --publish-root names
// another folder. FMEA_RUN_EVAL names another one-cell runner and
// FMEA_SECRET_TOOL another keyring command, so tools/run-round.test.ts can run
// the launcher on stubs and never read the real keyring.

import { spawn, spawnSync, type ChildProcess, type SpawnSyncReturns } from "node:child_process";
import { accessSync, appendFileSync, closeSync, constants, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import process from "node:process";
import { isEntry } from "./lib/entry.ts";
import { elapsedText, readRoundRecord, type RoundCell, type RoundRecord } from "./lib/round-record.ts";

const ROOT = resolve(import.meta.dirname, "..");
const MODEL = "deepseek-flash";
const GATEWAY = "https://api.deepseek.com/anthropic";
const DEFAULT_PARALLEL = 4;
const MAX_PARALLEL = 8;
const GRACE_MS = 30_000;
const SMOKE_TIMEOUT_MS = 300_000;
const USAGE = "usage: node tools/run-round.ts <stage> [--parallel <n>] [--force-parallel] [--cells p<prompt>:<capability>:<run>,...] [--no-canary] [--publish-root <dir>]";
const VALUE_FLAGS = ["--parallel", "--cells", "--publish-root"];
const SWITCHES = ["--force-parallel", "--no-canary"];

/** One cell of the roster: a prompt at a model capability, one run of it. */
interface Cell { prompt: number; capability: string; run: number }

const ROSTER: Cell[] = [1, 5, 6, 7].flatMap((prompt) =>
  ["high", "medium"].flatMap((capability) => [1, 2].map((run) => ({ prompt, capability, run }))));

/** The fields a finished cell's summary line must carry, in the line's order, and the value each must have. */
const CLEAN: [string, string][] = [
  ["analysis", "present"], ["report", "present"], ["validate_exit", "0"],
  ["invocations", "present"], ["context", "present"], ["final", "complete"],
];

function cellId(c: Cell): string {
  return `p${c.prompt}:${c.capability}:${c.run}`;
}

function summaryPrefix(c: Cell): string {
  return `p${c.prompt} ${c.capability} run${c.run}: `;
}

function runDir(root: string, c: Cell): string {
  return join(root, `p${c.prompt}`, c.capability, `run${c.run}`);
}

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function refuse(line: string): null {
  process.stderr.write(`${line}\n`);
  return null;
}

/** What the command line asks for. */
interface Options {
  stage: string;
  parallel: number;
  /** The cells to run, in roster order. */
  cells: Cell[];
  cellsGiven: boolean;
  canary: boolean;
  publishRoot: string;
  /** The publish root as --publish-root gave it, resolved, or null for the default. */
  publishRootGiven: string | null;
}

/** The flags after the stage, or null for an unknown flag or a value flag with no value. */
function readFlags(rest: string[]): Map<string, string> | null {
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (SWITCHES.includes(flag)) {
      flags.set(flag, "");
    } else if (VALUE_FLAGS.includes(flag) && value !== undefined) {
      flags.set(flag, value);
      i++;
    } else {
      return null;
    }
  }
  return flags;
}

/** --parallel's value, or the refusal. */
function parseParallel(text: string, force: boolean): number | string {
  if (!/^[1-9][0-9]*$/.test(text)) return `error: --parallel takes a whole number from 1, not '${text}'`;
  const n = Number(text);
  if (n > MAX_PARALLEL && !force) {
    return `error: --parallel ${n} is above ${MAX_PARALLEL}; each cell takes a core and 1 to 2 GB, so pass --force-parallel to run more than ${MAX_PARALLEL} at once`;
  }
  return n;
}

/** --cells' cells in roster order, or the refusal: an entry that is not p<prompt>:<capability>:<run>, a cell outside the roster, or one named twice. */
function parseCells(text: string): Cell[] | string {
  const named = new Set<string>();
  for (const entry of text.split(",")) {
    const m = /^p?(\d+):(high|medium):(\d+)$/.exec(entry);
    if (m === null) return `error: --cells entry '${entry}' is not p<prompt>:<capability>:<run>`;
    const id = `p${Number(m[1])}:${m[2]}:${Number(m[3])}`;
    if (!ROSTER.some((c) => cellId(c) === id)) {
      return `error: --cells names ${id}, which is not a cell of the roster (prompts 1, 5, 6, 7 at high and medium, runs 1 and 2)`;
    }
    if (named.has(id)) return `error: --cells names ${id} twice`;
    named.add(id);
  }
  return ROSTER.filter((c) => named.has(cellId(c)));
}

/** The options, or the line that refuses them. */
function parseArgs(argv: string[]): Options | string {
  const [stage, ...rest] = argv;
  const flags = readFlags(rest);
  if (stage === undefined || !/^[0-9][a-z]?$/.test(stage) || flags === null) return USAGE;
  const parallel = parseParallel(flags.get("--parallel") ?? String(DEFAULT_PARALLEL), flags.has("--force-parallel"));
  if (typeof parallel === "string") return parallel;
  const cellsText = flags.get("--cells");
  const cells = cellsText === undefined ? ROSTER : parseCells(cellsText);
  if (typeof cells === "string") return cells;
  const given = flags.get("--publish-root");
  const publishRootGiven = given === undefined ? null : resolve(given);
  return {
    stage, parallel, cells, cellsGiven: cellsText !== undefined, canary: !flags.has("--no-canary"),
    publishRoot: publishRootGiven ?? join(ROOT, "build", "evals", `prose-${stage}`), publishRootGiven,
  };
}

function roundFile(opts: Options): string {
  return join(opts.publishRoot, "round.json");
}

/** Why the launch cannot go ahead before the keyring is read, or null: a run folder already holding a transcript, or a --cells launch into an unreadable round.json. */
function guardProblem(opts: Options): string | null {
  const taken = opts.cells.map((c) => runDir(opts.publishRoot, c)).find((d) => existsSync(join(d, "transcript.json")));
  if (taken !== undefined) return `error: ${taken} already holds a transcript; delete the folder to re-run the cell`;
  if (opts.cellsGiven && readRoundRecord(roundFile(opts)) === "unreadable") {
    return `error: ${roundFile(opts)} is not a round record; move it aside before re-running cells into this round`;
  }
  return null;
}

/** The DeepSeek key from the first `secret = ` line whose JSON carries it, or "" when none does; the command's exit status is not read. */
function readKey(env: NodeJS.ProcessEnv): string {
  const r = spawnSync(env.FMEA_SECRET_TOOL ?? "secret-tool", ["search", "--all", "service", "goose"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  for (const line of (r.stdout ?? "").split("\n")) {
    if (!line.startsWith("secret = ")) continue;
    const key = keyOf(line.slice("secret = ".length));
    if (key !== "") return key;
  }
  return "";
}

function keyOf(json: string): string {
  try {
    const parsed: unknown = JSON.parse(json);
    const key = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>).DEEPSEEK_API_KEY : undefined;
    return typeof key === "string" ? key : "";
  } catch {
    return "";
  }
}

/** Text with the key and its last four characters replaced and whitespace runs collapsed, as the sequential script's redact() treats a reply. */
export function redact(text: string, key: string): string {
  let out = text;
  if (key !== "") {
    out = out.split(key).join("<key>");
    if (key.length >= 4) out = out.split(key.slice(-4)).join("<key-tail>");
  }
  return out.split(/\s+/).filter((w) => w !== "").join(" ");
}

/** Whether the smoke call's reply is the word ok alone, in any case, with punctuation around it at most. */
export function isOkReply(text: string): boolean {
  return /^\W*ok\W*$/i.test(text.trim());
}

/** nvm's newest node bin folder by version, or null when nvm holds none. */
function newestNvmBin(nvmDir: string): string | null {
  const versions = join(nvmDir, "versions", "node");
  let names: string[];
  try {
    names = readdirSync(versions);
  } catch {
    return null;
  }
  const parts = (name: string): number[] => name.slice(1).split(".").map(Number);
  const byVersion = (a: string, b: string): number => {
    const [x, y] = [parts(a), parts(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  };
  const newest = names.filter((n) => /^v\d+\.\d+\.\d+$/.test(n) && existsSync(join(versions, n, "bin"))).sort(byVersion).pop();
  return newest === undefined ? null : join(versions, newest, "bin");
}

/** The first executable file of that name on PATH, or null. */
function onPath(name: string, path: string): string | null {
  for (const dir of path.split(delimiter).filter((d) => d !== "")) {
    const file = join(dir, name);
    try {
      accessSync(file, constants.X_OK);
      if (statSync(file).isFile()) return file;
    } catch {
      // not here; the next folder
    }
  }
  return null;
}

/** The first line of a command's output, stdout before stderr. */
function firstLine(command: string, args: string[], env: Record<string, string>): string {
  const r = spawnSync(command, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n")[0].trim();
}

/** The environment of step 1: the launcher's own, the gateway and the model table, the updater off, nvm's newest node first on PATH. */
function roundEnv(key: string, publishRoot: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) if (value !== undefined) env[name] = value;
  const nvmBin = newestNvmBin(env.NVM_DIR ?? join(homedir(), ".nvm"));
  return {
    ...env,
    PATH: nvmBin === null ? env.PATH ?? "" : `${nvmBin}${delimiter}${env.PATH ?? ""}`,
    ANTHROPIC_BASE_URL: GATEWAY,
    ANTHROPIC_AUTH_TOKEN: key,
    FMEA_EVAL_MODELS: `high=${MODEL},medium=${MODEL}`,
    DISABLE_AUTOUPDATER: "1",
    FMEA_EVAL_PUBLISH_ROOT: publishRoot,
  };
}

/**
 * One cheap call through the gateway under a fresh config folder, removed on
 * both paths: true when it exits 0 and answers ok, otherwise false after
 * printing the reply's last lines redacted and the refusal.
 */
function smokeTest(claude: string, env: Record<string, string>, key: string): boolean {
  say("smoke testing the gateway...");
  const config = mkdtempSync(join(tmpdir(), "fmea-smoke-config-"));
  let r: SpawnSyncReturns<string>;
  try {
    r = spawnSync(claude, ["-p", "Reply with the single word ok.", "--model", MODEL, "--max-turns", "1", "--no-session-persistence"], {
      env: { ...env, CLAUDE_CONFIG_DIR: config }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: SMOKE_TIMEOUT_MS,
    });
  } finally {
    rmSync(config, { recursive: true, force: true });
  }
  if (r.status === 0 && isOkReply(r.stdout ?? "")) {
    say("gateway answered");
    return true;
  }
  const reply = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd().split("\n").slice(-5).join("\n");
  refuse(`smoke reply (exit ${r.status ?? r.signal ?? "none"}, redacted): ${redact(reply, key)}`);
  refuse("refusing: the gateway did not answer with 'ok'; fix the key or the endpoint before running the round");
  return false;
}

/** What the preflight hands the round: the children's environment, the key for redaction and the CLI version. */
interface Preflight { env: Record<string, string>; key: string; cliVersion: string }

/** Step 1, or null after printing the refusal. */
function preflight(opts: Options): Preflight | null {
  const key = readKey(process.env);
  if (key === "") return refuse("NO KEY: refusing");
  const env = roundEnv(key, opts.publishRoot);
  const node = onPath("node", env.PATH);
  if (node === null) return refuse("refusing: node is not on PATH");
  const claude = onPath("claude", env.PATH);
  if (claude === null) return refuse("refusing: claude is not on PATH");
  say(`node=${node} (${redact(firstLine(node, ["-v"], env), key)})`);
  say(`claude=${claude}`);
  const version = redact(firstLine(claude, ["--version"], env), key);
  say(`claude_version=${version}`);
  if (!smokeTest(claude, env, key)) return null;
  return { env, key, cliVersion: version.split(" ")[0] };
}

/** The state the cells share: where they log, what they run with, which children are running, and whether a signal stopped the round. */
interface Round {
  opts: Options;
  pre: Preflight;
  runner: string;
  logs: string;
  running: Set<ChildProcess>;
  stopping: boolean;
  /** How many cells were running when the signal came. */
  stopped: number;
}

/** A finished cell: the cell, its record and its log. */
interface CellRun { cell: Cell; record: RoundCell; log: string }

function clock(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** Starts the runner for one cell, its stdout and stderr in its log, and resolves with its exit status, or null when it ended on a signal or did not start. */
function startRunner(round: Round, cell: Cell, log: string): Promise<number | null> {
  return new Promise((done) => {
    const fd = openSync(log, "w");
    let settled = false;
    const finish = (code: number | null, child?: ChildProcess): void => {
      if (settled) return;
      settled = true;
      if (child !== undefined) round.running.delete(child);
      done(code);
    };
    try {
      const child = spawn(round.runner, [String(cell.prompt), cell.capability, String(cell.run)], { cwd: ROOT, env: round.pre.env, stdio: ["ignore", fd, fd], detached: true });
      round.running.add(child);
      child.once("error", (err) => {
        appendFileSync(log, `run-round: ${round.runner} did not run: ${err.message}\n`);
        finish(null, child);
      });
      child.once("close", (code) => finish(code, child));
    } catch (err) {
      appendFileSync(log, `run-round: ${round.runner} did not start: ${String(err)}\n`);
      finish(null);
    } finally {
      closeSync(fd);
    }
  });
}

/** The last summary line the cell's runner wrote to its log, redacted, or null. */
function summaryOf(log: string, cell: Cell, key: string): string | null {
  let text = "";
  try {
    text = readFileSync(log, "utf8");
  } catch {
    return null;
  }
  const line = text.split("\n").filter((l) => l.startsWith(`${summaryPrefix(cell)}model=`)).pop();
  return line === undefined ? null : redact(line, key);
}

async function runCell(round: Round, cell: Cell): Promise<CellRun> {
  const log = join(round.logs, `p${cell.prompt}-${cell.capability}-run${cell.run}.log`);
  const started = new Date().toISOString();
  say(`[${clock()}] started ${cellId(cell)}`);
  const exit = await startRunner(round, cell, log);
  const ended = new Date().toISOString();
  say(`[${clock()}] ended ${cellId(cell)} (exit ${exit ?? "none"})`);
  return { cell, log, record: { cell: cellId(cell), started, ended, exit, summary: summaryOf(log, cell, round.pre.key) } };
}

/** What keeps a cell from being clean; `stops` marks what stops the round when the canary has it: a refusal or an artefact missing. */
interface Problem { text: string; stops: boolean }

function problemsOf(r: RoundCell): Problem[] {
  const problems: Problem[] = [];
  if (r.exit !== 0) problems.push({ text: r.exit === null ? "no exit status" : `exit ${r.exit}`, stops: true });
  if (r.summary === null) return [...problems, { text: "no summary line", stops: true }];
  const fields = new Map([...r.summary.matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1], m[2]]));
  for (const [name, want] of CLEAN) {
    const got = fields.get(name);
    if (got === undefined) problems.push({ text: `no ${name} field`, stops: true });
    else if (got !== want) problems.push({ text: `${name}=${got}`, stops: got === "missing" });
  }
  return problems;
}

function problemText(problems: Problem[]): string {
  return problems.map((p) => p.text).join(", ");
}

/** Runs the items with at most `limit` at once, starting none once `stopped` holds, and resolves with the results in the items' order. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>, stopped: () => boolean): Promise<R[]> {
  const results: (R | undefined)[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length && !stopped()) {
      const i = next++;
      results[i] = await work(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results.filter((r): r is R => r !== undefined);
}

/** A signal to a child's process group, which holds the runner and the claude sessions under it. */
function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // the group has already gone
  }
}

function onSignal(round: Round): void {
  if (round.stopping) return;
  round.stopping = true;
  round.stopped = round.running.size;
  for (const child of round.running) signalGroup(child, "SIGTERM");
  setTimeout(() => {
    for (const child of round.running) signalGroup(child, "SIGKILL");
  }, GRACE_MS).unref();
}

/** round.json: this launch's record, or, for a --cells launch into a round that has one, that record with these cells' entries replaced. */
function writeRecord(round: Round, started: Date, ended: Date, runs: CellRun[]): void {
  const { opts } = round;
  const cells = runs.map((r) => r.record);
  const prior = opts.cellsGiven ? readRoundRecord(roundFile(opts)) : "missing";
  const record: RoundRecord = typeof prior === "string"
    ? { method: "parallel", concurrency: opts.parallel, canary: opts.canary ? cellId(opts.cells[0]) : null, started: started.toISOString(), ended: ended.toISOString(), cli_version: round.pre.cliVersion, cells }
    : { ...prior, cells: mergedCells(prior.cells, cells) };
  writeFileSync(roundFile(opts), `${JSON.stringify(record, null, 2)}\n`);
}

function mergedCells(prior: RoundCell[], fresh: RoundCell[]): RoundCell[] {
  const byId = new Map(prior.map((c) => [c.cell, c]));
  for (const c of fresh) byId.set(c.cell, c);
  const place = (id: string): number => {
    const i = ROSTER.findIndex((c) => cellId(c) === id);
    return i === -1 ? ROSTER.length : i;
  };
  return [...byId.values()].sort((a, b) => place(a.cell) - place(b.cell));
}

function summaryText(r: CellRun): string {
  return r.record.summary ?? `${summaryPrefix(r.cell)}no summary line (exit ${r.record.exit ?? "none"}); log ${r.log}`;
}

/** Every folder under the publish root that holds a transcript, sorted, as the sequential script lists them. */
function runFolders(root: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(root, { recursive: true, encoding: "utf8" });
  } catch {
    return [];
  }
  return entries.filter((e) => basename(e) === "transcript.json").map((e) => join(root, dirname(e))).sort();
}

/** Steps 4 and 5 after the fan-out: the lines in roster order, the round-finished line, the run folders, and the cells to re-run; 0 when every cell is clean. */
function report(round: Round, elapsed: number, runs: CellRun[]): number {
  const { opts } = round;
  for (const r of runs) say(summaryText(r));
  say("");
  say(`round finished: ${elapsedText(elapsed)}, concurrency ${opts.parallel}, canary ${opts.canary ? cellId(opts.cells[0]) : "none"}; runs under ${opts.publishRoot}:`);
  for (const dir of runFolders(opts.publishRoot)) say(dir);
  const failing = runs.map((r) => ({ r, problems: problemsOf(r.record) })).filter((x) => x.problems.length > 0);
  if (failing.length === 0) return 0;
  say("");
  say(`cells to re-run: ${failing.map((f) => `${cellId(f.r.cell)} (${problemText(f.problems)})`).join(", ")}`);
  const published = failing.map((f) => runDir(opts.publishRoot, f.r.cell)).filter((d) => existsSync(d));
  if (published.length > 0) say(`delete each published one first: ${published.join(" ")}`);
  const root = opts.publishRootGiven === null ? "" : ` --publish-root ${opts.publishRootGiven}`;
  say(`re-run them with: node tools/run-round.ts ${opts.stage} --no-canary --cells ${failing.map((f) => cellId(f.r.cell)).join(",")}${root}`);
  return 1;
}

/** The canary alone: null when the round goes on, otherwise the exit status after saying why it stopped. */
function canaryVerdict(round: Round, canary: CellRun): number | null {
  const problems = problemsOf(canary.record);
  if (round.stopping || !problems.some((p) => p.stops)) return null;
  say(summaryText(canary));
  say("");
  say(`round stopped: the canary ${cellId(canary.cell)} ended with ${problemText(problems)}; no other cell was started; log ${canary.log}`);
  const dir = runDir(round.opts.publishRoot, canary.cell);
  if (existsSync(dir)) say(`delete ${dir} before launching the round again`);
  return 1;
}

/** Steps 2 to 6. */
async function runRound(opts: Options, pre: Preflight): Promise<number> {
  const round: Round = {
    opts, pre, runner: process.env.FMEA_RUN_EVAL ?? join(ROOT, "tools", "run-eval.sh"),
    logs: join(opts.publishRoot, "logs"), running: new Set(), stopping: false, stopped: 0,
  };
  mkdirSync(round.logs, { recursive: true });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => onSignal(round));
  const started = new Date();
  const runs: CellRun[] = [];
  let rest = opts.cells;
  if (opts.canary) {
    const canary = await runCell(round, opts.cells[0]);
    runs.push(canary);
    rest = opts.cells.slice(1);
    const stop = canaryVerdict(round, canary);
    if (stop !== null) {
      writeRecord(round, started, new Date(), runs);
      return stop;
    }
  }
  runs.push(...await pool(rest, opts.parallel, (cell) => runCell(round, cell), () => round.stopping));
  const ended = new Date();
  writeRecord(round, started, ended, runs);
  if (round.stopping) {
    say(`round interrupted: ${round.stopped} running cells were sent SIGTERM; the finished cells' folders are in place under ${opts.publishRoot}`);
    return 130;
  }
  return report(round, ended.getTime() - started.getTime(), runs);
}

async function main(argv: string[]): Promise<number> {
  const opts = parseArgs(argv);
  const problem = typeof opts === "string" ? opts : guardProblem(opts);
  if (problem !== null || typeof opts === "string") {
    refuse(problem ?? USAGE);
    return 1;
  }
  const pre = preflight(opts);
  return pre === null ? 1 : runRound(opts, pre);
}

if (isEntry(import.meta)) process.exit(await main(process.argv.slice(2)));
