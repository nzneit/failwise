import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { main } from "./track.ts";
import { validateDocument } from "./lib/validation.ts";
import { loadTable } from "./lib/table.ts";
import { exitStatus } from "./lib/codes.ts";
import { textHash } from "./lib/tracker/items.ts";
import { fakeProvider } from "./tracker-fakes.ts";
import { authStatus, count, created, epic, fakeAcli, HOST, jiraConfig, ok, project, status as jiraStatus, TRACKED, viewed, workItem } from "./tracker-acli.ts";
import { jiraProvider } from "./lib/tracker/jira.ts";
import { renderDescription } from "./lib/tracker/jira-body.ts";
import type { ProcessResult } from "./lib/tracker/spawn.ts";
import type { FakeOptions, FakeProvider } from "./tracker-fakes.ts";
import type { Link, Observation, Provider, RemoteItem } from "./lib/tracker/provider.ts";
import type { Action, ActionStatus, FmeaDocument, ObservedState, TrackerConfig, TrackerLink } from "./lib/types.ts";
import { changedMessage, clone, minimalDoc, runCli } from "./test-helpers.ts";

const TODAY = "2026-10-02";
const key = (n: number): string => `fmea-min/ch-1/act-${n}`;
const fakeUrl = (n: number): string => `https://github.example.com/acme/checkout/issues/${n}`;

function act(n: number, status: ActionStatus = "Open"): Action {
  const action: Action = { id: `act-${n}`, description: `do step ${n}`, owner: "A. Owner", status, target_date: "2026-11-01" };
  return status === "Completed" ? { ...action, completed_date: "2026-09-20" } : action;
}

function linkOf(n: number): Link {
  return { provider: "github", id: `N${n}`, key: `acme/checkout#${n}`, url: fakeUrl(n) };
}

/** The action already linked to item n of the fake tracker. */
function linked(a: Action, n: number): Action {
  const tracker: TrackerLink = { ...linkOf(n), linked: "2026-10-01" };
  return { ...a, tracker };
}

/** Item n as the tracker lists it, marked with the key and text hash of action `of`. */
function remote(n: number, of: Action): RemoteItem {
  return { link: linkOf(n), marker: { key: key(Number(of.id.slice(4))), text: textHash(of.description) } };
}

function observation(n: number, state: ObservedState, detail: string = state, closed_date?: string): Observation {
  return closed_date === undefined ? { link: linkOf(n), state, detail } : { link: linkOf(n), state, detail, closed_date };
}

/** The action linked to the Jira work item `jiraKey`, as apply would have recorded it. */
function jiraLinked(a: Action, jiraKey = "FAILW-5", id = "10015"): Action {
  return { ...a, tracker: { provider: "jira", id, key: jiraKey, url: `https://${HOST}/browse/${jiraKey}`, linked: "2026-10-07" } };
}

/** minimalDoc with this tracker configuration and these actions on its only row. */
function docOn(config: TrackerConfig, ...actions: Action[]): FmeaDocument {
  const doc = minimalDoc();
  doc.meta.tracker = config;
  doc.chains[0].actions = actions;
  return doc;
}

/** docOn with the GitHub configuration most tests use. */
function docWith(...actions: Action[]): FmeaDocument {
  return docOn({ provider: "github", project: "acme/checkout", label: "failwise" }, ...actions);
}

interface Entry { key: string; pointer: string; outcome: string; link?: Link; item?: { title: string } }
interface RefreshItem { key: string; status: string; link: Link; observed: { state: string; detail: string; date: string; closed_date?: string }; proposal?: unknown; finding?: string }
interface Result {
  command: string; target: unknown; digest: string; actions: Entry[]; findings: unknown[]; counts: Record<string, number>;
  done: Entry[]; remaining: string[]; failure?: { key: string; code: string; message: string; link?: Link };
  written: boolean; items: RefreshItem[];
}
interface Run { status: number; result: Result; stderr: string; sleeps: number[] }
interface Session {
  path: string; fake: FakeProvider; built: () => number; text: () => string; doc: () => FmeaDocument;
  run: (argv: string[]) => Promise<Run>; track: (command: string, ...flags: string[]) => Promise<Run>;
}

/** Writes the document to a fresh folder and returns a way to run track.ts on it against the fake,
 *  with a fixed today, a sleep that records and returns at once, and stdout and stderr collected.
 *  `provider`, when given, is what makeProvider builds in place of the fake. */
function session(t: TestContext, doc: FmeaDocument, options: FakeOptions = {}, provider?: Provider): Session {
  const dir = mkdtempSync(join(tmpdir(), "fmea-track-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "a.fmea.json");
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  const fake = fakeProvider(options);
  let built = 0;
  const run = async (argv: string[]): Promise<Run> => {
    let stdout = "";
    const sleeps: number[] = [];
    const stderr = t.mock.method(process.stderr, "write", () => true);
    try {
      const status = await main(argv, {
        makeProvider: () => { built += 1; return provider ?? fake; },
        today: () => TODAY,
        sleep: async (ms) => { sleeps.push(ms); },
        write: (text) => { stdout += text; },
      });
      const written = stderr.mock.calls.map((c) => String(c.arguments[0])).join("");
      return { status, result: (stdout === "" ? {} : JSON.parse(stdout)) as Result, stderr: written, sleeps };
    } finally {
      stderr.mock.restore();
    }
  };
  return {
    path, fake, run,
    built: () => built,
    text: () => readFileSync(path, "utf8"),
    doc: () => JSON.parse(readFileSync(path, "utf8")) as FmeaDocument,
    track: (command, ...flags) => run([command, path, ...flags]),
  };
}

/** The digest `plan` prints now; the fake's call record is cleared after it. */
async function planDigest(s: Session): Promise<string> {
  const { result } = await s.track("plan");
  s.fake.calls.length = 0;
  return result.digest;
}

async function applyPlanned(s: Session, ...flags: string[]): Promise<Run> {
  return s.track("apply", "--plan", await planDigest(s), ...flags);
}

/** A session on `doc` whose provider is the Jira adapter for the document's target, over a fake
 *  acli that answers from `answers` in order. */
function jiraSession(t: TestContext, doc: FmeaDocument, answers: ProcessResult[]): Session {
  const config = doc.meta.tracker;
  if (config === undefined) throw new Error("a Jira session needs a document with meta.tracker");
  return session(t, doc, {}, jiraProvider(config, fakeAcli(answers).acli));
}

/** What describe and listMarked of the Jira adapter ask acli for on an empty project, in order. */
const LISTED_EMPTY: ProcessResult[] = [authStatus(), project(), count(0), ok([])];

/** Runs track.ts as a subprocess with the default provider and a PATH that is an empty folder, so
 *  no run can find gh or acli, whatever the run reaches. Node itself is started by its absolute path. Every
 *  subprocess run of track.ts goes through here. */
function runTrack(t: TestContext, argv: string[]): { status: number; stdout: string; stderr: string } {
  const empty = mkdtempSync(join(tmpdir(), "fmea-no-gh-"));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  return runCli("track.ts", argv, { env: { ...process.env, PATH: empty } });
}

const linksIn = (doc: FmeaDocument): (TrackerLink | undefined)[] => doc.chains[0].actions.map((a) => a.tracker);

/** Saves the file as another writer would in the middle of a run, the document on disk with its
 *  meta.name changed, and returns the text it saved. */
function saveAsAnotherWriter(s: Session): string {
  const other = s.doc();
  other.meta.name = "Saved by another writer";
  const saved = JSON.stringify(other, null, 2) + "\n";
  writeFileSync(s.path, saved);
  return saved;
}
const createdKeys = (s: Session): string[] => s.fake.created.map((i) => i.key);

// the command line

test("a first argument that is not a command is USAGE", async (t) => {
  const s = session(t, docWith(act(1)));
  await assert.rejects(s.run(["publish", s.path]), { code: "USAGE" });
  await assert.rejects(s.run([]), { code: "USAGE" });
  assert.equal(s.built(), 0);
});

test("a flag of another command is USAGE: plan --write, refresh --public-ok", async (t) => {
  const s = session(t, docWith(act(1)));
  await assert.rejects(s.track("plan", "--write"), { code: "USAGE" });
  await assert.rejects(s.track("refresh", "--public-ok"), { code: "USAGE" });
  assert.equal(s.built(), 0);
});

test("--only with an empty entry or a repeated key is USAGE", async (t) => {
  const s = session(t, docWith(act(1), act(2)));
  for (const only of [`${key(1)},,${key(2)}`, "", `${key(1)},${key(1)}`]) {
    await assert.rejects(s.track("apply", "--plan", "0".repeat(64), "--only", only), { code: "USAGE" }, only);
  }
  assert.equal(s.built(), 0);
});

// refusals before the tracker

test("an invalid document prints what validate.ts prints and exits 2, and the provider is never built", (t) => {
  const doc = docWith(act(1));
  doc.chains[0].stale = { flag: true };
  const s = session(t, doc);
  const validate = runCli("validate.ts", [s.path]);
  assert.equal(validate.status, 2);
  // Every command asks the provider to describe the target as soon as it is built, and with gh
  // unfindable that fails TRACKER_UNAVAILABLE, so its absence on stderr shows it was never built.
  for (const argv of [["plan", s.path], ["refresh", s.path], ["apply", s.path, "--plan", "0".repeat(64)]]) {
    const track = runTrack(t, argv);
    assert.equal(track.status, 2);
    assert.equal(track.stdout, validate.stdout);
    assert.equal(track.stderr, validate.stderr);
    assert.ok(!track.stderr.includes("TRACKER_UNAVAILABLE"));
  }
});

test("a document with no meta.tracker is TRACKER_CONFIG at /meta/tracker, exit 2", async (t) => {
  const s = session(t, minimalDoc());
  await assert.rejects(s.track("plan"), { code: "TRACKER_CONFIG", pointer: "/meta/tracker" });
  assert.equal(s.built(), 0);
  const cli = runTrack(t, ["plan", s.path]);
  assert.equal(cli.status, 2);
  assert.equal(cli.stdout, "");
  assert.equal(cli.stderr, "error TRACKER_CONFIG: the document has no meta.tracker at /meta/tracker\n");
});

test("a Jira target without host is TRACKER_CONFIG at /meta/tracker/host, exit 2, and the provider is never built", async (t) => {
  const s = session(t, docOn({ provider: "jira", project: "FAILW", label: "failwise" }, act(1)));
  const before = s.text();
  for (const argv of [["plan", s.path], ["refresh", s.path], ["apply", s.path, "--plan", "0".repeat(64)]]) {
    await assert.rejects(s.run(argv), { code: "TRACKER_CONFIG", pointer: "/meta/tracker/host" });
    const cli = runTrack(t, argv);
    assert.equal(cli.status, 2);
    assert.equal(cli.stdout, "");
    assert.match(cli.stderr, /error TRACKER_CONFIG: .* at \/meta\/tracker\/host/);
  }
  assert.equal(s.built(), 0);
  assert.equal(s.text(), before);
});

test("type, parent and states on a GitHub target are each TRACKER_CONFIG at their pointer", async (t) => {
  const github: TrackerConfig = { provider: "github", project: "acme/checkout", label: "failwise" };
  const cases: [TrackerConfig, string][] = [
    [{ ...github, type: "Task", parent: "FAILW-4", states: { done: ["Closed"] } }, "/meta/tracker/type"],
    [{ ...github, parent: "FAILW-4", states: { done: ["Closed"] } }, "/meta/tracker/parent"],
    [{ ...github, states: { done: ["Closed"] } }, "/meta/tracker/states"],
  ];
  for (const [config, pointer] of cases) {
    const s = session(t, docOn(config, act(1)));
    const before = s.text();
    await assert.rejects(s.track("plan"), { code: "TRACKER_CONFIG", pointer });
    const cli = runTrack(t, ["plan", s.path]);
    assert.equal(cli.status, 2);
    assert.match(cli.stderr, new RegExp(`is for a jira target; a github target cannot take it at ${pointer}\n$`));
    assert.equal(s.built(), 0);
    assert.equal(s.text(), before);
  }
});

test("a Jira target without parent is accepted, and plan prints type and parent only when the target has them", async (t) => {
  const config: TrackerConfig = { provider: "jira", host: "jira.example.com", project: "FAILW", label: "failwise" };
  const target = { provider: "jira", host: "jira.example.com", project: "FAILW", visibility: "unknown", type: "Task", parent: "FAILW-4" } as const;
  const s = session(t, docOn(config, act(1)), { target });
  for (const run of [() => s.track("plan"), () => s.track("refresh"), () => applyPlanned(s, "--public-ok")]) {
    const { status, result, stderr } = await run();
    assert.equal(status, 0, stderr);
    const printed = result.target as Record<string, unknown>;
    assert.equal(printed.type, "Task");
    assert.equal(printed.parent, "FAILW-4");
  }

  const plain = session(t, docWith(act(1)));
  const { result } = await plain.track("plan");
  const printed = result.target as Record<string, unknown>;
  assert.equal("type" in printed, false);
  assert.equal("parent" in printed, false);
});

test("a subprocess run of track.ts cannot find gh: a valid document stops at TRACKER_UNAVAILABLE", (t) => {
  const s = session(t, docWith(act(1)));
  for (const argv of [["plan", s.path], ["refresh", s.path]]) {
    const cli = runTrack(t, argv);
    assert.equal(cli.status, 3);
    assert.equal(cli.stdout, "");
    assert.equal(cli.stderr, "error TRACKER_UNAVAILABLE: gh was not found: install the GitHub CLI and sign in with gh auth login\n");
  }
  assert.equal(s.built(), 0);
});

test("a subprocess run of track.ts on a Jira document cannot find acli: a valid document stops at TRACKER_UNAVAILABLE naming acli", (t) => {
  const s = session(t, docOn(jiraConfig, act(1)));
  for (const argv of [["plan", s.path], ["refresh", s.path]]) {
    const cli = runTrack(t, argv);
    assert.equal(cli.status, 3, cli.stderr);
    assert.equal(cli.stdout, "");
    assert.match(cli.stderr, /^error TRACKER_UNAVAILABLE: acli was not found/);
  }
  assert.equal(s.built(), 0);
});

// plan

test("plan accepts a document whose validated_at is written with a lower-case t and z", async (t) => {
  const doc = docWith(act(1));
  doc.computed = { quality_score: 0, lints: [], validated_at: "2026-10-02t00:00:00z", validator_version: "0.0.1" };
  const s = session(t, doc);
  const { status, stderr } = await s.track("plan");
  assert.equal(status, 0, stderr);
  assert.equal(s.built(), 1);
});

test("plan prints the result of §6.6 and leaves the file byte for byte as it was", async (t) => {
  const a2 = linked(act(2), 2);
  const s = session(t, docWith(act(1), a2, act(3, "Completed")), { marked: [remote(2, a2)] });
  const before = s.text();
  const { status, result } = await s.track("plan");
  assert.equal(status, 0);
  assert.equal(result.command, "plan");
  assert.deepEqual(result.target, { provider: "github", host: "github.com", project: "acme/checkout", label: "failwise", visibility: "private" });
  assert.match(result.digest, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.actions.map((a) => [a.key, a.pointer, a.outcome]), [
    [key(1), "/chains/0/actions/0", "create"], [key(2), "/chains/0/actions/1", "linked"], [key(3), "/chains/0/actions/2", "skip"],
  ]);
  assert.equal(result.actions[0].item?.title, "do step 1");
  assert.deepEqual(result.actions[1].link, linkOf(2));
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.counts, { linked: 1, create: 1, adopt: 0, skip: 1, blocked: 0, other_analyses: 0 });
  assert.deepEqual(s.fake.calls, ["describe", "listMarked"]);
  assert.equal(s.text(), before);
});

const NO_CREATE = ["acme/checkout has issues turned off", "acme/checkout is archived, so nothing can be created in it", "this account cannot push to acme/checkout"];

test("plan and apply on a target that cannot take a new item are TRACKER_REJECTED with its reason, before the listing, and nothing is written", async (t) => {
  for (const reason of NO_CREATE) {
    const s = session(t, docWith(act(1)), { target: { no_create: reason } });
    const before = s.text();
    for (const argv of [["plan"], ["apply", "--plan", "0".repeat(64)]]) {
      s.fake.calls.length = 0;
      await assert.rejects(s.track(argv[0], ...argv.slice(1)), { code: "TRACKER_REJECTED", message: reason }, `${argv[0]}: ${reason}`);
      assert.deepEqual(s.fake.calls, ["describe"]);
    }
    assert.deepEqual(s.fake.created, []);
    assert.equal(s.text(), before);
  }
});

// apply

test("apply without --plan is USAGE", async (t) => {
  const s = session(t, docWith(act(1)));
  await assert.rejects(s.track("apply"), { code: "USAGE" });
  assert.equal(s.built(), 0);
});

test("apply with a digest that is not the plan's is TRACKER_PLAN, exit 1, and nothing is written or created", async (t) => {
  const s = session(t, docWith(act(1)));
  const before = s.text();
  await assert.rejects(s.track("apply", "--plan", "0".repeat(64)), { code: "TRACKER_PLAN" });
  assert.equal(exitStatus("TRACKER_PLAN"), 1);
  assert.deepEqual(s.fake.calls, ["describe", "listMarked"]);
  assert.equal(s.text(), before);
});

const AGREEMENT = "so what apply creates may be read by anyone: creating it needs the person's agreement to publish there, and --public-ok records that agreement";

test("apply on a public target without --public-ok is TRACKER_PUBLIC and its message says public and asks for the person's agreement", async (t) => {
  const s = session(t, docWith(act(1)), { target: { visibility: "public" } });
  await assert.rejects(applyPlanned(s), { code: "TRACKER_PUBLIC", message: `the target is public, ${AGREEMENT}` });
  assert.deepEqual(s.fake.created, []);
  assert.equal((await applyPlanned(s, "--public-ok")).status, 0);
  assert.deepEqual(createdKeys(s), [key(1)]);
});

test("apply on a target of unknown visibility without --public-ok is TRACKER_PUBLIC and its message says not established", async (t) => {
  const s = session(t, docWith(act(1)), { target: { visibility: "unknown" } });
  await assert.rejects(applyPlanned(s), { code: "TRACKER_PUBLIC", message: `the target has a visibility that was not established, ${AGREEMENT}` });
  assert.deepEqual(s.fake.created, []);
});

test("apply creates in document order and the file on disk holds each link before the next create starts", async (t) => {
  const s = session(t, docWith(act(1), act(2), act(3)));
  const seen: number[] = [];
  const create = s.fake.create.bind(s.fake);
  s.fake.create = async (item) => {
    seen.push(linksIn(s.doc()).filter((l) => l !== undefined).length);
    return create(item);
  };
  const { status, result } = await applyPlanned(s);
  assert.equal(status, 0);
  assert.deepEqual(seen, [0, 1, 2]);
  assert.deepEqual(createdKeys(s), [key(1), key(2), key(3)]);
  assert.deepEqual(result.done.map((d) => [d.key, d.outcome, d.link?.id]), [[key(1), "create", "N1"], [key(2), "create", "N2"], [key(3), "create", "N3"]]);
  assert.deepEqual(result.remaining, []);
  assert.equal(result.failure, undefined);
});

test("a link written by apply is {provider, id, key, url, linked: today} and the document still validates", async (t) => {
  const s = session(t, docWith(act(1)));
  const { result } = await applyPlanned(s);
  assert.equal(result.command, "apply");
  assert.deepEqual(result.done[0], { key: key(1), pointer: "/chains/0/actions/0", outcome: "create", link: linkOf(1) });
  assert.deepEqual(s.doc().chains[0].actions[0].tracker, { ...linkOf(1), linked: TODAY });
  assert.equal(validateDocument(s.doc(), loadTable()).ok, true);
});

test("apply sleeps write_gap_ms between creates and not after the last", async (t) => {
  const s = session(t, docWith(act(1), act(2), act(3)), { target: { write_gap_ms: 500 } });
  const { sleeps } = await applyPlanned(s);
  assert.deepEqual(sleeps, [500, 500]);
});

test("an adoption writes the link and calls no create", async (t) => {
  const a1 = act(1);
  const s = session(t, docWith(a1), { marked: [remote(9, a1)] });
  const { status, result } = await applyPlanned(s);
  assert.equal(status, 0);
  assert.deepEqual(s.fake.calls, ["describe", "listMarked"]);
  assert.deepEqual(result.done, [{ key: key(1), pointer: "/chains/0/actions/0", outcome: "adopt", link: linkOf(9) }]);
  assert.deepEqual(linksIn(s.doc()), [{ ...linkOf(9), linked: TODAY }]);
});

test("a failure on the second create exits 3 with the first link kept, done and remaining listed, and failure filled", async (t) => {
  const s = session(t, docWith(act(1), act(2), act(3)), { failCreateAt: 2 });
  const { status, result, stderr } = await applyPlanned(s);
  assert.equal(status, 3);
  assert.deepEqual(linksIn(s.doc()), [{ ...linkOf(1), linked: TODAY }, undefined, undefined]);
  assert.deepEqual(result.done.map((d) => d.key), [key(1)]);
  assert.deepEqual(result.remaining, [key(2), key(3)]);
  assert.deepEqual(result.failure, { key: key(2), code: "TRACKER_REJECTED", message: "create 2 was refused" });
  assert.equal(stderr, "error TRACKER_REJECTED: create 2 was refused\n");
});

test("after that failure, plan gives a new digest and apply with it creates only what remains", async (t) => {
  const s = session(t, docWith(act(1), act(2), act(3)), { failCreateAt: 2 });
  const first = await planDigest(s);
  assert.equal((await s.track("apply", "--plan", first)).status, 3);
  const second = await planDigest(s);
  assert.notEqual(second, first);
  const { status, result } = await s.track("apply", "--plan", second);
  assert.equal(status, 0);
  assert.deepEqual(createdKeys(s), [key(1), key(2), key(3)]);
  assert.deepEqual(result.done.map((d) => d.key), [key(2), key(3)]);
  assert.equal(linksIn(s.doc()).every((l) => l !== undefined), true);
});

test("--only restricts the run; a listed key already linked is reported as linked", async (t) => {
  const s = session(t, docWith(linked(act(1), 1), act(2), act(3)));
  const { status, result } = await applyPlanned(s, "--only", `${key(1)},${key(2)}`);
  assert.equal(status, 0);
  assert.deepEqual(createdKeys(s), [key(2)]);
  assert.deepEqual(result.done.map((d) => [d.key, d.outcome]), [[key(1), "linked"], [key(2), "create"]]);
  assert.deepEqual(result.done[0].link, linkOf(1));
  assert.equal(s.doc().chains[0].actions[2].tracker, undefined);
});

test("--only with a key that matches no action, or that is skip or blocked, is USAGE and nothing is written", async (t) => {
  const a3 = act(3);
  const s = session(t, docWith(act(1), act(2, "Completed"), a3), { marked: [remote(7, a3), remote(8, a3)] });
  const before = s.text();
  for (const only of ["fmea-min/ch-1/act-9", key(2), key(3)]) {
    await assert.rejects(applyPlanned(s, "--only", only), { code: "USAGE" }, only);
  }
  assert.deepEqual(s.fake.created, []);
  assert.equal(s.text(), before);
});

test("one wait of 120 seconds or less is slept and the create repeated once", async (t) => {
  const s = session(t, docWith(act(1)), { waitOnCreate: [120] });
  const { status, sleeps } = await applyPlanned(s);
  assert.equal(status, 0);
  assert.deepEqual(sleeps, [120_000]);
  assert.deepEqual(s.fake.calls, ["describe", "listMarked", "create", "create"]);
  assert.deepEqual(linksIn(s.doc()), [{ ...linkOf(1), linked: TODAY }]);
});

test("a second wait, or one longer than 120 seconds, stops the run with TRACKER_UNAVAILABLE", async (t) => {
  for (const [waits, slept] of [[[30, 30], [30_000]], [[121], []]]) {
    const s = session(t, docWith(act(1), act(2)), { waitOnCreate: waits });
    const before = s.text();
    const { status, result, sleeps } = await applyPlanned(s);
    assert.equal(status, 3);
    assert.equal(result.failure?.code, "TRACKER_UNAVAILABLE");
    assert.equal(result.failure?.key, key(1));
    assert.deepEqual(result.remaining, [key(1), key(2)]);
    assert.deepEqual(sleeps, slept);
    assert.deepEqual(s.fake.created, []);
    assert.equal(s.text(), before);
  }
});

test("CreatedWithFault records the link and then stops with TRACKER_REJECTED", async (t) => {
  const s = session(t, docWith(act(1), act(2)), { createFault: true });
  const { status, result } = await applyPlanned(s);
  assert.equal(status, 3);
  assert.deepEqual(linksIn(s.doc()), [{ ...linkOf(1), linked: TODAY }, undefined]);
  assert.deepEqual(result.done, [{ key: key(1), pointer: "/chains/0/actions/0", outcome: "create", link: linkOf(1) }]);
  assert.deepEqual(result.remaining, [key(2)]);
  assert.deepEqual(result.failure, { key: key(1), code: "TRACKER_REJECTED", message: "the item came back without the label" });
  assert.equal(s.fake.created.length, 1);
});

test("a created item whose link cannot be written is named, with its link, in the failure, and its key stays in remaining", async (t) => {
  const s = session(t, docWith(act(1), act(2)));
  const create = s.fake.create.bind(s.fake);
  s.fake.create = async (item) => {
    const link = await create(item);
    // The document's path becomes a folder, so the write that would record the link fails.
    rmSync(s.path);
    mkdirSync(s.path);
    return link;
  };
  const { status, result, stderr } = await applyPlanned(s);
  assert.equal(status, 3);
  assert.deepEqual(createdKeys(s), [key(1)]);
  assert.deepEqual(result.done, []);
  assert.deepEqual(result.remaining, [key(1), key(2)]);
  assert.equal(result.failure?.key, key(1));
  assert.equal(result.failure?.code, "IO_WRITE");
  assert.deepEqual(result.failure?.link, linkOf(1));
  assert.match(result.failure?.message ?? "", /^the item acme\/checkout#1 was created, at https:\/\/github\.example\.com\/acme\/checkout\/issues\/1, and its link could not be written to the document: cannot write /);
  assert.equal(stderr, `error IO_WRITE: ${result.failure?.message}\n`);
});

test("apply stops with IO_CHANGED when another writer saves the file during the run: the file keeps that save and the first link, and the failure names the item created", async (t) => {
  const s = session(t, docWith(act(1), act(2)));
  let saved = "";
  const create = s.fake.create.bind(s.fake);
  s.fake.create = async (item) => {
    if (s.fake.created.length === 1) saved = saveAsAnotherWriter(s);
    return create(item);
  };
  const { status, result, stderr } = await applyPlanned(s);
  assert.equal(status, 3);
  assert.equal(s.text(), saved);
  assert.deepEqual(linksIn(s.doc()), [{ ...linkOf(1), linked: TODAY }, undefined]);
  assert.deepEqual(createdKeys(s), [key(1), key(2)]);
  assert.deepEqual(result.done.map((d) => d.key), [key(1)]);
  assert.deepEqual(result.remaining, [key(2)]);
  assert.equal(result.failure?.code, "IO_CHANGED");
  assert.deepEqual(result.failure?.link, linkOf(2));
  assert.equal(result.failure?.message, `the item acme/checkout#2 was created, at ${fakeUrl(2)}, and its link could not be written to the document: ${changedMessage(s.path)}`);
  assert.equal(stderr, `error IO_CHANGED: ${result.failure?.message}\n`);
});

test("apply stops with IO_CHANGED when another writer saves the file before an adopt is recorded, and the file keeps that save", async (t) => {
  const a1 = act(1);
  const s = session(t, docWith(a1), { marked: [remote(7, a1)] });
  const digest = await planDigest(s);
  let saved = "";
  const list = s.fake.listMarked.bind(s.fake);
  s.fake.listMarked = async () => {
    saved = saveAsAnotherWriter(s);
    return list();
  };
  const { status, result, stderr } = await s.track("apply", "--plan", digest);
  assert.equal(status, 3);
  assert.equal(s.text(), saved);
  assert.deepEqual(result.done, []);
  assert.equal(result.failure?.code, "IO_CHANGED");
  assert.equal(result.failure?.message, changedMessage(s.path));
  assert.equal(result.failure?.link, undefined);
  assert.equal(stderr, `error IO_CHANGED: ${changedMessage(s.path)}\n`);
});

test("apply on a document with text outside ASCII records every link: each later write compares with the bytes the run wrote", async (t) => {
  const doc = docWith(act(1), act(2));
  doc.meta.name = "Kassendienst – Zahlung über Karte";
  const s = session(t, doc);
  const { status } = await applyPlanned(s);
  assert.equal(status, 0);
  assert.deepEqual(linksIn(s.doc()), [{ ...linkOf(1), linked: TODAY }, { ...linkOf(2), linked: TODAY }]);
});

test("a failure with no item behind it carries no link", async (t) => {
  const s = session(t, docWith(act(1)), { failCreateAt: 1 });
  const { result } = await applyPlanned(s);
  assert.ok(result.failure !== undefined && !("link" in result.failure));
});

test("a link whose url does not begin https:// is TRACKER_REJECTED and the file is unchanged", async (t) => {
  const s = session(t, docWith(act(1)), { linkUrl: (n) => `http://github.example.com/acme/checkout/issues/${n}` });
  const before = s.text();
  const { status, result } = await applyPlanned(s);
  assert.equal(status, 3);
  assert.equal(result.failure?.code, "TRACKER_REJECTED");
  assert.deepEqual(result.done, []);
  assert.equal(s.text(), before);
});

test("apply with every action linked exits 0 and calls describe and listMarked only", async (t) => {
  const s = session(t, docWith(linked(act(1), 1), linked(act(2), 2)));
  const before = s.text();
  const { status, result } = await applyPlanned(s);
  assert.equal(status, 0);
  assert.deepEqual(s.fake.calls, ["describe", "listMarked"]);
  assert.deepEqual(result.done, []);
  assert.deepEqual(result.remaining, []);
  assert.equal(s.text(), before);
});

// refresh

/** One action of each kind of verdict, three linked and one not. */
function refreshSession(t: TestContext): Session {
  const doc = docWith(linked(act(1), 1), linked(act(2, "Completed"), 2), linked(act(3), 3), act(4));
  return session(t, doc, { observations: [observation(1, "done", "completed", "2026-09-30"), observation(2, "open"), observation(3, "unreachable", "not found")] });
}

test("refresh prints an item per linked action with its observed state and its proposal or finding", async (t) => {
  const s = refreshSession(t);
  const { status, result } = await s.track("refresh");
  assert.equal(status, 0);
  assert.equal(result.command, "refresh");
  assert.equal(result.written, false);
  assert.deepEqual(result.target, { provider: "github", host: "github.com", project: "acme/checkout", label: "failwise", visibility: "private" });
  assert.deepEqual(result.items, [
    { key: key(1), pointer: "/chains/0/actions/0", status: "Open", link: linkOf(1), observed: { state: "done", detail: "completed", date: TODAY, closed_date: "2026-09-30" }, proposal: { status: "Completed", completed_date: "2026-09-30" } },
    { key: key(2), pointer: "/chains/0/actions/1", status: "Completed", link: linkOf(2), observed: { state: "open", detail: "open", date: TODAY }, finding: "still-open" },
    { key: key(3), pointer: "/chains/0/actions/2", status: "Open", link: linkOf(3), observed: { state: "unreachable", detail: "not found", date: TODAY }, finding: "unreachable" },
  ]);
  assert.deepEqual(s.fake.calls, ["describe", "read"]);
});

test("refresh reads states back from a target that cannot take a new item, and prints the target without the reason", async (t) => {
  const s = session(t, docWith(linked(act(1), 1)), { target: { no_create: NO_CREATE[1] }, observations: [observation(1, "done", "completed", "2026-09-30")] });
  const { status, result } = await s.track("refresh", "--write");
  assert.equal(status, 0);
  assert.deepEqual(result.target, { provider: "github", host: "github.com", project: "acme/checkout", label: "failwise", visibility: "private" });
  assert.deepEqual(result.items.map((i) => [i.key, i.observed.state, i.proposal]), [[key(1), "done", { status: "Completed", completed_date: "2026-09-30" }]]);
  assert.equal(linksIn(s.doc())[0]?.observed?.state, "done");
  assert.deepEqual(s.fake.calls, ["describe", "read"]);
});

test("refresh without --write leaves the file as it was", async (t) => {
  const s = refreshSession(t);
  const before = s.text();
  assert.equal((await s.track("refresh")).status, 0);
  assert.equal(s.text(), before);
});

test("refresh --write stores observed with today's date and the current key and url, and no status changes", async (t) => {
  const moved: Link = { provider: "github", id: "N1", key: "acme/elsewhere#4", url: "https://github.example.com/acme/elsewhere/issues/4" };
  const s = session(t, docWith(linked(act(1), 1)), { observations: [{ link: moved, state: "done", detail: "completed", closed_date: "2026-09-30" }] });
  const { status, result } = await s.track("refresh", "--write");
  assert.equal(status, 0);
  assert.equal(result.written, true);
  const [action] = s.doc().chains[0].actions;
  assert.equal(action.status, "Open");
  assert.equal(action.completed_date, undefined);
  assert.deepEqual(action.tracker, { ...moved, linked: "2026-10-01", observed: { state: "done", detail: "completed", date: TODAY, closed_date: "2026-09-30" } });
  assert.equal(validateDocument(s.doc(), loadTable()).ok, true);
});

test("a detail longer than 80 code points, or holding a line break or a control character, is cut and cleaned", async (t) => {
  const long = "line one\r\nline two\u0007" + "𝄞".repeat(100);
  const s = session(t, docWith(linked(act(1), 1), linked(act(2), 2)), { observations: [observation(1, "open", long), observation(2, "open", "\u0000\n")] });
  const { result } = await s.track("refresh", "--write");
  const expected = "line one line two " + "𝄞".repeat(62);
  assert.equal(Array.from(expected).length, 80);
  assert.deepEqual(result.items.map((i) => i.observed.detail), [expected, "open"]);
  assert.deepEqual(linksIn(s.doc()).map((l) => l?.observed?.detail), [expected, "open"]);
  assert.equal(validateDocument(s.doc(), loadTable()).ok, true);
});

test("an observation missing for a link fails the run with TRACKER_REJECTED and writes nothing", async (t) => {
  const s = session(t, docWith(linked(act(1), 1), linked(act(2), 2)), { observations: [observation(1, "open")] });
  const before = s.text();
  await assert.rejects(s.track("refresh", "--write"), { code: "TRACKER_REJECTED" });
  assert.equal(s.text(), before);
});

test("refresh --write refuses with IO_CHANGED when another writer saves the file while the tracker is read, and the file keeps that save", async (t) => {
  const s = session(t, docWith(linked(act(1), 1)), { observations: [observation(1, "open")] });
  let saved = "";
  const read = s.fake.read.bind(s.fake);
  s.fake.read = async (links) => {
    saved = saveAsAnotherWriter(s);
    return read(links);
  };
  await assert.rejects(s.track("refresh", "--write"), { code: "IO_CHANGED", message: changedMessage(s.path) });
  assert.equal(s.text(), saved);
});

test("refresh on a document with no link exits 0, prints no items and makes no read", async (t) => {
  const s = session(t, docWith(act(1)));
  const { status, result } = await s.track("refresh", "--write");
  assert.equal(status, 0);
  assert.deepEqual(result.items, []);
  assert.deepEqual(s.fake.calls, ["describe"]);
});

test("refresh gives link-mismatch, no proposal and no observed, for an observation whose marker names another key and for one whose marker is null, and --write leaves those actions as they were", async (t) => {
  const s = session(t, docWith(linked(act(1), 1), linked(act(2), 2), linked(act(3), 3)), {
    observations: [{ ...observation(1, "done"), marker: "fmea-min/ch-1/act-9" }, { ...observation(2, "done"), marker: null }, observation(3, "done")],
  });
  const stored = linksIn(s.doc());
  const { status, result } = await s.track("refresh", "--write");
  assert.equal(status, 0);
  for (const [i, item] of result.items.slice(0, 2).entries()) {
    assert.deepEqual(item, { key: key(i + 1), pointer: `/chains/0/actions/${i}`, status: "Open", link: linkOf(i + 1), finding: "link-mismatch" });
    assert.equal("observed" in item, false);
    assert.equal("proposal" in item, false);
  }
  assert.deepEqual(result.items[2].proposal, { status: "Completed" });
  const after = linksIn(s.doc());
  assert.deepEqual(after.slice(0, 2), stored.slice(0, 2));
  assert.deepEqual(after[2]?.observed, { state: "done", detail: "done", date: TODAY });
});

// the Jira adapter behind track.ts

test("plan on a Jira target whose work type the project does not offer, whose parent sits in another project, or whose parent answers under another key, is TRACKER_REJECTED with the reason, and refresh still reads", async (t) => {
  const elsewhere = ok(workItem("FLSCR-1", "10030", { project: { id: "10002", key: "FLSCR", name: "Scratch" }, issuetype: { id: "10005", name: "Epic", hierarchyLevel: 1, subtask: false } }));
  const cases: [TrackerConfig, ProcessResult[], RegExp][] = [
    [{ ...jiraConfig, type: "Nope" }, [], /it offers: Epic, Subtask, Task, Story$/],
    [{ ...jiraConfig, parent: "FLSCR-1" }, [elsewhere], /^the parent FLSCR-1 sits in the project FLSCR, not FAILW$/],
    [{ ...jiraConfig, parent: "KAN-4" }, [epic("FAILW-4")], /^the parent KAN-4 is now keyed FAILW-4 on jira\.example\.com: set the parent to FAILW-4$/],
  ];
  for (const [config, parent, reason] of cases) {
    const described = [authStatus(), project(), ...parent];
    const s = jiraSession(t, docOn(config, jiraLinked(act(1))), [...described, ...described, viewed()]);
    await assert.rejects(s.track("plan"), { code: "TRACKER_REJECTED", message: reason });
    assert.equal(exitStatus("TRACKER_REJECTED"), 3);
    const { status, result } = await s.track("refresh");
    assert.equal(status, 0);
    assert.equal(result.items.length, 1);
  }
});

test("apply on a Jira target creates through the adapter, records the key and the url built from the host, and stops before the second write when the site changed, with that key in remaining and no link written for it", async (t) => {
  const s = jiraSession(t, docOn(jiraConfig, act(1), act(2)), [...LISTED_EMPTY, ...LISTED_EMPTY, authStatus(), created("FAILW-5", "10015"), authStatus("other.atlassian.net")]);
  const { status, result } = await applyPlanned(s, "--public-ok");
  assert.equal(status, 3);
  assert.deepEqual(result.done.map((d) => [d.key, d.link]), [[key(1), { provider: "jira", id: "10015", key: "FAILW-5", url: "https://jira.example.com/browse/FAILW-5" }]]);
  assert.deepEqual(result.remaining, [key(2)]);
  assert.equal(result.failure?.code, "TRACKER_UNAVAILABLE");
  assert.deepEqual(linksIn(s.doc()), [{ provider: "jira", id: "10015", key: "FAILW-5", url: "https://jira.example.com/browse/FAILW-5", linked: TODAY }, undefined]);
});

test("a created Jira item that comes back without the label records its link, puts its key in done, and stops with TRACKER_REJECTED and no failure.link", async (t) => {
  const s = jiraSession(t, docOn(jiraConfig, act(1)), [...LISTED_EMPTY, ...LISTED_EMPTY, authStatus(), created("FAILW-5", "10015", { labels: [] })]);
  const { status, result } = await applyPlanned(s, "--public-ok");
  assert.equal(status, 3);
  assert.deepEqual(result.done.map((d) => d.key), [key(1)]);
  assert.equal(result.failure?.code, "TRACKER_REJECTED");
  assert.equal(result.failure !== undefined && "link" in result.failure, false);
  assert.equal(linksIn(s.doc())[0]?.key, "FAILW-5");
});

test("refresh on a Jira item closed under names in neither list prints closed-unclear with a detail naming the status and the resolution", async (t) => {
  const closed = viewed("FAILW-5", { status: jiraStatus("Closed", "done"), resolution: { name: "Duplicate" } });
  const s = jiraSession(t, docOn(jiraConfig, jiraLinked(act(1))), [authStatus(), project(), closed]);
  const { status, result } = await s.track("refresh");
  assert.equal(status, 0);
  assert.equal(result.items[0].finding, "closed-unclear");
  assert.equal(result.items[0].observed.detail, "Closed, resolution Duplicate");
});

test("refresh through the Jira adapter gives link-mismatch, with no observed and no proposal, for an item whose marker names another action, and with --write on that item alone prints written false and leaves the file's bytes as they were", async (t) => {
  const other = viewed("FAILW-5", { description: renderDescription({ ...TRACKED, key: "fmea-min/ch-1/act-9" }) });
  for (const flags of [[], ["--write"]]) {
    const s = jiraSession(t, docOn(jiraConfig, jiraLinked(act(1))), [authStatus(), project(), other]);
    const before = readFileSync(s.path);
    const { status, result } = await s.track("refresh", ...flags);
    assert.equal(status, 0);
    assert.equal(result.items[0].finding, "link-mismatch");
    assert.equal("observed" in result.items[0], false);
    assert.equal("proposal" in result.items[0], false);
    assert.equal(result.written, false);
    assert.ok(readFileSync(s.path).equals(before), flags.join(" "));
  }
});

// the authored fields

test("no command changes status, completed_date, meta.updated, meta.version or any history", async (t) => {
  const doc = docWith(act(1), act(2, "Completed"), act(3, "Not Implemented"));
  doc.meta.history = [{ version: 1, date: "2026-09-01", change: "created" }];
  doc.chains[0].history = [{ version: 1, date: "2026-09-01", change: "rated" }];
  const s = session(t, doc, { observations: [observation(1, "done", "completed", "2026-09-30")] });
  assert.equal((await applyPlanned(s)).status, 0);
  assert.equal((await s.track("refresh", "--write")).status, 0);
  const after = s.doc();
  assert.notEqual(after.chains[0].actions[0].tracker?.observed, undefined);
  for (const action of after.chains[0].actions) delete action.tracker;
  assert.deepEqual(after, clone(doc));
});
