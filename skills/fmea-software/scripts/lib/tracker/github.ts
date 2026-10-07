// The GitHub adapter (§8): the four methods of the seam over `gh api`, through an injected
// function that starts `gh`, so the tests answer from a fake. Every call names the host, every
// request body is JSON on stdin, every path is built here from the validated project and the
// percent-encoded label, and every answer is judged by the HTTP status `--include` printed,
// never by gh's exit status alone and never by following a URL the answer holds.

import { ScriptError } from "../codes.ts";
import type { ObservedState, TrackerConfig } from "../types.ts";
import { readMarker, renderBody, renderTitle } from "./github-body.ts";
import { isRecord, recordOf } from "./json.ts";
import type { Json } from "./json.ts";
import { CreatedWithFault, TrackerWait } from "./provider.ts";
import type { Link, Observation, Provider, RemoteItem, Target, TrackedItem, Visibility } from "./provider.ts";
import type { ProcessResult } from "./spawn.ts";

export type Gh = (args: string[], input?: string) => Promise<ProcessResult>;

const PROJECT = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;
const PAGE_SIZE = 100;
const READ_BATCH = 100;
const WRITE_GAP_MS = 1000;
const LABEL_FIELDS = { color: "6e7781", description: "Actions tracked from a failwise FMEA" };
const STATUS_LINE = /^HTTP\/\S+ ([0-9]{3})(?: .*)?$/;
const WHOLE_SECONDS = /^[0-9]+$/;
const READ_QUERY = "query($ids: [ID!]!) { nodes(ids: $ids) { ... on Issue { id number url state stateReason closedAt repository { nameWithOwner } } } }";
// A closed issue's reason, in lower case, and what it means (§8.2); any other reason is plain `closed`.
const CLOSED_REASONS = new Map<string, [ObservedState, string]>([
  ["completed", ["done", "closed: completed"]],
  ["not_planned", ["dropped", "closed: not_planned"]],
  ["duplicate", ["closed", "closed: duplicate"]],
]);

/** An answer as `gh api --include` printed it; header names in lower case. */
interface Answer { status: number; headers: Map<string, string>; body: string }
/** What a 404 means for a request: the repository is out of reach, the label is absent, or a refusal. */
type NotFound = "unavailable" | "absent" | "rejected";
interface Request { path: string; post?: boolean; body?: object; expect: 200 | 201; notFound?: NotFound }
interface Ctx { gh: Gh; host: string; project: string; label: string }

const unavailable = (message: string): ScriptError => new ScriptError("TRACKER_UNAVAILABLE", message);
const rejected = (message: string): ScriptError => new ScriptError("TRACKER_REJECTED", message);

/** The command that signs gh in to the host: github.com is its default, any other host is named. */
function signIn(host: string): string {
  return host === "github.com" ? "gh auth login" : `gh auth login --hostname ${host}`;
}

/** The status, headers and body of what gh printed, or the failure of gh itself (§8.1's table). */
function parseAnswer(result: ProcessResult, host: string): Answer {
  if (result.missing) throw unavailable("gh was not found: install the GitHub CLI and sign in with gh auth login");
  if (result.status === 4) throw unavailable(`gh is not signed in to ${host}: run ${signIn(host)}`);
  const blank = /\r?\n\r?\n/.exec(result.stdout);
  const head = (blank === null ? result.stdout : result.stdout.slice(0, blank.index)).split(/\r?\n/);
  const statusLine = STATUS_LINE.exec(head[0]);
  if (statusLine === null) {
    const said = result.stderr.replace(/\s+/g, " ").trim();
    throw unavailable(`gh printed no answer from the host: ${said === "" ? "it said nothing" : said}`);
  }
  const headers = new Map<string, string>();
  for (const line of head.slice(1)) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return { status: Number(statusLine[1]), headers, body: blank === null ? "" : result.stdout.slice(blank.index + blank[0].length) };
}

/** The seconds of a `retry-after` header; a value that is not a whole number of seconds is none. */
function retryAfter(answer: Answer): number | undefined {
  const value = answer.headers.get("retry-after");
  return value !== undefined && WHOLE_SECONDS.test(value) ? Number(value) : undefined;
}

/** `: <message>` when the body is GitHub's JSON error with a message, else nothing. */
function messageOf(answer: Answer): string {
  try {
    const body: unknown = JSON.parse(answer.body);
    return isRecord(body) && typeof body.message === "string" ? `: ${body.message}` : "";
  } catch {
    return "";
  }
}

/** What an answer other than the expected status means: a wait, a failure, or, for a 404 that
 *  means absent, null. */
function refusal(answer: Answer, notFound: NotFound, host: string): Error | null {
  const { status } = answer;
  const wait = status === 403 || status === 429 ? retryAfter(answer) : undefined;
  if (wait !== undefined) return new TrackerWait(wait);
  if (status === 401) return unavailable(`${host} answered 401: gh is not signed in to it; run ${signIn(host)}`);
  if (status === 429 || status >= 500) return unavailable(`the host answered ${status}${messageOf(answer)}`);
  if (status === 404 && notFound === "absent") return null;
  if (status === 404 && notFound === "unavailable") return unavailable("the repository was not found, or this account cannot see it");
  return rejected(`the host answered ${status}${messageOf(answer)}`);
}

/** One `gh api` request. The parsed JSON body of the expected status with the answer's headers, or
 *  undefined when a 404 means absent; any other answer throws. */
async function exchange(ctx: Ctx, request: Request): Promise<{ json: unknown; headers: Map<string, string> } | undefined> {
  const method = request.post === true ? ["--method", "POST"] : [];
  const input = request.body === undefined ? [] : ["--input", "-"];
  const args = ["api", "--hostname", ctx.host, "--include", ...method, request.path, ...input];
  const answer = parseAnswer(await ctx.gh(args, request.body === undefined ? undefined : JSON.stringify(request.body)), ctx.host);
  if (answer.status !== request.expect) {
    const failure = refusal(answer, request.notFound ?? "rejected", ctx.host);
    if (failure !== null) throw failure;
    return undefined;
  }
  try {
    return { json: JSON.parse(answer.body) as unknown, headers: answer.headers };
  } catch {
    throw rejected(`the host answered ${answer.status} with a body that is not JSON`);
  }
}

/** The parsed JSON body of one request, as `exchange` gives it, without the headers. */
async function api(ctx: Ctx, request: Request): Promise<unknown> {
  return (await exchange(ctx, request))?.json;
}

/** Whether a `link` header names a next page. The URL it gives is never followed. */
function namesNextPage(link: string | undefined): boolean {
  return (link ?? "").split(",").some((part) => /;\s*rel="?([^";]*)"?/i.exec(part)?.[1].trim().split(/\s+/).includes("next") === true);
}

function visibilityOf(value: unknown): Visibility {
  return value === "public" || value === "internal" || value === "private" ? value : "unknown";
}

/** Why this account cannot create a labelled issue in the repository, or undefined when it can. */
function noCreate(ctx: Ctx, repo: Json): string | undefined {
  if (repo.has_issues !== true) return `${ctx.project} has issues turned off`;
  if (repo.archived !== false) return `${ctx.project} is archived, so nothing can be created in it`;
  if (!isRecord(repo.permissions) || repo.permissions.push !== true) {
    return `this account cannot push to ${ctx.project}, and without push GitHub drops the label of a new issue`;
  }
  return undefined;
}

/** The target, with `no_create` when an issue cannot be created in it; reading back needs none of the three. */
async function describe(ctx: Ctx): Promise<Target> {
  const repo = recordOf(await api(ctx, { path: `repos/${ctx.project}`, expect: 200, notFound: "unavailable" }), "the repository");
  const target: Target = { provider: "github", host: ctx.host, project: ctx.project, label: ctx.label, visibility: visibilityOf(repo.visibility), write_gap_ms: WRITE_GAP_MS };
  const reason = noCreate(ctx, repo);
  return reason === undefined ? target : { ...target, no_create: reason };
}

/** The link of an issue as the REST API gives it. */
function linkFrom(ctx: Ctx, issue: Json): Link {
  const { node_id: id, number, html_url: url } = issue;
  if (typeof id !== "string" || id === "" || !Number.isInteger(number) || typeof url !== "string") {
    throw rejected("the host answered with an issue that lacks a node_id, a number or an html_url");
  }
  return { provider: "github", id, key: `${ctx.project}#${String(number)}`, url };
}

/** One entry of the listing: its link and marker, or null for a pull request. An id met before
 *  means the listing moved under the pages, so it is not complete (§6.4). */
function remoteOf(ctx: Ctx, entry: unknown, seen: Set<string>): RemoteItem | null {
  const issue = recordOf(entry, "an entry of the listing");
  const link = linkFrom(ctx, issue);
  if (seen.has(link.id)) throw unavailable("the listing changed while it was read, so it is not complete: run the command again");
  seen.add(link.id);
  if (Object.hasOwn(issue, "pull_request")) return null;
  return { link, marker: readMarker(typeof issue.body === "string" ? issue.body : null) };
}

async function listMarked(ctx: Ctx): Promise<RemoteItem[]> {
  const seen = new Set<string>();
  const items: RemoteItem[] = [];
  let page = 0;
  let entries: unknown[] = [];
  do {
    page += 1;
    const path = `repos/${ctx.project}/issues?labels=${encodeURIComponent(ctx.label)}&state=all&per_page=${PAGE_SIZE}&sort=created&direction=asc&page=${page}`;
    const answer = await exchange(ctx, { path, expect: 200 });
    if (answer === undefined || !Array.isArray(answer.json)) throw rejected("a page of the listing is not a JSON array");
    entries = answer.json;
    for (const entry of entries) {
      const remote = remoteOf(ctx, entry, seen);
      if (remote !== null) items.push(remote);
    }
    // A short page is the last only when the host does not say that another follows (§6.4).
    if (entries.length < PAGE_SIZE && namesNextPage(answer.headers.get("link"))) {
      throw unavailable(`page ${page} of the listing holds fewer than ${PAGE_SIZE} entries and the host says another follows, so the listing is not complete`);
    }
  } while (entries.length >= PAGE_SIZE);
  return items;
}

/** Reads the label and creates it when the read answers 404. */
async function ensureLabel(ctx: Ctx): Promise<void> {
  const found = await api(ctx, { path: `repos/${ctx.project}/labels/${encodeURIComponent(ctx.label)}`, expect: 200, notFound: "absent" });
  if (found !== undefined) return;
  await api(ctx, { path: `repos/${ctx.project}/labels`, post: true, body: { name: ctx.label, ...LABEL_FIELDS }, expect: 201 });
}

function carriesLabel(labels: unknown, label: string): boolean {
  const wanted = label.toLowerCase();
  return Array.isArray(labels) && labels.some((l) => isRecord(l) && typeof l.name === "string" && l.name.toLowerCase() === wanted);
}

async function createIssue(ctx: Ctx, item: TrackedItem): Promise<Link> {
  const body = { title: renderTitle(item.content), body: renderBody(item), labels: [ctx.label] };
  const issue = recordOf(await api(ctx, { path: `repos/${ctx.project}/issues`, post: true, body, expect: 201 }), "the created issue");
  const link = linkFrom(ctx, issue);
  if (!carriesLabel(issue.labels, ctx.label)) {
    throw new CreatedWithFault(link, `${link.key} was created without the label ${ctx.label}, which finding it again depends on; add the label to it by hand`);
  }
  return link;
}

/** The indexes of the null nodes that errors[] names as NOT_FOUND. Any other error, or one that
 *  names a node that resolved, fails the read (§8.2). */
function unresolved(errors: unknown, nodes: unknown[]): Set<number> {
  if (errors !== undefined && !Array.isArray(errors)) throw rejected("the answer to the read holds errors that are not a list");
  const found = new Set<number>();
  for (const error of errors ?? []) {
    const path: unknown = isRecord(error) ? error.path : undefined;
    const index = Array.isArray(path) && path.length === 2 && path[0] === "nodes" ? path[1] : undefined;
    if (!isRecord(error) || error.type !== "NOT_FOUND" || typeof index !== "number" || nodes[index] !== null) {
      throw rejected(`the host refused the read: ${isRecord(error) ? String(error.type) : "an error it did not name"}`);
    }
    found.add(index);
  }
  return found;
}

/** The neutral state and the detail of an issue's state and reason (§8.2's table). */
function stateOf(state: unknown, reason: unknown): [ObservedState, string] {
  const lower = typeof state === "string" ? state.toLowerCase() : "";
  if (lower === "open") return ["open", "open"];
  if (lower !== "closed") throw rejected(`the host answered an issue state that is neither open nor closed: ${JSON.stringify(state)}`);
  return CLOSED_REASONS.get(typeof reason === "string" ? reason.toLowerCase() : "") ?? ["closed", "closed"];
}

/** The observation of a resolved issue; its key and URL are where the issue is now. */
function issueObservation(link: Link, node: Json): Observation {
  const { id, number, url, repository, closedAt } = node;
  const owner = isRecord(repository) ? repository.nameWithOwner : undefined;
  if (typeof id !== "string" || !Number.isInteger(number) || typeof url !== "string" || typeof owner !== "string") {
    throw rejected(`the host answered for ${link.key} with an issue that lacks an id, a number, a url or a repository`);
  }
  const [state, detail] = stateOf(node.state, node.stateReason);
  const observation: Observation = { link: { provider: "github", id: link.id, key: `${owner}#${String(number)}`, url }, state, detail };
  return typeof closedAt === "string" ? { ...observation, closed_date: closedAt.slice(0, 10) } : observation;
}

function observe(link: Link, node: unknown, notFound: boolean): Observation {
  const gone: Observation = { link, state: "unreachable", detail: "not found" };
  if (node === null && notFound) return gone;
  if (!isRecord(node)) throw rejected(`the host answered nothing it could explain for ${link.key}`);
  return node.id === undefined ? gone : issueObservation(link, node);
}

async function readBatch(ctx: Ctx, batch: Link[]): Promise<Observation[]> {
  const body = { query: READ_QUERY, variables: { ids: batch.map((l) => l.id) } };
  const answer = recordOf(await api(ctx, { path: "graphql", body, expect: 200 }), "the answer to the read");
  const nodes = isRecord(answer.data) ? answer.data.nodes : undefined;
  if (!Array.isArray(nodes) || nodes.length !== batch.length) throw rejected("the answer to the read holds no node for every id asked");
  const found = unresolved(answer.errors, nodes);
  return batch.map((link, i) => observe(link, nodes[i], found.has(i)));
}

/** Every link is a GitHub link, before any request: a link of another provider is never read here. */
function checkLinks(links: Link[]): void {
  for (const link of links) {
    if (link.provider !== "github") throw rejected(`the link ${link.key} at ${link.url} is not a GitHub issue that this script can read`);
  }
}

async function read(ctx: Ctx, links: Link[]): Promise<Observation[]> {
  checkLinks(links);
  const observations: Observation[] = [];
  for (let start = 0; start < links.length; start += READ_BATCH) {
    observations.push(...(await readBatch(ctx, links.slice(start, start + READ_BATCH))));
  }
  return observations;
}

/** The GitHub provider for a document's tracker configuration. The label is read, and created
 *  when absent, once per provider, before its first issue. */
export function githubProvider(config: TrackerConfig, gh: Gh): Provider {
  if (!PROJECT.test(config.project)) {
    throw new ScriptError("TRACKER_CONFIG", `the project must have the form owner/repository, got ${JSON.stringify(config.project)}`, "/meta/tracker/project");
  }
  const ctx: Ctx = { gh, host: config.host ?? "github.com", project: config.project, label: config.label };
  let labelReady = false;
  return {
    describe: () => describe(ctx),
    listMarked: () => listMarked(ctx),
    async create(item) {
      if (!labelReady) await ensureLabel(ctx);
      labelReady = true;
      return createIssue(ctx, item);
    },
    read: (links) => read(ctx, links),
  };
}
