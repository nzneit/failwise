// The work tracking commands of §6: `plan`, `apply` and `refresh`. The only unit of the feature
// that reads and writes the analysis document, and in it only `actions[].tracker`. It drives a
// tracker through the four methods of the seam; the provider, the clock, the sleep and stdout are
// injected, so the tests run against a fake and wait for nothing.

import { Buffer } from "node:buffer";
import process from "node:process";
import { ScriptError, formatError } from "./lib/codes.ts";
import type { Code } from "./lib/codes.ts";
import type { ActionStatus, FmeaDocument, Observed, TrackerConfig, TrackerLink } from "./lib/types.ts";
import { loadTable } from "./lib/table.ts";
import { parseArgs } from "./lib/args.ts";
import type { ArgSpec, ParsedArgs } from "./lib/args.ts";
import { assertExtension, readJsonWithBytes, stringifyDocument, writeFileAtomic } from "./lib/io.ts";
import { isCalendarDate, nowIso } from "./lib/dates.ts";
import { isEntry, run } from "./lib/cli.ts";
import { reportValidation, validateDocument } from "./lib/validation.ts";
import { actionRefs } from "./lib/tracker/items.ts";
import type { ActionRef } from "./lib/tracker/items.ts";
import { computePlan } from "./lib/tracker/plan.ts";
import type { Plan, PlannedAction } from "./lib/tracker/plan.ts";
import { judge } from "./lib/tracker/observe.ts";
import type { Verdict } from "./lib/tracker/observe.ts";
import { CreatedWithFault, TrackerWait } from "./lib/tracker/provider.ts";
import { githubProvider } from "./lib/tracker/github.ts";
import { jiraProvider } from "./lib/tracker/jira.ts";
import { runProcess } from "./lib/tracker/spawn.ts";
import type { Link, Observation, Provider, Target, Visibility } from "./lib/tracker/provider.ts";

export interface Deps {
  makeProvider: (config: TrackerConfig) => Provider;
  today: () => string;                       // YYYY-MM-DD
  sleep: (ms: number) => Promise<void>;
  write: (text: string) => void;             // stdout
}

type Flags = ParsedArgs["flags"];
type Command = (path: string, flags: Flags, deps: Deps) => Promise<number>;

const COMMANDS: Record<string, { flags: ArgSpec["flags"]; run: Command }> = {
  plan: { flags: { "table-file": "string" }, run: planCommand },
  apply: { flags: { plan: "string", only: "string", "public-ok": "boolean", "table-file": "string" }, run: applyCommand },
  refresh: { flags: { write: "boolean", "table-file": "string" }, run: refreshCommand },
};

/** The longest wait the run honours, once (§6.2). */
const LONGEST_WAIT_S = 120;
const DETAIL_LIMIT = 80;
// The schema's pattern for `actions[].tracker.url`.
const HTTPS_URL = /^https:\/\/\S+$/;

const defaultDeps: Deps = {
  makeProvider: (config) => config.provider === "jira"
    ? jiraProvider(config, (args) => runProcess("acli", args))
    : githubProvider(config, (args, input) => runProcess("gh", args, input)),
  today: () => nowIso().slice(0, 10),
  sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
  write: (text) => { process.stdout.write(text); },
};

/** One command's run: the validated document, its actions, and the provider behind the wait policy.
 *  `bytes` is what the file held when the run last read or wrote it, which the next write compares. */
interface Ctx { path: string; doc: FmeaDocument; bytes: Buffer; refs: ActionRef[]; deps: Deps; provider: Provider; waited: boolean }

interface Done { key: string; pointer: string; outcome: PlannedAction["outcome"]; link: Link }
/** `link` is there only when the item was created and its link could not be recorded. */
interface Failure { key: string; code: Code; message: string; link?: Link }
/** What refresh prints for one linked action; `observed` is absent on a link-mismatch. */
type RefreshItem = { key: string; pointer: string; status: ActionStatus; link: Link; observed?: Observed } & Verdict;
interface ApplyOutcome { done: Done[]; remaining: string[]; failure?: Failure }

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function print(deps: Deps, result: object): void {
  deps.write(JSON.stringify(result, null, 2) + "\n");
}

/** The checks every command makes before the tracker, in order: the extension, the read, the
 *  validation (an invalid document prints what validate.ts prints and gives its status), and
 *  `meta.tracker`. Only then is the provider built. */
function open(path: string, flags: Flags, deps: Deps): Ctx | number {
  assertExtension(path, ".json", "the analysis file");
  const read = readJsonWithBytes(path);
  const raw = read.value;
  const result = validateDocument(raw, loadTable(stringFlag(flags, "table-file")));
  if (!result.ok) return reportValidation(result);
  const doc = raw as FmeaDocument;
  const config = doc.meta.tracker;
  if (config === undefined) throw new ScriptError("TRACKER_CONFIG", "the document has no meta.tracker", "/meta/tracker");
  checkConfig(config);
  return { path, doc, bytes: read.bytes, refs: actionRefs(doc), deps, provider: deps.makeProvider(config), waited: false };
}

/** What the schema cannot say of a flat `meta.tracker`: a jira target needs its host, and the
 *  Jira-only fields are refused on a github target, the first of type, parent and states. */
function checkConfig(config: TrackerConfig): void {
  if (config.provider === "jira") {
    if (config.host === undefined) throw new ScriptError("TRACKER_CONFIG", "a jira target needs host, the site such as example.atlassian.net", "/meta/tracker/host");
    return;
  }
  const field = (["type", "parent", "states"] as const).find((f) => config[f] !== undefined);
  if (field !== undefined) throw new ScriptError("TRACKER_CONFIG", `${field} is for a jira target; a github target cannot take it`, `/meta/tracker/${field}`);
}

/** A provider request under the wait policy of §6.2: one wait in the run, of 120 seconds or less,
 *  is slept and the request repeated; a longer wait, or a second one, stops the run. Any other
 *  failure is never repeated, because the item may exist. */
async function call<T>(ctx: Ctx, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (err) {
    if (!(err instanceof TrackerWait)) throw err;
    if (ctx.waited || err.seconds > LONGEST_WAIT_S) {
      throw new ScriptError("TRACKER_UNAVAILABLE", `the tracker asked to wait ${err.seconds} seconds; a run waits once, for ${LONGEST_WAIT_S} seconds at most`);
    }
    ctx.waited = true;
    await ctx.deps.sleep(err.seconds * 1000);
    return call(ctx, request);
  }
}

/** The target as the commands print it: `type` and `parent` only when the target has them. */
function publicTarget(t: Target): Omit<Target, "write_gap_ms" | "no_create"> {
  const shown: Omit<Target, "write_gap_ms" | "no_create"> = { provider: t.provider, host: t.host, project: t.project, label: t.label, visibility: t.visibility };
  if (t.type !== undefined) shown.type = t.type;
  if (t.parent !== undefined) shown.parent = t.parent;
  return shown;
}

function plainLink(l: Link): Link {
  return { provider: l.provider, id: l.id, key: l.key, url: l.url };
}

/** A link the document can hold: an id, a key and an https URL, or the tracker mangled its answer. */
function checkedLink(link: Link): Link {
  if (link.id === "" || link.key === "" || !HTTPS_URL.test(link.url)) {
    throw new ScriptError("TRACKER_REJECTED", `the tracker returned a link without an id, a key or an https URL: ${JSON.stringify(link.url)}`);
  }
  return plainLink(link);
}

/** The plan as it now stands. A target that cannot take a new item refuses here, before the listing;
 *  `refresh` does not come through here, since reading back needs none of that. */
async function currentPlan(ctx: Ctx): Promise<{ target: Target; plan: Plan }> {
  const target = await call(ctx, () => ctx.provider.describe());
  if (target.no_create !== undefined) throw new ScriptError("TRACKER_REJECTED", target.no_create);
  const marked = await call(ctx, () => ctx.provider.listMarked());
  return { target, plan: computePlan(ctx.doc, target, marked) };
}

async function planCommand(path: string, flags: Flags, deps: Deps): Promise<number> {
  const ctx = open(path, flags, deps);
  if (typeof ctx === "number") return ctx;
  const { target, plan } = await currentPlan(ctx);
  print(deps, { command: "plan", target: publicTarget(target), digest: plan.digest, actions: plan.actions, findings: plan.findings, counts: plan.counts });
  return 0;
}

// apply

/** The keys of `--only`, or undefined when it was not given. */
function onlyKeys(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const keys = value.split(",");
  if (keys.includes("")) throw new ScriptError("USAGE", "--only takes keys separated by commas, with no empty entry");
  if (new Set(keys).size !== keys.length) throw new ScriptError("USAGE", "--only lists a key twice");
  return keys;
}

function checkVisibility(visibility: Visibility, publicOk: boolean): void {
  if (publicOk || (visibility !== "public" && visibility !== "unknown")) return;
  const why = visibility === "public" ? "is public" : "has a visibility that was not established";
  throw new ScriptError("TRACKER_PUBLIC", `the target ${why}, so what apply creates may be read by anyone: creating it needs the person's agreement to publish there, and --public-ok records that agreement`);
}

const isWork = (a: PlannedAction): boolean => a.outcome === "create" || a.outcome === "adopt";

/** The actions the run goes through, in document order: every create and adopt, or the keys of
 *  `--only`, each of which must be an action that is linked, create or adopt. */
function select(actions: PlannedAction[], only: string[] | undefined): PlannedAction[] {
  if (only === undefined) return actions.filter(isWork);
  for (const key of only) {
    const planned = actions.find((a) => a.key === key);
    if (planned === undefined) throw new ScriptError("USAGE", `--only names ${key}, which is no action of this document`);
    if (planned.outcome === "skip" || planned.outcome === "blocked") {
      throw new ScriptError("USAGE", `--only names ${key}, whose outcome is ${planned.outcome}: there is nothing to carry out`);
    }
  }
  return actions.filter((a) => only.includes(a.key));
}

/** Writes the link into its action and the document to disk, before anything else is started. */
function record(ctx: Ctx, key: string, link: Link): void {
  const ref = ctx.refs.find((r) => r.key === key);
  if (ref === undefined) throw new Error(`no action has the key ${key}`);
  ref.action.tracker = { ...plainLink(link), linked: ctx.deps.today() };
  save(ctx);
}

/** Writes the document to disk unless the file no longer holds what this run last read or wrote:
 *  then IO_CHANGED, and the file stays as the other writer saved it. */
function save(ctx: Ctx): void {
  const content = stringifyDocument(ctx.doc);
  writeFileAtomic(ctx.path, content, ctx.bytes);
  ctx.bytes = Buffer.from(content, "utf8");
}

/** An item was created and its link could not be written into the document: the failure names it. */
class LinkNotRecorded extends Error {
  readonly link: Link;

  constructor(link: Link, cause: unknown) {
    const why = cause instanceof Error ? cause.message : String(cause);
    super(`the item ${link.key} was created, at ${link.url}, and its link could not be written to the document: ${why}`, { cause });
    this.name = "LinkNotRecorded";
    this.link = link;
  }
}

/** Records the link of an item just created; a failed write is a LinkNotRecorded that carries it. */
function recordCreated(ctx: Ctx, key: string, link: Link): void {
  try {
    record(ctx, key, link);
  } catch (err) {
    throw new LinkNotRecorded(link, err);
  }
}

/** Creates the item. One that exists with a fault comes back with its link and the fault (§6.4). */
async function createItem(ctx: Ctx, plan: Plan, key: string): Promise<{ link: Link; fault?: string }> {
  const item = plan.items.get(key);
  if (item === undefined) throw new Error(`the plan holds no item for ${key}`);
  try {
    return { link: await call(ctx, () => ctx.provider.create(item)) };
  } catch (err) {
    if (err instanceof CreatedWithFault) return { link: err.link, fault: err.message };
    throw err;
  }
}

/** Carries out one action: a create makes the item, an adopt takes the one found; both are
 *  recorded at once. A linked action is reported as it stands. */
async function settle(ctx: Ctx, plan: Plan, planned: PlannedAction): Promise<{ link: Link; fault?: string }> {
  if (planned.outcome === "create") {
    const created = await createItem(ctx, plan, planned.key);
    recordCreated(ctx, planned.key, checkedLink(created.link));
    return created;
  }
  if (planned.link === undefined) throw new Error(`the ${planned.outcome} action ${planned.key} has no link`);
  if (planned.outcome === "adopt") record(ctx, planned.key, checkedLink(planned.link));
  return { link: planned.link };
}

function failureOf(key: string, err: unknown): Failure {
  if (err instanceof LinkNotRecorded) return { ...failureOf(key, err.cause), message: err.message, link: err.link };
  if (err instanceof ScriptError) return { key, code: err.code, message: err.message };
  return { key, code: "INTERNAL", message: err instanceof Error ? err.message : String(err) };
}

/** Serial, in document order, with the target's gap between creates; the first failure stops it. */
async function carryOut(ctx: Ctx, plan: Plan, selected: PlannedAction[], gapMs: number): Promise<ApplyOutcome> {
  const outcome: ApplyOutcome = { done: [], remaining: selected.filter(isWork).map((a) => a.key) };
  let creates = 0;
  for (const planned of selected) {
    let settled: { link: Link; fault?: string };
    try {
      if (planned.outcome === "create" && creates++ > 0) await ctx.deps.sleep(gapMs);
      settled = await settle(ctx, plan, planned);
    } catch (err) {
      return { ...outcome, failure: failureOf(planned.key, err) };
    }
    outcome.done.push({ key: planned.key, pointer: planned.pointer, outcome: planned.outcome, link: plainLink(settled.link) });
    outcome.remaining = outcome.remaining.filter((k) => k !== planned.key);
    if (settled.fault !== undefined) return { ...outcome, failure: { key: planned.key, code: "TRACKER_REJECTED", message: settled.fault } };
  }
  return outcome;
}

async function applyCommand(path: string, flags: Flags, deps: Deps): Promise<number> {
  const digest = stringFlag(flags, "plan");
  if (digest === undefined) throw new ScriptError("USAGE", "apply needs --plan <digest>, the digest plan printed");
  const only = onlyKeys(stringFlag(flags, "only"));
  const ctx = open(path, flags, deps);
  if (typeof ctx === "number") return ctx;
  const { target, plan } = await currentPlan(ctx);
  if (plan.digest !== digest) {
    throw new ScriptError("TRACKER_PLAN", "the digest is not the digest of the plan as it now stands: the document or the tracker changed; run plan again");
  }
  checkVisibility(target.visibility, flags["public-ok"] === true);
  const outcome = await carryOut(ctx, plan, select(plan.actions, only), target.write_gap_ms);
  print(deps, { command: "apply", target: publicTarget(target), digest, ...outcome });
  if (outcome.failure === undefined) return 0;
  process.stderr.write(formatError(outcome.failure.code, outcome.failure.message) + "\n");
  return 3;
}

// refresh

/** The tracker's words for a state as one line of at most 80 code points: every control character and
 *  bidi control becomes a space, whitespace collapses, and an empty result gives way to the state. */
function cleanDetail(detail: string, fallback: string): string {
  const spaced = Array.from(detail, (ch) => {
    const c = ch.codePointAt(0) ?? 0;
    const bidi = (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);
    return c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 || bidi ? " " : ch;
  }).join("");
  const cut = Array.from(spaced.replace(/\s+/g, " ").trim()).slice(0, DETAIL_LIMIT).join("").trimEnd();
  return cut === "" ? fallback : cut;
}

/** The observation of one link, which the read must return, with a link and a date the document can hold. */
function observationOf(observations: Observation[], key: string, id: string): Observation {
  const found = observations.find((o) => o.link.id === id);
  if (found === undefined) throw new ScriptError("TRACKER_REJECTED", `the tracker returned no state for ${key}`);
  if (found.closed_date !== undefined && !isCalendarDate(found.closed_date)) {
    throw new ScriptError("TRACKER_REJECTED", `the tracker returned a closing date that is not a calendar date for ${key}`);
  }
  return { ...found, link: checkedLink(found.link) };
}

function observedOf(o: Observation, today: string): Observed {
  const observed: Observed = { state: o.state, detail: cleanDetail(o.detail, o.state), date: today };
  return o.closed_date === undefined ? observed : { ...observed, closed_date: o.closed_date };
}

/** The item's marker was read and does not name this action, or it has none (s7). */
function mismatched(now: Observation, key: string): boolean {
  return now.marker !== undefined && now.marker !== key;
}

/** One refresh item: a mismatched link is reported with no observed state and no proposal, since
 *  what was read is not this action's item; every other item carries both as judged. */
function refreshItem(ref: ActionRef, now: Observation, today: string): RefreshItem {
  const item = { key: ref.key, pointer: ref.pointer, status: ref.action.status, link: now.link };
  if (mismatched(now, ref.key)) return { ...item, finding: "link-mismatch" };
  return { ...item, observed: observedOf(now, today), ...judge(ref.action.status, now.state, now.closed_date) };
}

async function refreshCommand(path: string, flags: Flags, deps: Deps): Promise<number> {
  const ctx = open(path, flags, deps);
  if (typeof ctx === "number") return ctx;
  const target = await call(ctx, () => ctx.provider.describe());
  const linked = ctx.refs.flatMap((ref) => (ref.action.tracker ? [{ ref, link: ref.action.tracker }] : []));
  const observations = linked.length === 0 ? [] : await call(ctx, () => ctx.provider.read(linked.map((l) => plainLink(l.link))));
  const today = deps.today();
  const seen = linked.map(({ ref, link }) => ({ ref, link, now: observationOf(observations, ref.key, link.id) }));
  const items = seen.map(({ ref, now }) => refreshItem(ref, now, today));
  // A link-mismatch has no observed, and its action's tracker block stays as it was; the file is
  // written only when at least one item carries an observation to store.
  const written = flags.write === true && items.some((item) => item.observed !== undefined);
  if (written) {
    seen.forEach(({ ref, link, now }, i) => {
      const { observed } = items[i];
      if (observed !== undefined) ref.action.tracker = storedLink(link, now.link, observed);
    });
    save(ctx);
  }
  print(deps, { command: "refresh", target: publicTarget(target), written, items });
  return 0;
}

/** The stored link with the item's current key and URL and what was observed; id and date linked stay. */
function storedLink(stored: TrackerLink, current: Link, observed: Observed): TrackerLink {
  return { provider: stored.provider, id: stored.id, key: current.key, url: current.url, linked: stored.linked, observed };
}

export async function main(argv: string[], deps: Deps = defaultDeps): Promise<number> {
  const [name = "", ...rest] = argv;
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (command === undefined) throw new ScriptError("USAGE", `the first argument must be plan, apply or refresh, got ${JSON.stringify(name)}`);
  const parsed = parseArgs(rest, { positional: 1, flags: command.flags });
  return command.run(parsed.positional[0], parsed.flags, deps);
}

if (isEntry(import.meta)) run(main);
