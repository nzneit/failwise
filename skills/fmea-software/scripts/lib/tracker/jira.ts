// The Jira adapter (§6, §7): the four methods of the seam over Atlassian's command-line tool, acli,
// through an injected function that starts it, so the tests answer from a fake. acli keeps one
// current account and takes no site on its work item commands, so the site is bound by reading
// `auth status` first. Every process gets an argument array, every value flag is one
// `--flag=<value>` argument, and every answer is read in the form it was recorded in, after CRLF
// is made LF (s12); an answer in any other form fails the request. No answer is ever a wait.

import { ScriptError } from "../codes.ts";
import type { TrackerConfig } from "../types.ts";
import { isAdfDocument, readMarker } from "./jira-body.ts";
import type { AdfDoc } from "./jira-body.ts";
import { PLAIN_ID } from "./items.ts";
import { isRecord } from "./json.ts";
import type { Link, Provider, RemoteItem, Target } from "./provider.ts";
import type { ProcessResult } from "./spawn.ts";

export type Acli = (args: string[]) => Promise<ProcessResult>;

const PROJECT_KEY = /^[A-Z][A-Z0-9_]*$/;
const DEFAULT_TYPE = "Task";
const EXCERPT_LIMIT = 200;
const AUTH_STATUS = /^✓ Authenticated\n {2}Site: (\S+)\n {2}Email: [^\n]*\n {2}Authentication Type: \S+\n?$/;
const COUNT = /^✓ Number of work items in the search: ([0-9]+)\n?$/;
const NOT_FOUND = "✗ Error: Issue does not exist or you do not have permission to see it.";
const FORM = "in a form the script cannot read";
const INCOMPLETE = "so the listing is not complete: run the command again";

interface Ctx { acli: Acli; host: string; project: string; label: string; type: string; parent?: string }
/** acli's exit status, its stdout and the first line of its stderr, with CRLF made LF (s12). */
interface Answer { status: number | null; stdout: string; firstLine: string }
interface WorkType { name: string; hierarchyLevel: number; subtask: boolean }

/** The two ways a request fails: the tracker is out of reach, or it answered what cannot be used. */
function refusal(code: "TRACKER_UNAVAILABLE" | "TRACKER_REJECTED", message: string): ScriptError {
  return new ScriptError(code, message);
}

/** acli's refusal of a project key it cannot find, the configured key quoted as acli quotes it. */
function noProject(project: string): string {
  return `✗ Error: No project could be found with key '${project}'.`;
}

/** The sign-in command of every message (s9); `<email>` is left for the person to fill. */
function signIn(host: string): string {
  return `acli jira auth login --site ${host} --email <email> --token < token.txt`;
}

function switchTo(host: string): string {
  return `acli jira auth switch --site ${host} --email <email>`;
}

function cut(text: string): string {
  return Array.from(text).slice(0, EXCERPT_LIMIT).join("");
}

/** A short piece of an answer for a message, on one line. */
function excerpt(text: string): string {
  const said = cut(text.replace(/\s+/g, " ").trim());
  return said === "" ? "it said nothing" : said;
}

/** The answer read, or acli's absence; a missing acli is the same failure for every request. */
async function run(ctx: Ctx, args: string[]): Promise<Answer> {
  const result = await ctx.acli(["jira", ...args]);
  if (result.missing) throw refusal("TRACKER_UNAVAILABLE", `acli was not found: install the Atlassian CLI and sign in with ${signIn(ctx.host)}`);
  const lf = (text: string): string => text.replace(/\r\n/g, "\n");
  return { status: result.status, stdout: lf(result.stdout), firstLine: lf(result.stderr).split("\n")[0] };
}

/** A non-zero exit no rule above explains (UJ2). */
function failure(answer: Answer): ScriptError {
  const line = cut(answer.firstLine);
  return refusal("TRACKER_REJECTED", `acli failed: ${line === "" ? "it said nothing" : line}`);
}

/** The stdout of a request that must succeed; any non-zero exit fails it. */
async function succeeded(ctx: Ctx, args: string[]): Promise<string> {
  const answer = await run(ctx, args);
  if (answer.status !== 0) throw failure(answer);
  return answer.stdout;
}

function unreadable(what: string, stdout: string): ScriptError {
  return refusal("TRACKER_REJECTED", `acli answered ${what} ${FORM}: ${excerpt(stdout)}`);
}

function parsed(what: string, stdout: string): unknown {
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    throw unreadable(what, stdout);
  }
}

/** The site acli is signed in to, read from `auth status` in its recorded form (§6 item 1, UJ13). */
async function signedInSite(ctx: Ctx): Promise<string> {
  const answer = await run(ctx, ["auth", "status"]);
  const site = answer.status === 0 ? AUTH_STATUS.exec(answer.stdout)?.[1] : undefined;
  if (site === undefined) throw refusal("TRACKER_UNAVAILABLE", `acli's sign-in answer could not be read, ${FORM}: sign in with ${signIn(ctx.host)}`);
  return site;
}

/** Fails unless acli is signed in to the document's host, compared without regard to case. */
async function checkSite(ctx: Ctx): Promise<void> {
  const site = await signedInSite(ctx);
  if (site.toLowerCase() !== ctx.host.toLowerCase()) throw refusal("TRACKER_UNAVAILABLE", `acli is signed in to ${site}, not ${ctx.host}: run ${switchTo(ctx.host)}`);
}

function isWorkType(value: unknown): value is WorkType {
  return isRecord(value) && typeof value.name === "string" && typeof value.hierarchyLevel === "number" && typeof value.subtask === "boolean";
}

/** The project's work types (§6 item 2): a project acli cannot find is out of reach. */
async function workTypes(ctx: Ctx): Promise<WorkType[]> {
  const answer = await run(ctx, ["project", "view", `--key=${ctx.project}`, "--json"]);
  if (answer.status === 1 && answer.firstLine === noProject(ctx.project)) {
    throw refusal("TRACKER_UNAVAILABLE", `the project ${ctx.project} was not found on ${ctx.host}, or the signed-in account cannot see it there`);
  }
  if (answer.status !== 0) throw failure(answer);
  const project = parsed("the project", answer.stdout);
  const types = isRecord(project) ? project.issueTypes : undefined;
  if (!Array.isArray(types) || !types.every(isWorkType)) throw unreadable("the project", answer.stdout);
  return types;
}

/** The one work type named `ctx.type`, or why no item can be created as it (J11, s6). */
function workTypeOf(ctx: Ctx, types: WorkType[]): WorkType | string {
  const offered = `it offers: ${types.map((t) => t.name).join(", ")}`;
  const named = types.filter((t) => t.name === ctx.type);
  if (named.length === 0) return `the project offers no work type named ${ctx.type}; ${offered}`;
  if (named.length > 1) return `the project offers ${named.length} work types named ${ctx.type}, so the name does not say which; ${offered}`;
  if (named[0].subtask) return `the work type ${ctx.type} is a sub-task, which is not created here; ${offered}`;
  return named[0];
}

/** The parent's key, its project's key and its level, as `view` answered them. */
function parentFields(stdout: string): { key: string; project: string; level: number } {
  const item = parsed("the parent", stdout);
  const fields = isRecord(item) && isRecord(item.fields) ? item.fields : {};
  const project: unknown = isRecord(fields.project) ? fields.project.key : undefined;
  const level: unknown = isRecord(fields.issuetype) ? fields.issuetype.hierarchyLevel : undefined;
  if (!isRecord(item) || typeof item.key !== "string" || typeof project !== "string" || typeof level !== "number") {
    throw unreadable("the parent", stdout);
  }
  return { key: item.key, project, level };
}

/** The parent's key as `view` answered it and why no item can be created under it, if so (UJ10).
 *  The level is checked only against a work type that was found. */
async function parentOf(ctx: Ctx, parent: string, type: WorkType | string): Promise<{ key: string; reason?: string }> {
  const answer = await run(ctx, ["workitem", "view", parent, "--fields=project,issuetype", "--json"]);
  if (answer.status === 1 && answer.firstLine === NOT_FOUND) return { key: parent, reason: `the parent ${parent} was not found` };
  if (answer.status !== 0) throw failure(answer);
  const found = parentFields(answer.stdout);
  if (found.project !== ctx.project) return { key: found.key, reason: `the parent ${found.key} sits in the project ${found.project}, not ${ctx.project}` };
  if (typeof type !== "string" && found.level <= type.hierarchyLevel) {
    return { key: found.key, reason: `the parent ${found.key} is not above the work type ${ctx.type} in the project's hierarchy` };
  }
  return { key: found.key };
}

/** The target (§7). A work type or a parent that cannot take a new item sets `no_create`; it never throws. */
async function describe(ctx: Ctx): Promise<Target> {
  await checkSite(ctx);
  const type = workTypeOf(ctx, await workTypes(ctx));
  const target: Target = { provider: "jira", host: ctx.host, project: ctx.project, label: ctx.label, visibility: "unknown", write_gap_ms: 0, type: ctx.type };
  const parent = ctx.parent === undefined ? undefined : await parentOf(ctx, ctx.parent, type);
  const reason = typeof type === "string" ? type : parent?.reason;
  const withParent = parent === undefined ? target : { ...target, parent: parent.key };
  return reason === undefined ? withParent : { ...withParent, no_create: reason };
}

function jql(ctx: Ctx): string {
  return `--jql=project = "${ctx.project}" AND labels = "${ctx.label}"`;
}

/** The number of marked items, from the count in its recorded form (J15, UJ12). */
async function countOf(ctx: Ctx): Promise<number> {
  const stdout = await succeeded(ctx, ["workitem", "search", jql(ctx), "--count"]);
  const match = COUNT.exec(stdout);
  if (match === null) throw unreadable("the count", stdout);
  return Number(match[1]);
}

/** The entries of the search: one JSON array, or, read as empty, `null` or nothing at all (s13, s14). */
async function entriesOf(ctx: Ctx): Promise<unknown[]> {
  const stdout = await succeeded(ctx, ["workitem", "search", jql(ctx), "--fields=description,labels", "--paginate", "--json"]);
  if (stdout.trim() === "") return [];
  const entries = parsed("the listing", stdout);
  if (entries === null) return [];
  if (!Array.isArray(entries)) throw unreadable("the listing", stdout);
  return entries;
}

/** One entry's id, key and description, each of the shape read (§7). */
function entryOf(entry: unknown): { id: string; key: string; description: AdfDoc | null } {
  const fields: unknown = isRecord(entry) ? entry.fields : undefined;
  const description: unknown = isRecord(fields) && Object.hasOwn(fields, "description") ? fields.description : undefined;
  if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.key !== "string" || !(description === null || isAdfDocument(description))) {
    throw unreadable("an entry of the listing", JSON.stringify(entry) ?? "");
  }
  return { id: entry.id, key: entry.key, description };
}

function linkOf(ctx: Ctx, id: string, key: string): Link {
  return { provider: "jira", id, key, url: `https://${ctx.host}/browse/${key}` };
}

async function listMarked(ctx: Ctx): Promise<RemoteItem[]> {
  const n = await countOf(ctx);
  const seen = new Set<string>();
  const items: RemoteItem[] = [];
  for (const entry of await entriesOf(ctx)) {
    const { id, key, description } = entryOf(entry);
    if (seen.has(id)) throw refusal("TRACKER_UNAVAILABLE", `the listing names the id ${id} (${key}) twice, ${INCOMPLETE}`);
    seen.add(id);
    items.push({ link: linkOf(ctx, id, key), marker: readMarker(description) });
  }
  if (items.length < n) throw refusal("TRACKER_UNAVAILABLE", `the listing holds ${items.length} items where the count was ${n}, ${INCOMPLETE}`);
  return items;
}

function refuseConfig(message: string, field: string): never {
  throw new ScriptError("TRACKER_CONFIG", message, `/meta/tracker/${field}`);
}

/** The Jira provider for a document's tracker configuration. The host, the project and the label
 *  are held to their grammars here, since the last two enter the JQL (§7, s11). */
export function jiraProvider(config: TrackerConfig, acli: Acli, _tempRoot?: string): Provider {
  const { host, project, label } = config;
  if (host === undefined) refuseConfig("a jira target needs host, the site such as example.atlassian.net", "host");
  if (!PROJECT_KEY.test(project)) refuseConfig(`the project must be a Jira project key, such as FAILW, got ${JSON.stringify(project)}`, "project");
  if (!PLAIN_ID.test(label)) refuseConfig(`the label must be a plain id, got ${JSON.stringify(label)}`, "label");
  const ctx: Ctx = { acli, host, project, label, type: config.type ?? DEFAULT_TYPE, ...(config.parent === undefined ? {} : { parent: config.parent }) };
  return {
    describe: () => describe(ctx),
    listMarked: () => listMarked(ctx),
    create: () => Promise.reject(refusal("TRACKER_REJECTED", "creating a Jira item is not built")),
    read: () => Promise.reject(refusal("TRACKER_REJECTED", "reading Jira items is not built")),
  };
}
