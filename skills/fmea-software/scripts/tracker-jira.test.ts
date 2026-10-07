import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { ScriptError } from "./lib/codes.ts";
import { jiraProvider } from "./lib/tracker/jira.ts";
import { renderDescription } from "./lib/tracker/jira-body.ts";
import { CreatedWithFault } from "./lib/tracker/provider.ts";
import type { Link, Observation, Provider, TrackedItem } from "./lib/tracker/provider.ts";
import type { ProcessResult } from "./lib/tracker/spawn.ts";
import type { TrackerConfig } from "./lib/types.ts";
import {
  authStatus, body, count, created, EMAIL, epic, FAILW_TYPES, failed, fakeAcli, FLSCR3, HOST, jiraConfig, MISSING, NOT_FOUND, ok, project, status, TRACKED, viewed, workItem,
} from "./tracker-acli.ts";

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

test("a project key that resolves to a project under another key, as an old key does after a re-key, is TRACKER_CONFIG naming the current key", async () => {
  const { provider, calls } = setup([authStatus(), project("FAILW")], { ...jiraConfig, project: "KAN" });
  holds(await rejectsWith(provider.describe(), "TRACKER_CONFIG", "/meta/tracker/project"), "FAILW");
  assert.equal(calls.length, 2);
  holds(await rejectsWith(setup([authStatus(), ok({ issueTypes: FAILW_TYPES })]).provider.describe(), "TRACKER_REJECTED"), "in a form the script cannot read");
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

test("an entry whose id is not a number or whose key is outside the key grammar fails the listing with TRACKER_REJECTED", async () => {
  for (const [id, key] of [["I_1", "FAILW-5"], ["-10019", "FAILW-5"], ["10019 OR 1=1", "FAILW-5"], ["", "FAILW-5"], ["10019", "failw-5"], ["10019", "FAILW-0"], ["10019", "FAILW"], ["10019", "FAILW-5 "]]) {
    holds(await rejectsWith(setup([count(1), ok([entry(id, key)])]).provider.listMarked(), "TRACKER_REJECTED"), "in a form the script cannot read");
  }
});

// create

const DESCRIPTION_FLAG = "--description-file=";
/** The path of the description file a call named, or the empty string. */
const descriptionPath = (call: string[]): string => call.find((a) => a.startsWith(DESCRIPTION_FLAG))?.slice(DESCRIPTION_FLAG.length) ?? "";
const titled = (title: string): TrackedItem => ({ ...TRACKED, content: { ...TRACKED.content, title } });
const createArgs = (...parent: string[]): string[] => [
  "jira", "workitem", "create", "--project=FAILW", "--type=Task", "--summary=Bound the retries", "--label=failwise", ...parent, DESCRIPTION_FLAG, "--json",
];
const MAY_EXIST = "the item may exist: run plan, which adopts it once the listing shows it";

test("create runs auth status before every write, then one create with the flags of §7, the summary and the label, --parent only when configured, and no due date", async () => {
  const parented = setup([authStatus(), created("FAILW-5", "10015", { parent: "FAILW-4" }), authStatus(), created("FAILW-6", "10017", { parent: "FAILW-4" })], { ...jiraConfig, parent: "FAILW-4" });
  await parented.provider.create(TRACKED);
  await parented.provider.create(TRACKED);
  const blank = (call: string[]): string[] => call.map((a) => (a.startsWith(DESCRIPTION_FLAG) ? DESCRIPTION_FLAG : a));
  assert.deepEqual(parented.calls[0], ["jira", "auth", "status"]);
  assert.deepEqual(parented.calls[2], ["jira", "auth", "status"]);
  assert.deepEqual(blank(parented.calls[1]), createArgs("--parent=FAILW-4"));
  assert.deepEqual(blank(parented.calls[3]), createArgs("--parent=FAILW-4"));
  const plain = setup([authStatus(), created()]);
  await plain.provider.create(TRACKED);
  assert.deepEqual(blank(plain.calls[1]), createArgs());
  for (const arg of [...parented.calls, ...plain.calls].flat()) {
    assert.ok(!arg.startsWith("--due"), arg);
    assert.notEqual(arg, "--yes");
  }
  assert.ok(!plain.calls[1].some((a) => a.startsWith("--parent=")));
});

test("the description file acli would read holds the ADF of jira-body, and is gone after a successful and after a failed create", async () => {
  const { provider, calls, files } = setup([authStatus(), created(), authStatus(), failed("✗ Error: Please select valid parent issue., Please select valid parent issue.")]);
  await provider.create(TRACKED);
  await rejectsWith(provider.create(TRACKED), "TRACKER_REJECTED");
  for (const content of files) assert.deepEqual(JSON.parse(content), renderDescription(TRACKED));
  assert.equal(files.length, 2);
  for (const call of [calls[1], calls[3]]) {
    const path = descriptionPath(call);
    assert.equal(basename(path), "description.json");
    assert.ok(basename(dirname(path)).startsWith("failwise-jira-"), path);
    assert.equal(dirname(dirname(path)), tmpdir());
    assert.ok(!existsSync(dirname(path)), path);
  }
});

test("a tempRoot that is not a directory is IO_WRITE with no acli call", async () => {
  const { acli, calls } = fakeAcli([authStatus(), created()]);
  const provider = jiraProvider(jiraConfig, acli, join(tmpdir(), `no-such-dir-${Date.now()}`));
  holds(await rejectsWith(provider.create(TRACKED), "IO_WRITE"), "cannot write the description file: ");
  assert.equal(calls.length, 1);
});

test("create returns the numeric id, the key and a url built from the host, never from self", async () => {
  assert.deepEqual(await setup([authStatus(), created()]).provider.create(TRACKED), { provider: "jira", id: "10015", key: "FAILW-5", url: "https://jira.example.com/browse/FAILW-5" });
  const cased = await setup([authStatus(), created()], { ...jiraConfig, host: "JIRA.Example.com" }).provider.create(TRACKED);
  assert.equal(cased.url, "https://JIRA.Example.com/browse/FAILW-5");
});

test("summaries beginning with -, -- and @ travel as one --summary= argument", async () => {
  for (const title of ["-starts with a dash", "--starts with two dashes", "@starts with an at sign"]) {
    const { provider, calls } = setup([authStatus(), created()]);
    await provider.create(titled(title));
    assert.equal(calls[1].length, createArgs().length);
    assert.equal(calls[1][5], `--summary=${title}`);
  }
});

test("a summary is cut at 255 code points", async () => {
  const { provider, calls } = setup([authStatus(), created()]);
  await provider.create(titled("é".repeat(300)));
  assert.equal(calls[1][5], `--summary=${"é".repeat(255)}`);
});

test("an answer with no id, no key, or a key of another project is TRACKER_REJECTED with an excerpt and the note that the item may exist, and not CreatedWithFault", async () => {
  const answers = [
    ok({ key: "FAILW-5", fields: { labels: ["failwise"] } }),
    ok({ id: "10015", fields: { labels: ["failwise"] } }),
    ok({ id: 10015, key: "FAILW-5" }),
    ok({ id: "I_1", key: "FAILW-5" }),
    created("FLSCR-5", "10019"),
    created("FAILW-0", "10015"),
    created("FAILW-5x", "10015"),
    ok("✓ Work item FAILW-5 created"),
    ok(""),
  ];
  for (const answer of answers) {
    const message = await rejectsWith(setup([authStatus(), answer]).provider.create(TRACKED), "TRACKER_REJECTED");
    holds(message, "acli answered the create in a form the script cannot read: ");
    holds(message, MAY_EXIST);
  }
  holds(await rejectsWith(setup([authStatus(), created("FLSCR-5", "10019")]).provider.create(TRACKED), "TRACKER_REJECTED"), "FLSCR-5");
});

test("an answer without the label, and one without the configured parent, are CreatedWithFault carrying the link; a label in another case is not a fault", async () => {
  const link: Link = { provider: "jira", id: "10015", key: "FAILW-5", url: "https://jira.example.com/browse/FAILW-5" };
  const faultOf = async (answer: ProcessResult, cfg: TrackerConfig, words: string[]): Promise<void> => {
    await assert.rejects(setup([authStatus(), answer], cfg).provider.create(TRACKED), (err: unknown) => {
      assert.ok(err instanceof CreatedWithFault, String(err));
      assert.deepEqual(err.link, link);
      for (const word of ["FAILW-5", "by hand", ...words]) holds(err.message, word);
      return true;
    });
  };
  await faultOf(created("FAILW-5", "10015", { labels: [] }), jiraConfig, ["the label failwise"]);
  await faultOf(created("FAILW-5", "10015", { labels: "failwise" }), jiraConfig, ["the label failwise"]);
  await faultOf(created(), { ...jiraConfig, parent: "FAILW-4" }, ["the parent FAILW-4"]);
  await faultOf(created("FAILW-5", "10015", { parent: "FAILW-3" }), { ...jiraConfig, parent: "FAILW-4" }, ["the parent FAILW-4"]);
  assert.deepEqual(await setup([authStatus(), created("FAILW-5", "10015", { labels: ["FailWise"] })]).provider.create(TRACKED), link);
  assert.deepEqual(await setup([authStatus(), created("FAILW-5", "10015", { parent: "FAILW-4" })], { ...jiraConfig, parent: "failw-4" }).provider.create(TRACKED), link);
});

test("a non-zero exit of create is TRACKER_REJECTED with acli's line, and no file remains", async () => {
  const { provider, calls } = setup([authStatus(), failed("✗ Error: Summary can't exceed 255 characters.")]);
  holds(await rejectsWith(provider.create(TRACKED), "TRACKER_REJECTED"), "acli failed: ✗ Error: Summary can't exceed 255 characters.");
  assert.ok(!existsSync(dirname(descriptionPath(calls[1]))));
});

test("a site mismatch or an unreadable auth status before the second write is TRACKER_UNAVAILABLE and no create is sent for it", async () => {
  for (const auth of [authStatus("other.atlassian.net"), ok(""), MISSING]) {
    const { provider, calls } = setup([authStatus(), created(), auth]);
    await provider.create(TRACKED);
    await rejectsWith(provider.create(TRACKED), "TRACKER_UNAVAILABLE");
    assert.equal(calls.length, 3);
  }
});

// read

const linkTo = (key = "FAILW-5", id = "10015"): Link => ({ provider: "jira", id, key, url: `https://${HOST}/browse/${key}` });
const VIEW_FLAGS = ["--fields=status,resolution,resolutiondate,description", "--json"];

/** The one observation of FAILW-5 read from `answer`. */
async function readOne(answer: ProcessResult, cfg: TrackerConfig = jiraConfig): Promise<Observation> {
  const [observation] = await setup([answer], cfg).provider.read([linkTo()]);
  return observation;
}

/** The state an answer of `fields` over the recorded FAILW-5 view maps to. */
async function stateOf(fields: object, cfg: TrackerConfig = jiraConfig): Promise<string> {
  return (await readOne(viewed("FAILW-5", fields), cfg)).state;
}

test("read sends one view per link by numeric id with --fields=status,resolution,resolutiondate,description --json", async () => {
  const { provider, calls } = setup([viewed(), FLSCR3]);
  await provider.read([linkTo(), linkTo("FLSCR-3", "10022")]);
  assert.deepEqual(calls, [["jira", "workitem", "view", "10015", ...VIEW_FLAGS], ["jira", "workitem", "view", "10022", ...VIEW_FLAGS]]);
});

test("a link of another provider, an id that is not a number, an id that holds JQL, an id beginning with -, a key outside its grammar, or a url on another host is TRACKER_REJECTED naming the key and the url, before any request", async () => {
  const bad: Link[] = [
    { ...linkTo(), provider: "github" },
    { ...linkTo(), id: "I_1" },
    { ...linkTo(), id: "10015 OR 1=1" },
    { ...linkTo(), id: "-10015" },
    { ...linkTo(), key: "failw-5" },
    { ...linkTo(), url: "https://other.example.com/browse/FAILW-5" },
    { ...linkTo(), url: "not a url" },
  ];
  for (const link of bad) {
    const { provider, calls } = setup([viewed(), viewed()]);
    const message = await rejectsWith(provider.read([linkTo(), link]), "TRACKER_REJECTED");
    holds(message, link.key);
    holds(message, link.url);
    assert.equal(calls.length, 0);
  }
  assert.equal((await setup([viewed()], { ...jiraConfig, host: "JIRA.Example.com" }).provider.read([{ ...linkTo(), url: "https://jira.EXAMPLE.com/browse/FAILW-5" }])).length, 1);
});

test("the exact not-found line is unreachable with no marker key; any other failure fails the read", async () => {
  for (const answer of [failed(NOT_FOUND), crlf(failed(NOT_FOUND))]) {
    const observation = await readOne(answer);
    assert.deepEqual(observation, { link: linkTo(), state: "unreachable", detail: "not found" });
    assert.ok(!Object.hasOwn(observation, "marker"));
  }
  for (const answer of [failed(`${NOT_FOUND} `), { ...failed(NOT_FOUND), status: 2 }, failed("✗ Error: something else")]) {
    holds(await rejectsWith(setup([answer]).provider.read([linkTo()]), "TRACKER_REJECTED"), "acli failed: ✗ Error:");
  }
  await rejectsWith(setup([MISSING]).provider.read([linkTo()]), "TRACKER_UNAVAILABLE");
});

test("read returns the marker's key, null when the description has no readable marker, and the key when it names another action", async () => {
  assert.equal((await readOne(viewed())).marker, "fmea-min/ch-1/act-1");
  assert.equal((await readOne(viewed("FAILW-5", { description: null }))).marker, null);
  assert.equal((await readOne(viewed("FAILW-5", { description: { version: 1, type: "doc", content: [] } }))).marker, null);
  const other = renderDescription({ ...TRACKED, key: "fmea-min/ch-2/act-3" });
  assert.equal((await readOne(viewed("FAILW-5", { description: other }))).marker, "fmea-min/ch-2/act-3");
});

test("the recorded FAILW-5 answer reads as done with the status and resolution in detail and closed_date 2026-10-07; the recorded FLSCR-3 answer reads as dropped", async () => {
  assert.deepEqual(await readOne(viewed()), { link: linkTo(), state: "done", detail: "Done, resolution Done", closed_date: "2026-10-07", marker: "fmea-min/ch-1/act-1" });
  const [dropped] = await setup([FLSCR3]).provider.read([linkTo("FLSCR-3", "10022")]);
  assert.deepEqual(dropped, { link: linkTo("FLSCR-3", "10022"), state: "dropped", detail: "Won't Do", marker: null });
  assert.ok(!Object.hasOwn(dropped, "closed_date"));
});

test("every branch of the mapping with the default lists: category new, indeterminate and undefined are open whatever the names; done with neither name listed is closed", async () => {
  for (const category of ["new", "indeterminate", "undefined"]) {
    for (const name of ["Done", "Won't Do", "To Do"]) assert.equal(await stateOf({ status: status(name, category) }), "open", `${name} in ${category}`);
  }
  assert.equal(await stateOf({ status: status("Closed", "done"), resolution: null }), "closed");
  assert.equal(await stateOf({ status: status("Closed", "done"), resolution: { name: "Fixed" } }), "closed");
  assert.equal(await stateOf({ status: status("Done", "done"), resolution: null }), "done");
  assert.equal(await stateOf({ status: status("Won't Do", "done"), resolution: null }), "dropped");
});

test("a configured done list, a configured dropped list, one key alone replacing its own default, an empty list, a name in both lists, and a near-miss name", async () => {
  const doneClosed = { ...jiraConfig, states: { done: ["Closed"] } };
  assert.equal(await stateOf({ status: status("Done", "done"), resolution: null }, doneClosed), "closed");
  assert.equal(await stateOf({ status: status("Closed", "done"), resolution: null }, doneClosed), "done");
  assert.equal(await stateOf({ status: status("Won't Do", "done"), resolution: null }, doneClosed), "dropped");
  const droppedRejected = { ...jiraConfig, states: { dropped: ["Rejected"] } };
  assert.equal(await stateOf({ status: status("Rejected", "done"), resolution: null }, droppedRejected), "dropped");
  assert.equal(await stateOf({ status: status("Done", "done"), resolution: null }, droppedRejected), "done");
  assert.equal(await stateOf({ status: status("Won't Do", "done"), resolution: null }, { ...jiraConfig, states: { dropped: [] } }), "closed");
  assert.equal(await stateOf({ status: status("Done", "done"), resolution: null }, { ...jiraConfig, states: { done: ["Done"], dropped: ["Done"] } }), "dropped");
  assert.equal(await stateOf({ status: status("done", "done"), resolution: null }), "closed");
  assert.equal(await stateOf({ status: status("Done ", "done"), resolution: null }), "closed");
});

test("a status name and a resolution name each match alone", async () => {
  assert.equal(await stateOf({ status: status("Complete", "done"), resolution: { name: "Done" } }), "done");
  assert.equal(await stateOf({ status: status("Done", "done"), resolution: { name: "Duplicate" } }), "done");
  assert.equal(await stateOf({ status: status("Closed", "done"), resolution: { name: "Won't Do" } }), "dropped");
  assert.equal((await readOne(viewed("FAILW-5", { status: status("Closed", "done"), resolution: { name: "Won't Do" } }))).detail, "Closed, resolution Won't Do");
});

test("a missing or unknown status category, a resolution without a name, and a resolution date Node cannot parse are TRACKER_REJECTED", async () => {
  const answers = [
    viewed("FAILW-5", { status: { name: "Done" } }),
    viewed("FAILW-5", { status: { name: "Done", statusCategory: {} } }),
    viewed("FAILW-5", { status: status("Done", "finished") }),
    viewed("FAILW-5", { status: status("Done", "Done") }),
    viewed("FAILW-5", { status: { statusCategory: { key: "done" } } }),
    viewed("FAILW-5", { status: undefined }),
    viewed("FAILW-5", { resolution: { id: "10000" } }),
    viewed("FAILW-5", { resolution: "Done" }),
    viewed("FAILW-5", { resolution: undefined }),
    viewed("FAILW-5", { resolutiondate: "yesterday" }),
    viewed("FAILW-5", { resolutiondate: 1_759_812_625_583 }),
    viewed("FAILW-5", { status: status("To Do", "new"), resolutiondate: "not a date" }),
    viewed("FAILW-5", { description: undefined }),
    viewed("FAILW-5", { description: "Bound the retries" }),
    ok({ id: "10015", fields: {} }),
    ok({ id: "10015", key: "failw-5", fields: {} }),
    ok({ id: "10015", key: "FAILW-5" }),
    ok("not json"),
  ];
  for (const answer of answers) {
    holds(await rejectsWith(readOne(answer), "TRACKER_REJECTED"), "in a form the script cannot read");
  }
});

test("closed_date is the UTC date of the resolution date, in the recorded form, near midnight, with +0000 and with Z, and is absent on an open item", async () => {
  const dates: [string, string][] = [
    ["2026-10-07T00:50:25.583-0400", "2026-10-07"],
    ["2026-10-07T22:30:00.000-0400", "2026-10-08"],
    ["2026-10-07T04:50:25.000+0000", "2026-10-07"],
    ["2026-10-07T04:50:25Z", "2026-10-07"],
  ];
  for (const [resolutiondate, date] of dates) assert.equal((await readOne(viewed("FAILW-5", { resolutiondate }))).closed_date, date, resolutiondate);
  const open = await readOne(viewed("FAILW-5", { status: status("In Progress", "indeterminate") }));
  assert.equal(open.state, "open");
  assert.ok(!Object.hasOwn(open, "closed_date"));
  const undated = await readOne(viewed("FAILW-5", { resolutiondate: undefined }));
  assert.equal(undated.state, "done");
  assert.ok(!Object.hasOwn(undated, "closed_date"));
});

test("a moved item answers under its new key, and the link's key and url follow it", async () => {
  const [moved] = await setup([viewed("FLSCR-5", { status: status("Backlog", "new"), resolution: null, resolutiondate: null }, "10019")]).provider.read([linkTo("FAILW-8", "10019")]);
  assert.deepEqual(moved.link, { provider: "jira", id: "10019", key: "FLSCR-5", url: "https://jira.example.com/browse/FLSCR-5" });
  assert.equal(moved.state, "open");
});

test("read gives one observation per link, in order, and stops at the first failure", async () => {
  const links = [linkTo(), linkTo("FLSCR-3", "10022"), linkTo("FAILW-9", "10020")];
  const read = await setup([viewed(), FLSCR3, failed(NOT_FOUND)]).provider.read(links);
  assert.deepEqual(read.map((o) => [o.link.key, o.state]), [["FAILW-5", "done"], ["FLSCR-3", "dropped"], ["FAILW-9", "unreachable"]]);
  const { provider, calls } = setup([viewed(), failed("✗ Error: something else"), FLSCR3]);
  await rejectsWith(provider.read(links), "TRACKER_REJECTED");
  assert.equal(calls.length, 2);
  assert.deepEqual(await setup([]).provider.read([]), []);
});
