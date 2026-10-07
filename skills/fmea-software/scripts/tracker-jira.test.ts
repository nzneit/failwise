import { test } from "node:test";
import assert from "node:assert/strict";
import { ScriptError } from "./lib/codes.ts";
import { jiraProvider } from "./lib/tracker/jira.ts";
import { renderDescription } from "./lib/tracker/jira-body.ts";
import type { Provider } from "./lib/tracker/provider.ts";
import type { ProcessResult } from "./lib/tracker/spawn.ts";
import type { TrackerConfig } from "./lib/types.ts";
import { authStatus, count, EMAIL, epic, FAILW_TYPES, failed, fakeAcli, HOST, jiraConfig, MISSING, NOT_FOUND, ok, project, workItem } from "./tracker-acli.ts";

// No test starts acli: every answer comes from a queue, in the forms acli 1.3.39-stable printed
// when it was recorded, with the reserved site and email in place of the real ones.

interface Setup { provider: Provider; calls: string[][]; files: string[] }

/** A provider over a fake acli that answers from the queue, in order. */
function setup(answers: ProcessResult[], cfg: TrackerConfig = jiraConfig): Setup {
  const { acli, calls, files } = fakeAcli(answers);
  return { provider: jiraProvider(cfg, acli), calls, files };
}

/** Rejects with a ScriptError of `code`, at `pointer` when one is given, and gives its message. */
async function rejectsWith(promise: Promise<unknown>, code: string, pointer?: string): Promise<string> {
  let message = "";
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof ScriptError, String(err));
    assert.equal(err.code, code, err.message);
    if (pointer !== undefined) assert.equal(err.pointer, pointer, err.message);
    message = err.message;
    return true;
  });
  return message;
}

/** The message holds `text`. */
function holds(message: string, text: string): void {
  assert.ok(message.includes(text), `${JSON.stringify(message)} lacks ${JSON.stringify(text)}`);
}

const crlf = (r: ProcessResult): ProcessResult => ({ ...r, stdout: r.stdout.replaceAll("\n", "\r\n"), stderr: r.stderr.replaceAll("\n", "\r\n") });
const JQL = 'project = "FAILW" AND labels = "failwise"';
const SIGN_IN = "acli jira auth login --site jira.example.com --email <email> --token < token.txt";
const SWITCH = "acli jira auth switch --site jira.example.com --email <email>";
const typesWith = (...extra: object[]): object[] => [...FAILW_TYPES, ...extra];
const parentView = (fields: object): ProcessResult => ok(workItem("FAILW-4", "10004", fields));
const DESCRIBED = [authStatus(), project()];

/** The §9 description of the action fmea-min/ch-1/act-1. */
const body = renderDescription({
  key: "fmea-min/ch-1/act-1", text: "0123456789ab", label: "failwise", due: "2026-11-01",
  content: { title: "Bound the retries", action: "Bound the retries of the capture call", facts: [{ label: "Owner", value: "Payments" }], origin: { analysis: "Checkout", chain: "ch-1", action: "act-1" } },
});
const entry = (id: string, key: string, description: unknown = null): object => workItem(key, id, { description, labels: ["failwise"] });

// the shared JSON readers (s1)

test("json.ts holds the three readers s1 moves out of github.ts and nothing else, and recordOf refuses what is not an object", async () => {
  const json = await import("./lib/tracker/json.ts");
  assert.deepEqual(Object.keys(json).sort(), ["isRecord", "recordOf"]);
  holds(await rejectsWith(Promise.resolve().then(() => json.recordOf([], "the answer")), "TRACKER_REJECTED"), "the answer is not the JSON object expected");
  assert.deepEqual(json.recordOf({ a: 1 }, "the answer"), { a: 1 });
});

// construction

test("a project outside the project-key grammar, a label outside the plain-id grammar, and a missing host are TRACKER_CONFIG at their pointer", async () => {
  const built = (cfg: TrackerConfig): Promise<Setup> => Promise.resolve().then(() => setup([], cfg));
  for (const key of ["failw", "FAILW-1", "acme/checkout", "F AILW", ""]) {
    holds(await rejectsWith(built({ ...jiraConfig, project: key }), "TRACKER_CONFIG", "/meta/tracker/project"), JSON.stringify(key));
  }
  for (const label of ["fail wise", ""]) {
    holds(await rejectsWith(built({ ...jiraConfig, label }), "TRACKER_CONFIG", "/meta/tracker/label"), JSON.stringify(label));
  }
  const { host: _host, ...hostless } = jiraConfig;
  await rejectsWith(built(hostless), "TRACKER_CONFIG", "/meta/tracker/host");
  assert.doesNotThrow(() => setup([], { ...jiraConfig, project: "FAIL_W2", label: "fail-wise:v1.0" }));
});

// how acli is called

test("every argument array begins jira, --json is on every JSON call and absent from auth status and the count, every value flag is one --flag=value argument, and no call carries --yes or a due date", async () => {
  const { provider, calls } = setup([...DESCRIBED, epic(), count(0), ok("[]")], { ...jiraConfig, parent: "FAILW-4" });
  await provider.describe();
  await provider.listMarked();
  assert.deepEqual(calls, [
    ["jira", "auth", "status"],
    ["jira", "project", "view", "--key=FAILW", "--json"],
    ["jira", "workitem", "view", "FAILW-4", "--fields=project,issuetype", "--json"],
    ["jira", "workitem", "search", `--jql=${JQL}`, "--count"],
    ["jira", "workitem", "search", `--jql=${JQL}`, "--fields=description,labels", "--paginate", "--json"],
  ]);
  for (const arg of calls.flat()) {
    assert.notEqual(arg, "--yes");
    assert.ok(!arg.includes("duedate"), arg);
  }
});

test("the JQL is one argument with both values quoted", async () => {
  const { provider, calls } = setup([...DESCRIBED, epic(), count(0), ok("[]")], { ...jiraConfig, parent: "FAILW-4" });
  await provider.describe();
  await provider.listMarked();
  assert.equal(calls[3][3], `--jql=${JQL}`);
  assert.equal(calls[4][3], `--jql=${JQL}`);
});

// describe

test("describe runs auth status first, before any other request", async () => {
  const { provider, calls } = setup(DESCRIBED);
  await provider.describe();
  assert.deepEqual(calls[0], ["jira", "auth", "status"]);
  assert.equal(calls.length, 2);
});

test("describe parses the recorded auth status form, with LF and with CRLF, and accepts the host in another case", async () => {
  for (const auth of [authStatus(), crlf(authStatus()), ok(authStatus().stdout.trimEnd()), authStatus(HOST, "oauth_global")]) {
    assert.equal((await setup([auth, project()]).provider.describe()).host, HOST);
  }
  const target = await setup([authStatus(), project()], { ...jiraConfig, host: "JIRA.Example.com" }).provider.describe();
  assert.equal(target.host, "JIRA.Example.com");
});

test("an auth status with an extra line, with no Site line, or with a non-zero exit is TRACKER_UNAVAILABLE naming the sign-in command", async () => {
  const recorded = authStatus().stdout;
  const answers = [
    ok(`${recorded}  Extra: line\n`),
    ok(recorded.replace(`  Site: ${HOST}\n`, "")),
    { ...authStatus(), status: 1 },
    failed("✗ Error: not logged in"),
    ok(""),
  ];
  for (const answer of answers) {
    const { provider, calls } = setup([answer]);
    holds(await rejectsWith(provider.describe(), "TRACKER_UNAVAILABLE"), SIGN_IN);
    assert.equal(calls.length, 1);
  }
  holds(await rejectsWith(setup([ok(`${recorded}x`)]).provider.describe(), "TRACKER_UNAVAILABLE"), "in a form the script cannot read");
});

test("another site is refused before any other request, in the recorded case and in another, with the switch command", async () => {
  for (const site of ["other.atlassian.net", "failwise.example.net"]) {
    const { provider, calls } = setup([authStatus(site), project()]);
    holds(await rejectsWith(provider.describe(), "TRACKER_UNAVAILABLE"), SWITCH);
    holds(await rejectsWith(setup([authStatus(site)]).provider.describe(), "TRACKER_UNAVAILABLE"), `signed in to ${site}, not ${HOST}`);
    assert.equal(calls.length, 1);
  }
});

test("acli absent is TRACKER_UNAVAILABLE naming the install and the sign-in", async () => {
  holds(await rejectsWith(setup([MISSING]).provider.describe(), "TRACKER_UNAVAILABLE"), `acli was not found: install the Atlassian CLI and sign in with ${SIGN_IN}`);
  holds(await rejectsWith(setup([count(0), MISSING]).provider.listMarked(), "TRACKER_UNAVAILABLE"), "acli was not found");
});

test("a project that is not found is TRACKER_UNAVAILABLE naming the project and the host", async () => {
  for (const answer of [failed("✗ Error: No project could be found with key 'FAILW'."), crlf(failed("✗ Error: No project could be found with key 'FAILW'."))]) {
    holds(await rejectsWith(setup([authStatus(), answer]).provider.describe(), "TRACKER_UNAVAILABLE"), `the project FAILW was not found on ${HOST}, or the signed-in account cannot see it there`);
  }
  for (const key of ["FLSCR", "failw", ""]) {
    const line = `✗ Error: No project could be found with key '${key}'.`;
    holds(await rejectsWith(setup([authStatus(), failed(line)]).provider.describe(), "TRACKER_REJECTED"), `acli failed: ${line}`);
  }
  holds(await rejectsWith(setup([authStatus(), failed("✗ Error: No project could be found with key 'FAILW'")]).provider.describe(), "TRACKER_REJECTED"), "acli failed");
  holds(await rejectsWith(setup([authStatus(), failed("✗ Error: something else went wrong")]).provider.describe(), "TRACKER_REJECTED"), "acli failed: ✗ Error: something else went wrong");
  holds(await rejectsWith(setup([authStatus(), { ...failed(""), stderr: "" }]).provider.describe(), "TRACKER_REJECTED"), "acli failed: it said nothing");
});

test("a failure's message carries the first line of stderr cut at 200 code points", async () => {
  const long = `✗ Error: ${"é".repeat(300)}`;
  const message = await rejectsWith(setup([authStatus(), failed(`${long}\nsecond line`)]).provider.describe(), "TRACKER_REJECTED");
  assert.equal(message, `acli failed: ${Array.from(long).slice(0, 200).join("")}`);
});

test("a project answer that is not JSON, or whose work types are not of the shape read, is TRACKER_REJECTED saying the form cannot be read", async () => {
  const answers = [
    ok("not json"),
    ok([]),
    ok({ key: "FAILW" }),
    project("FAILW", [{ name: "Task", hierarchyLevel: "0", subtask: false }]),
    project("FAILW", [{ name: "Task", hierarchyLevel: 0 }]),
    project("FAILW", [{ hierarchyLevel: 0, subtask: false }]),
    project("FAILW", ["Task"] as unknown as object[]),
  ];
  for (const answer of answers) {
    holds(await rejectsWith(setup([authStatus(), answer]).provider.describe(), "TRACKER_REJECTED"), "in a form the script cannot read");
  }
});

test("describe gives the target of §7: visibility unknown, write_gap_ms 0, type Task by default or as configured, and the parent's key as view answered it", async () => {
  assert.deepEqual(await setup(DESCRIBED).provider.describe(), {
    provider: "jira", host: HOST, project: "FAILW", label: "failwise", visibility: "unknown", write_gap_ms: 0, type: "Task",
  });
  assert.equal((await setup(DESCRIBED, { ...jiraConfig, type: "Story" }).provider.describe()).type, "Story");
  const parented = await setup([...DESCRIBED, epic("FAILW-44")], { ...jiraConfig, parent: "failw-44" }).provider.describe();
  assert.equal(parented.parent, "FAILW-44");
  assert.equal(parented.no_create, undefined);
  const target = await setup(DESCRIBED).provider.describe();
  assert.ok(!JSON.stringify(target).includes(EMAIL));
});

test("a work type the project does not offer, one it offers twice, and a sub-task each set no_create with the offered names, without throwing", async () => {
  const nope = await setup(DESCRIBED, { ...jiraConfig, type: "Nope" }).provider.describe();
  assert.ok(nope.no_create?.includes("Epic, Subtask, Task, Story"), nope.no_create);
  assert.ok(nope.no_create?.includes("Nope"), nope.no_create);
  assert.equal(nope.type, "Nope");
  const cased = await setup(DESCRIBED, { ...jiraConfig, type: "task" }).provider.describe();
  assert.ok(cased.no_create?.includes("Epic, Subtask, Task, Story"), cased.no_create);
  const sub = await setup(DESCRIBED, { ...jiraConfig, type: "Subtask" }).provider.describe();
  assert.ok(sub.no_create?.includes("Epic, Subtask, Task, Story"), sub.no_create);
  const twice = await setup([authStatus(), project("FAILW", typesWith({ id: "10099", name: "Task", hierarchyLevel: 0, subtask: false }))]).provider.describe();
  assert.ok(twice.no_create?.includes("Epic, Subtask, Task, Story, Task"), twice.no_create);
});

test("a parent that is not found, that sits in another project, or that is not above the type's level sets no_create without throwing; another failure of its view throws", async () => {
  const withParent = { ...jiraConfig, parent: "FAILW-4" };
  const describeWith = (answer: ProcessResult): Promise<unknown> => setup([...DESCRIBED, answer], withParent).provider.describe();
  const reasonOf = async (answer: ProcessResult): Promise<string | undefined> => ((await describeWith(answer)) as { no_create?: string }).no_create;
  const issuetype = { name: "Epic", hierarchyLevel: 1, subtask: false };
  assert.ok((await reasonOf(failed(NOT_FOUND)))?.includes("the parent FAILW-4 was not found"));
  assert.ok((await reasonOf(crlf(failed(NOT_FOUND))))?.includes("the parent FAILW-4 was not found"));
  assert.ok((await reasonOf(parentView({ project: { key: "FLSCR" }, issuetype })))?.includes("FLSCR"));
  assert.ok((await reasonOf(parentView({ project: { key: "FAILW" }, issuetype: { name: "Story", hierarchyLevel: 0, subtask: false } })))?.includes("FAILW-4"));
  holds(await rejectsWith(describeWith(failed("✗ Error: something else")), "TRACKER_REJECTED"), "acli failed: ✗ Error: something else");
  for (const shape of [ok("<html>"), parentView({ project: { key: "FAILW" } }), ok({ id: "10004", fields: { project: { key: "FAILW" }, issuetype } })]) {
    holds(await rejectsWith(describeWith(shape), "TRACKER_REJECTED"), "in a form the script cannot read");
  }
});

// listMarked

test("listMarked runs the count, then the search with --fields=description,labels --paginate --json, and gives each entry its link and marker", async () => {
  const { provider, calls } = setup([count(2), ok([entry("10019", "FAILW-5", body), entry("10020", "FAILW-6")])]);
  assert.deepEqual(await provider.listMarked(), [
    { link: { provider: "jira", id: "10019", key: "FAILW-5", url: "https://jira.example.com/browse/FAILW-5" }, marker: { key: "fmea-min/ch-1/act-1", text: "0123456789ab" } },
    { link: { provider: "jira", id: "10020", key: "FAILW-6", url: "https://jira.example.com/browse/FAILW-6" }, marker: null },
  ]);
  assert.deepEqual(calls.map((c) => c.slice(0, 3)), [["jira", "workitem", "search"], ["jira", "workitem", "search"]]);
  assert.deepEqual(calls[1].slice(4), ["--fields=description,labels", "--paginate", "--json"]);
});

test("a count of 0 with [] , with null, or with an empty stdout is the empty listing", async () => {
  for (const stdout of ["[]", "[]\n", "null", "", "\n", "[]\r\n"]) {
    assert.deepEqual(await setup([crlf(count(0)), ok(stdout)]).provider.listMarked(), [], JSON.stringify(stdout));
  }
  for (const stdout of ["[]", "null", ""]) {
    holds(await rejectsWith(setup([count(1), ok(stdout)]).provider.listMarked(), "TRACKER_UNAVAILABLE"), "the listing is not complete: run the command again");
  }
});

test("a count in another form, and a search answer that is not one JSON array, are TRACKER_REJECTED saying the form cannot be read", async () => {
  for (const answer of [ok("Number of work items: 3\n"), ok("✓ Number of work items in the search: 3\nmore\n"), ok("✓ Number of work items in the search: -1\n")]) {
    const { provider, calls } = setup([answer]);
    holds(await rejectsWith(provider.listMarked(), "TRACKER_REJECTED"), "in a form the script cannot read");
    assert.equal(calls.length, 1);
  }
  for (const stdout of ["[]\n[]", "{}", "[1] [2]", "\"x\""]) {
    holds(await rejectsWith(setup([count(0), ok(stdout)]).provider.listMarked(), "TRACKER_REJECTED"), "in a form the script cannot read");
  }
  holds(await rejectsWith(setup([failed("✗ Error: the query is wrong")]).provider.listMarked(), "TRACKER_REJECTED"), "acli failed: ✗ Error: the query is wrong");
});

test("an id that appears twice, and a listing shorter than the count, are TRACKER_UNAVAILABLE", async () => {
  const twice = setup([count(2), ok([entry("10019", "FAILW-5"), entry("10019", "FAILW-5")])]);
  holds(await rejectsWith(twice.provider.listMarked(), "TRACKER_UNAVAILABLE"), "10019");
  const short = setup([count(3), ok([entry("10019", "FAILW-5"), entry("10020", "FAILW-6")])]);
  holds(await rejectsWith(short.provider.listMarked(), "TRACKER_UNAVAILABLE"), "the listing is not complete: run the command again");
});

test("an entry without the id, the key or the description key, or whose description is neither null nor an ADF document, is TRACKER_REJECTED", async () => {
  const entries: unknown[] = [
    { key: "FAILW-5", fields: { description: null } },
    { id: "10019", fields: { description: null } },
    { id: 10019, key: "FAILW-5", fields: { description: null } },
    { id: "10019", key: "FAILW-5", fields: { labels: ["failwise"] } },
    { id: "10019", key: "FAILW-5" },
    entry("10019", "FAILW-5", "plain text"),
    entry("10019", "FAILW-5", { type: "doc", content: "x" }),
    entry("10019", "FAILW-5", { type: "paragraph", content: [] }),
    "FAILW-5",
  ];
  for (const one of entries) {
    holds(await rejectsWith(setup([count(1), ok([one])]).provider.listMarked(), "TRACKER_REJECTED"), "in a form the script cannot read");
  }
});
