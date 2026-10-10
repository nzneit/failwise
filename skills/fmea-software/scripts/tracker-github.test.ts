import { test } from "node:test";
import assert from "node:assert/strict";
import { githubProvider } from "./lib/tracker/github.ts";
import type { Gh } from "./lib/tracker/github.ts";
import type { ProcessResult } from "./lib/tracker/spawn.ts";
import { renderBody, renderTitle } from "./lib/tracker/github-body.ts";
import { CreatedWithFault, TrackerWait } from "./lib/tracker/provider.ts";
import type { Link, Provider, TrackedItem } from "./lib/tracker/provider.ts";
import type { TrackerConfig } from "./lib/types.ts";

// No test starts gh: every answer comes from a queue, in the shapes `gh api --include` printed
// when it was recorded (gh 2.100.0).

const config: TrackerConfig = { provider: "github", project: "acme/checkout", label: "failwise" };
const PREFIX = ["api", "--hostname", "github.com", "--include"];
const REASONS: Record<number, string> = { 200: "OK", 201: "Created", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 422: "Unprocessable Entity", 429: "Too Many Requests", 502: "Bad Gateway" };

/** What gh prints for an answer: the status line, headers, a blank line, the body; gh exits 1 from 400 up. */
function answer(status: number, body: unknown, headers: Record<string, string> = {}): ProcessResult {
  const head = [`HTTP/2.0 ${status} ${REASONS[status]}`, "Content-Type: application/json; charset=utf-8", ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`)];
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const failed = status >= 400;
  return { status: failed ? 1 : 0, stdout: `${head.join("\r\n")}\r\n\r\n${text}`, stderr: failed ? `gh: ${REASONS[status]} (HTTP ${status})\n` : "", missing: false };
}

/** The same answer with bare line feeds in its head. */
const lf = (r: ProcessResult): ProcessResult => ({ ...r, stdout: r.stdout.replaceAll("\r\n", "\n") });

interface Call { args: string[]; input?: string }
interface Setup { provider: Provider; calls: Call[] }

/** A provider over a fake gh that records each call and answers from the queue, in order. */
function setup(answers: ProcessResult[], cfg: TrackerConfig = config): Setup {
  const queue = [...answers];
  const calls: Call[] = [];
  const gh: Gh = async (args, input) => {
    calls.push(input === undefined ? { args } : { args, input });
    const next = queue.shift();
    if (next === undefined) throw new Error(`gh was called once more than the test expected: ${args.join(" ")}`);
    return next;
  };
  return { provider: githubProvider(cfg, gh), calls };
}

const stdinOf = (call: Call): unknown => JSON.parse(call.input ?? "null");
const repository = (fields: object = {}): object => ({ visibility: "private", has_issues: true, archived: false, permissions: { push: true }, ...fields });
const issueUrl = (n: number): string => `https://github.com/acme/checkout/issues/${n}`;
const issue = (n: number, fields: object = {}): object => ({ node_id: `I_${n}`, number: n, html_url: issueUrl(n), body: null, labels: [{ name: "failwise" }], ...fields });
const linkOf = (n: number): Link => ({ provider: "github", id: `I_${n}`, key: `acme/checkout#${n}`, url: issueUrl(n) });
const labelAnswer = answer(200, { name: "failwise", color: "6e7781" });

function item(title = "Add a retry budget"): TrackedItem {
  return {
    key: "fmea-min/ch-1/act-1", text: "0123456789ab", label: "failwise", due: "2026-11-01",
    content: { title, action: "Add a retry budget to the client", sections: [{ heading: "This action", blocks: [{ kind: "fact", label: "Owner", value: "A. Owner" }] }], origin: { analysis: "Checkout", version: 1, chain: "ch-1", action: "act-1" } },
  };
}

/** A GraphQL issue node; `state` and `stateReason` as the API spells them. */
const node = (n: number, state = "OPEN", stateReason: string | null = null, closedAt: string | null = null): object => ({
  id: `I_${n}`, number: n, url: issueUrl(n), state, stateReason, closedAt, repository: { nameWithOwner: "acme/checkout" },
});
const graphql = (nodes: unknown[], errors?: object[], exit = 0): ProcessResult => ({ ...answer(200, errors === undefined ? { data: { nodes } } : { data: { nodes }, errors }), status: exit });

/** One call of every kind: describe, a listing page, the label read, an issue, a read. */
async function everyCall(cfg: TrackerConfig = config): Promise<Call[]> {
  const { provider, calls } = setup([answer(200, repository()), answer(200, []), labelAnswer, answer(201, issue(1)), graphql([node(1)])], cfg);
  await provider.describe();
  await provider.listMarked();
  await provider.create(item());
  await provider.read([linkOf(1)]);
  assert.equal(calls.length, 5);
  return calls;
}

async function rejectsWith(promise: Promise<unknown>, code: string, label?: string): Promise<void> {
  await assert.rejects(promise, { name: "ScriptError", code }, label);
}

async function waitOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof TrackerWait) return err.seconds;
    throw err;
  }
  throw new Error("the call did not ask to wait");
}

// how gh is called

test("every call begins api --hostname <host> --include, and the host is github.com when the document names none", async () => {
  for (const call of await everyCall()) assert.deepEqual(call.args.slice(0, 4), PREFIX);
  for (const call of await everyCall({ ...config, host: "github.example.com" })) {
    assert.deepEqual(call.args.slice(0, 4), ["api", "--hostname", "github.example.com", "--include"]);
  }
});

test("no call ever carries -f or -F", async () => {
  const args = (await everyCall()).flatMap((c) => c.args);
  for (const flag of ["-f", "-F", "--field", "--raw-field"]) assert.ok(!args.includes(flag), flag);
});

test("a project of {owner}/{repo}, or with a space, is TRACKER_CONFIG at /meta/tracker/project", () => {
  for (const project of ["{owner}/{repo}", "acme/check out", "acme", "-acme/checkout", "acme/checkout/x"]) {
    assert.throws(() => setup([], { ...config, project }), { name: "ScriptError", code: "TRACKER_CONFIG", pointer: "/meta/tracker/project" }, project);
  }
});

test("a title that begins with @ travels in the JSON on stdin and never as an argument", async () => {
  const title = "@acme/platform-team -F x=@/etc/passwd";
  const { provider, calls } = setup([labelAnswer, answer(201, issue(1))]);
  await provider.create(item(title));
  const post = calls[1];
  assert.deepEqual(post.args.slice(4), ["--method", "POST", "repos/acme/checkout/issues", "--input", "-"]);
  assert.equal((stdinOf(post) as { title: string }).title, title);
  assert.ok(calls.every((c) => c.args.every((a) => !a.includes("@"))));
});

test("a label that needs encoding is percent-encoded in the path and the query", async () => {
  const label = "fail wise/é&x=1#{owner}";
  const encoded = "fail%20wise%2F%C3%A9%26x%3D1%23%7Bowner%7D";
  const { provider, calls } = setup([answer(200, []), answer(404, { message: "Not Found" }), answer(201, { name: label }), answer(201, issue(1, { labels: [{ name: label }] }))], { ...config, label });
  await provider.listMarked();
  await provider.create(item());
  assert.equal(calls[0].args[4], `repos/acme/checkout/issues?labels=${encoded}&state=all&per_page=100&sort=created&direction=asc&page=1`);
  assert.equal(calls[1].args[4], `repos/acme/checkout/labels/${encoded}`);
  assert.equal((stdinOf(calls[2]) as { name: string }).name, label);
  assert.deepEqual((stdinOf(calls[3]) as { labels: string[] }).labels, [label]);
});

test("no call carries an X-GitHub-Api-Version header", async () => {
  const args = (await everyCall()).flatMap((c) => c.args);
  assert.ok(args.every((a) => !/x-github-api-version/i.test(a)));
  assert.ok(!args.includes("-H") && !args.includes("--header"));
});

// describe

test("describe maps public, internal and private, and anything else to unknown", async () => {
  const cases: [unknown, string][] = [["public", "public"], ["internal", "internal"], ["private", "private"], ["PRIVATE", "unknown"], ["secret", "unknown"], [null, "unknown"], [undefined, "unknown"]];
  for (const [visibility, expected] of cases) {
    const { provider, calls } = setup([lf(answer(200, repository({ visibility })))]);
    const target = await provider.describe();
    assert.deepEqual(target, { provider: "github", host: "github.com", project: "acme/checkout", label: "failwise", visibility: expected, write_gap_ms: 1000 });
    assert.deepEqual(calls[0], { args: [...PREFIX, "repos/acme/checkout"] });
  }
});

test("describe gives issues disabled, an archived repository and no push access as no_create, each with its own message", async () => {
  const cases: [object, RegExp][] = [
    [{ has_issues: false }, /^acme\/checkout has issues turned off$/],
    [{ archived: true }, /^acme\/checkout is archived, so nothing can be created in it$/],
    [{ permissions: { push: false, pull: true } }, /^this account cannot push to acme\/checkout, and without push GitHub drops the label of a new issue$/],
  ];
  for (const [fields, message] of cases) {
    const target = await setup([answer(200, repository(fields))]).provider.describe();
    assert.match(target.no_create ?? "", message);
    assert.equal(target.visibility, "private");
  }
});

test("describe maps gh missing, exit 4, no status line, 401 and 404 to TRACKER_UNAVAILABLE", async () => {
  const offline: ProcessResult = { status: 1, stdout: "", stderr: "error connecting to api.github.com\ncheck your internet connection\n", missing: false };
  const answers: ProcessResult[] = [
    { status: null, stdout: "", stderr: "", missing: true },
    { status: 4, stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login\n", missing: false },
    offline,
    answer(401, { message: "Requires authentication" }),
    answer(404, { message: "Not Found" }),
  ];
  for (const one of answers) await rejectsWith(setup([one]).provider.describe(), "TRACKER_UNAVAILABLE", one.stdout.split("\n")[0]);
  await assert.rejects(setup([offline]).provider.describe(), { message: /error connecting to api\.github\.com check your internet connection$/ });
});

test("the not-signed-in messages of exit 4 and of a 401 name the host and the sign-in for it", async () => {
  const exit4: ProcessResult = { status: 4, stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login\n", missing: false };
  const cases: [string | undefined, string, string][] = [
    [undefined, "github.com", "gh auth login"],
    ["github.example.com", "github.example.com", "gh auth login --hostname github.example.com"],
  ];
  for (const [host, named, signIn] of cases) {
    const cfg = host === undefined ? config : { ...config, host };
    await assert.rejects(setup([exit4], cfg).provider.describe(), { code: "TRACKER_UNAVAILABLE", message: `gh is not signed in to ${named}: run ${signIn}` });
    await assert.rejects(setup([answer(401, { message: "Requires authentication" })], cfg).provider.describe(), { code: "TRACKER_UNAVAILABLE", message: `${named} answered 401: gh is not signed in to it; run ${signIn}` });
  }
});

// listMarked

test("listMarked asks for pages until one holds fewer than 100 entries, and leaves pull requests out", async () => {
  const first = Array.from({ length: 100 }, (_, i) => (i === 5 ? issue(i + 1, { pull_request: { url: "x" } }) : issue(i + 1)));
  const { provider, calls } = setup([answer(200, first), lf(answer(200, [issue(101), issue(102)]))]);
  const items = await provider.listMarked();
  assert.deepEqual(calls.map((c) => c.args.at(-1)?.split("&page=")[1]), ["1", "2"]);
  assert.equal(items.length, 101);
  assert.ok(!items.some((i) => i.link.key === "acme/checkout#6"));
  const full = setup([answer(200, first.map((_, i) => issue(i + 1))), answer(200, [])]);
  assert.equal((await full.provider.listMarked()).length, 100);
  assert.equal(full.calls.length, 2);
});

test("listMarked fails with TRACKER_UNAVAILABLE when a later page repeats an id, and reads a Retry-After header whatever its case", async () => {
  const first = Array.from({ length: 100 }, (_, i) => issue(i + 1));
  await rejectsWith(setup([answer(200, first), answer(200, [issue(100)])]).provider.listMarked(), "TRACKER_UNAVAILABLE");
  for (const name of ["Retry-After", "retry-after", "RETRY-AFTER"]) {
    assert.equal(await waitOf(setup([answer(403, { message: "rate limit" }, { [name]: "30" })]).provider.listMarked()), 30, name);
  }
});

test("a page of fewer than 100 entries whose Link header names a next page fails the listing, and no URL of the header is followed", async () => {
  const next = "<https://api.github.com/repositories/1/issues?labels=failwise&page=2&after=abc>; rel=\"next\"";
  for (const name of ["Link", "link", "LINK"]) {
    const { provider, calls } = setup([answer(200, [issue(1), issue(2)], { [name]: next })]);
    await rejectsWith(provider.listMarked(), "TRACKER_UNAVAILABLE", name);
    assert.equal(calls.length, 1);
  }
  const last = "<https://api.github.com/repositories/1/issues?labels=failwise&page=1>; rel=\"prev\", <https://api.github.com/repositories/1/issues?labels=failwise&page=1>; rel=\"first\"";
  assert.equal((await setup([answer(200, [issue(1)], { Link: last })]).provider.listMarked()).length, 1);
});

test("listMarked gives each issue its link and the marker read from its body", async () => {
  const body = "The action\n\n<!-- failwise:key=fmea-min/ch-1/act-1 text=0123456789ab -->\n";
  const { provider } = setup([answer(200, [issue(7, { body }), issue(8)])]);
  assert.deepEqual(await provider.listMarked(), [
    { link: linkOf(7), marker: { key: "fmea-min/ch-1/act-1", text: "0123456789ab" } },
    { link: linkOf(8), marker: null },
  ]);
  await rejectsWith(setup([answer(200, [{ number: 9 }])]).provider.listMarked(), "TRACKER_REJECTED");
  await rejectsWith(setup([answer(200, { items: [] })]).provider.listMarked(), "TRACKER_REJECTED");
});

// create

test("create reads the label, creates it on 404, and does both once for several items", async () => {
  const { provider, calls } = setup([answer(404, { message: "Not Found" }), answer(201, { name: "failwise" }), answer(201, issue(1)), answer(201, issue(2))]);
  await provider.create(item());
  await provider.create(item());
  assert.deepEqual(calls.map((c) => c.args.slice(4)), [
    ["repos/acme/checkout/labels/failwise"],
    ["--method", "POST", "repos/acme/checkout/labels", "--input", "-"],
    ["--method", "POST", "repos/acme/checkout/issues", "--input", "-"],
    ["--method", "POST", "repos/acme/checkout/issues", "--input", "-"],
  ]);
  assert.deepEqual(stdinOf(calls[1]), { name: "failwise", color: "6e7781", description: "Actions tracked from a failwise FMEA" });
  const present = setup([labelAnswer, answer(201, issue(1))]);
  await present.provider.create(item());
  assert.equal(present.calls.length, 2);
});

test("create posts title, body and label, and returns node_id, owner/repo#number and html_url", async () => {
  const { provider, calls } = setup([labelAnswer, answer(201, issue(12))]);
  const created = item();
  assert.deepEqual(await provider.create(created), linkOf(12));
  assert.deepEqual(stdinOf(calls[1]), { title: renderTitle(created.content), body: renderBody(created), labels: ["failwise"] });
  for (const missing of ["node_id", "number", "html_url"]) {
    await rejectsWith(setup([labelAnswer, answer(201, issue(12, { [missing]: undefined }))]).provider.create(item()), "TRACKER_REJECTED", missing);
  }
  await rejectsWith(setup([labelAnswer, answer(201, "<html>")]).provider.create(item()), "TRACKER_REJECTED");
});

test("a created issue whose label comes back in another case is not a fault", async () => {
  const { provider } = setup([labelAnswer, answer(201, issue(3, { labels: [{ name: "other" }, { name: "FailWise" }] }))]);
  assert.deepEqual(await provider.create(item()), linkOf(3));
});

test("a created issue that comes back without the label is CreatedWithFault carrying the link", async () => {
  for (const labels of [[], [{ name: "other" }], undefined]) {
    const { provider } = setup([labelAnswer, answer(201, issue(4, { labels }))]);
    await assert.rejects(provider.create(item()), (err) => {
      assert.ok(err instanceof CreatedWithFault);
      assert.deepEqual(err.link, linkOf(4));
      return true;
    });
  }
});

test("a 403 with retry-after is TrackerWait with its seconds; a 403 without is TRACKER_REJECTED", async () => {
  assert.equal(await waitOf(setup([labelAnswer, answer(403, { message: "secondary rate limit" }, { "Retry-After": "60" })]).provider.create(item())), 60);
  await rejectsWith(setup([labelAnswer, answer(403, { message: "Resource not accessible" }, { "X-Ratelimit-Reset": "1790000000" })]).provider.create(item()), "TRACKER_REJECTED");
  assert.equal(await waitOf(setup([answer(429, { message: "slow down" }, { "retry-after": "0" })]).provider.describe()), 0);
});

test("a retry-after that is not a whole number of seconds is not a wait: 403 is TRACKER_REJECTED and 429 is TRACKER_UNAVAILABLE", async () => {
  for (const value of ["1.5", "-1", "soon", "", "Wed, 21 Oct 2026 07:28:00 GMT"]) {
    await rejectsWith(setup([answer(403, { message: "x" }, { "Retry-After": value })]).provider.describe(), "TRACKER_REJECTED", value);
    await rejectsWith(setup([answer(429, { message: "x" }, { "Retry-After": value })]).provider.describe(), "TRACKER_UNAVAILABLE", value);
  }
  await rejectsWith(setup([answer(429, { message: "x" })]).provider.describe(), "TRACKER_UNAVAILABLE");
});

test("a 422 on create is TRACKER_REJECTED", async () => {
  await rejectsWith(setup([labelAnswer, answer(422, { message: "Validation Failed" })]).provider.create(item()), "TRACKER_REJECTED");
  await rejectsWith(setup([answer(502, "bad gateway")]).provider.create(item()), "TRACKER_UNAVAILABLE");
});

// read

const STATES: [string, string | null, string, string][] = [
  ["OPEN", null, "open", "open"],
  ["OPEN", "REOPENED", "open", "open"],
  ["CLOSED", "COMPLETED", "done", "closed: completed"],
  ["CLOSED", "NOT_PLANNED", "dropped", "closed: not_planned"],
  ["CLOSED", "DUPLICATE", "closed", "closed: duplicate"],
  ["CLOSED", "SOMETHING_NEW", "closed", "closed"],
  ["CLOSED", null, "closed", "closed"],
];

test("read sends ids 100 to a call and maps each row of the state table", async () => {
  const links = Array.from({ length: 101 }, (_, i) => linkOf(i + 1));
  const row = (i: number) => STATES[i % STATES.length];
  const nodes = links.map((_, i) => node(i + 1, row(i)[0], row(i)[1]));
  const { provider, calls } = setup([graphql(nodes.slice(0, 100)), graphql(nodes.slice(100))]);
  const observations = await provider.read(links);
  assert.deepEqual(calls.map((c) => c.args.slice(4)), [["graphql", "--input", "-"], ["graphql", "--input", "-"]]);
  const sent = calls.map((c) => stdinOf(c) as { query: string; variables: { ids: string[] } });
  assert.deepEqual(sent.map((s) => s.variables.ids.length), [100, 1]);
  assert.deepEqual(sent[1].variables.ids, ["I_101"]);
  assert.match(sent[0].query, /nodes\(ids: \$ids\)/);
  assert.match(sent[0].query, /\.\.\. on Issue \{ id number url state stateReason closedAt repository \{ nameWithOwner \} \}/);
  assert.deepEqual(observations.map((o) => [o.link, o.state, o.detail]), links.map((l, i) => [l, row(i)[2], row(i)[3]]));
});

test("read takes a null node with its NOT_FOUND error as unreachable, though gh exited 1", async () => {
  const missing = { type: "NOT_FOUND", path: ["nodes", 1], message: "Could not resolve to a node with the global id of 'I_2'" };
  const { provider } = setup([graphql([node(1), null, { id: undefined }], [missing], 1)]);
  const observations = await provider.read([linkOf(1), linkOf(2), linkOf(3)]);
  assert.deepEqual(observations.slice(1), [
    { link: linkOf(2), state: "unreachable", detail: "not found" },
    { link: linkOf(3), state: "unreachable", detail: "not found" },
  ]);
  assert.equal(observations[0].state, "open");
});

test("read fails on a null node with no matching error, on FORBIDDEN, on another error type and on a missing data", async () => {
  const notFound = (i: number): object => ({ type: "NOT_FOUND", path: ["nodes", i], message: "x" });
  const failing: ProcessResult[] = [
    graphql([node(1), null], [], 1),
    graphql([node(1), null], [notFound(0)], 1),
    graphql([node(1), node(2)], [notFound(1)], 1),
    graphql([node(1), null], [{ type: "FORBIDDEN", path: ["nodes", 1], message: "SAML enforcement" }], 1),
    graphql([node(1), node(2)], [{ type: "SERVICE_UNAVAILABLE", path: ["nodes", 1], message: "x" }], 1),
    { ...answer(200, { errors: [notFound(1)] }), status: 1 },
    graphql([node(1)]),
  ];
  for (const [i, one] of failing.entries()) await rejectsWith(setup([one]).provider.read([linkOf(1), linkOf(2)]), "TRACKER_REJECTED", String(i));
  await rejectsWith(setup([answer(404, { message: "Not Found" })]).provider.read([linkOf(1)]), "TRACKER_REJECTED");
});

test("read gives closed_date as the first ten characters of closedAt", async () => {
  const { provider } = setup([graphql([node(1, "CLOSED", "COMPLETED", "2026-09-30T23:59:59Z"), node(2)])]);
  const [closed, open] = await provider.read([linkOf(1), linkOf(2)]);
  assert.equal(closed.closed_date, "2026-09-30");
  assert.ok(!("closed_date" in open));
});

test("a read whose links hold a Jira link is TRACKER_REJECTED naming its key and url, and nothing is read", async () => {
  const jira: Link = { provider: "jira", id: "10015", key: "FAILW-5", url: "https://jira.example.com/browse/FAILW-5" };
  const { provider, calls } = setup([graphql([node(1), node(2)])]);
  await assert.rejects(provider.read([linkOf(1), jira]), {
    name: "ScriptError", code: "TRACKER_REJECTED", message: "the link FAILW-5 at https://jira.example.com/browse/FAILW-5 is not a GitHub issue that this script can read",
  });
  assert.equal(calls.length, 0);
});
