// The Jira adapter (§6, §7): the four methods of the seam over Atlassian's command-line tool, acli,
// through an injected function that starts it, so the tests answer from a fake. acli keeps one
// current account and takes no site on its work item commands, so the site is bound by reading
// `auth status` first. Every process gets an argument array, every value flag is one
// `--flag=<value>` argument, and every answer is read in the form it was recorded in, after CRLF
// is made LF (s12); an answer in any other form fails the request. No answer is ever a wait.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScriptError } from "../codes.ts";
import type { ObservedState, TrackerConfig } from "../types.ts";
import { isAdfDocument, readMarker, renderDescription, renderSummary } from "./jira-body.ts";
import type { AdfDoc } from "./jira-body.ts";
import { PLAIN_ID } from "./items.ts";
import { isRecord } from "./json.ts";
import type { Json } from "./json.ts";
import { CreatedWithFault } from "./provider.ts";
import type { Link, Observation, Provider, RemoteItem, Target, TrackedItem } from "./provider.ts";
import type { ProcessResult } from "./spawn.ts";

export type Acli = (args: string[]) => Promise<ProcessResult>;

const PROJECT_KEY = /^[A-Z][A-Z0-9_]*$/;
/** The grammars under which a stored link is read (§5.2): a numeric id with no leading zero, since
 *  Jira never answers one and a stored id with one is a hand edit, and a work item key. */
const ITEM_ID = /^[1-9][0-9]*$/;
const ITEM_KEY = /^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/;
/** A resolution date as Jira writes one: a date, a time and an offset or Z (R3). */
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:?[0-9]{2})$/;
const CATEGORIES = new Set(["new", "indeterminate", "done", "undefined"]);
const VIEW_FIELDS = "--fields=status,resolution,resolutiondate,description";
const DEFAULT_TYPE = "Task";
const EXCERPT_LIMIT = 200;
const AUTH_STATUS = /^✓ Authenticated\n {2}Site: (\S+)\n {2}Email: [^\n]*\n {2}Authentication Type: \S+\n?$/;
const COUNT = /^✓ Number of work items in the search: ([0-9]+)\n?$/;
const NOT_FOUND = "✗ Error: Issue does not exist or you do not have permission to see it.";
const FORM = "in a form the script cannot read";
const INCOMPLETE = "so the listing is not complete: run the command again";

/** The status names that map a closed item to done and to dropped (§8, J16). */
interface Lists { done: string[]; dropped: string[] }
interface Ctx { acli: Acli; host: string; project: string; label: string; type: string; parent?: string; tempRoot: string; lists: Lists }
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

/** The JSON of an answer, or undefined when it is not JSON. */
function jsonOf(stdout: string): unknown {
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    return undefined;
  }
}

function parsed(what: string, stdout: string): unknown {
  const value = jsonOf(stdout);
  if (value === undefined) throw unreadable(what, stdout);
  return value;
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

/** The project's work types (§6 item 2): a project acli cannot find is out of reach, and a key
 *  that resolves to a project now under another key, as an old key does after a re-key, is refused. */
async function workTypes(ctx: Ctx): Promise<WorkType[]> {
  const answer = await run(ctx, ["project", "view", `--key=${ctx.project}`, "--json"]);
  if (answer.status === 1 && answer.firstLine === noProject(ctx.project)) {
    throw refusal("TRACKER_UNAVAILABLE", `the project ${ctx.project} was not found on ${ctx.host}, or the signed-in account cannot see it there`);
  }
  if (answer.status !== 0) throw failure(answer);
  const project = parsed("the project", answer.stdout);
  const types = isRecord(project) ? project.issueTypes : undefined;
  if (!isRecord(project) || typeof project.key !== "string" || !Array.isArray(types) || !types.every(isWorkType)) throw unreadable("the project", answer.stdout);
  if (project.key !== ctx.project) refuseConfig(`the project key ${ctx.project} now names the project ${project.key} on ${ctx.host}: set the project to ${project.key}`, "project");
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
 *  A parent answered under another key, as an old key is after a re-key, keeps the configured key
 *  and cannot take a new item, since create sends the configured key (R5). The level is checked
 *  only against a work type that was found. */
async function parentOf(ctx: Ctx, parent: string, type: WorkType | string): Promise<{ key: string; reason?: string }> {
  const answer = await run(ctx, ["workitem", "view", parent, "--fields=project,issuetype", "--json"]);
  if (answer.status === 1 && answer.firstLine === NOT_FOUND) return { key: parent, reason: `the parent ${parent} was not found` };
  if (answer.status !== 0) throw failure(answer);
  const found = parentFields(answer.stdout);
  if (found.key !== parent) return { key: parent, reason: `the parent ${parent} is now keyed ${found.key} on ${ctx.host}: set the parent to ${found.key}` };
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

/** An id and a key under the grammars a stored link is read by (§5.2). */
function isLinkable(id: unknown, key: unknown): boolean {
  return typeof id === "string" && ITEM_ID.test(id) && typeof key === "string" && ITEM_KEY.test(key);
}

/** The description of `fields`, null or an ADF document, or undefined when it is neither or absent. */
function descriptionOf(fields: unknown): AdfDoc | null | undefined {
  const description: unknown = isRecord(fields) && Object.hasOwn(fields, "description") ? fields.description : undefined;
  return description === null || isAdfDocument(description) ? description : undefined;
}

/** One entry's id, key and description, each of the shape read (§7); an id or key outside its
 *  grammar fails the listing, since an adopt must never store a link that cannot be read back. */
function entryOf(entry: unknown): { id: string; key: string; description: AdfDoc | null } {
  const description = isRecord(entry) ? descriptionOf(entry.fields) : undefined;
  if (!isRecord(entry) || !isLinkable(entry.id, entry.key) || description === undefined) {
    throw unreadable("an entry of the listing", JSON.stringify(entry) ?? "");
  }
  return { id: String(entry.id), key: String(entry.key), description };
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

/** The description file acli reads, written in a fresh directory under `tempRoot` that is removed
 *  once `use` has finished, whatever its outcome; a failed removal is ignored (§7). */
async function withDescriptionFile<T>(ctx: Ctx, item: TrackedItem, use: (path: string) => Promise<T>): Promise<T> {
  const cannotWrite = (err: unknown): ScriptError => new ScriptError("IO_WRITE", `cannot write the description file: ${err instanceof Error ? err.message : String(err)}`);
  const dir = await mkdtemp(join(ctx.tempRoot, "failwise-jira-")).catch((err: unknown) => {
    throw cannotWrite(err);
  });
  try {
    const path = join(dir, "description.json");
    await writeFile(path, JSON.stringify(renderDescription(item))).catch((err: unknown) => {
      throw cannotWrite(err);
    });
    return await use(path);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function createArgs(ctx: Ctx, item: TrackedItem, path: string): string[] {
  const parent = ctx.parent === undefined ? [] : [`--parent=${ctx.parent}`];
  return ["workitem", "create", `--project=${ctx.project}`, `--type=${ctx.type}`, `--summary=${renderSummary(item.content)}`, `--label=${ctx.label}`, ...parent, `--description-file=${path}`, "--json"];
}

/** The link and the fields of the created item; an answer without a numeric id and a key of the
 *  project is refused, and the item may still exist, so the listing adopts it later. */
function createdItem(ctx: Ctx, stdout: string): { link: Link; fields: Json } {
  const item = jsonOf(stdout);
  const ofProject = new RegExp(`^${ctx.project}-[1-9][0-9]*$`);
  if (!isRecord(item) || !isLinkable(item.id, item.key) || !ofProject.test(String(item.key))) {
    throw refusal("TRACKER_REJECTED", `acli answered the create ${FORM}: ${excerpt(stdout)}; the item may exist: run plan, which adopts it once the listing shows it`);
  }
  return { link: linkOf(ctx, String(item.id), String(item.key)), fields: isRecord(item.fields) ? item.fields : {} };
}

/** What the created item lacks of the label or the parent, as a message, or undefined. */
function createFault(ctx: Ctx, key: string, fields: Json): string | undefined {
  const label = ctx.label.toLowerCase();
  const labelled = Array.isArray(fields.labels) && fields.labels.some((l) => typeof l === "string" && l.toLowerCase() === label);
  if (!labelled) return `${key} was created without the label ${ctx.label}, which finding it again depends on; add the label to it by hand`;
  const parent: unknown = isRecord(fields.parent) ? fields.parent.key : undefined;
  if (ctx.parent !== undefined && parent !== ctx.parent) {
    return `${key} was created without the parent ${ctx.parent}; add the parent to it by hand`;
  }
  return undefined;
}

/** One work item (§7): the site is checked before every write, and the description goes through a file. */
async function create(ctx: Ctx, item: TrackedItem): Promise<Link> {
  await checkSite(ctx);
  const stdout = await withDescriptionFile(ctx, item, (path) => succeeded(ctx, createArgs(ctx, item, path)));
  const { link, fields } = createdItem(ctx, stdout);
  const fault = createFault(ctx, link.key, fields);
  if (fault !== undefined) throw new CreatedWithFault(link, fault);
  return link;
}

/** The host of a URL, lower-cased, or undefined when it is not a URL. */
function hostOf(url: string): string | undefined {
  return URL.canParse(url) ? new URL(url).host.toLowerCase() : undefined;
}

/** Every link is a Jira link on the document's host under the grammars of §5.2, before any request. */
function checkLinks(ctx: Ctx, links: Link[]): void {
  const host = ctx.host.toLowerCase();
  for (const link of links) {
    if (link.provider !== "jira" || !isLinkable(link.id, link.key) || hostOf(link.url) !== host) {
      throw refusal("TRACKER_REJECTED", `the link ${link.key} at ${link.url} is not a Jira work item on ${ctx.host} that this script can read`);
    }
  }
}

/** The status name and its category's key, or undefined when either is not of the shape read. */
function statusOf(fields: Json): { name: string; category: string } | undefined {
  const status = fields.status;
  const category: unknown = isRecord(status) && isRecord(status.statusCategory) ? status.statusCategory.key : undefined;
  if (!isRecord(status) || typeof status.name !== "string" || typeof category !== "string" || !CATEGORIES.has(category)) return undefined;
  return { name: status.name, category };
}

/** The resolution's name, null when there is none, or undefined when it is not of the shape read. */
function resolutionOf(fields: Json): string | null | undefined {
  const { resolution } = fields;
  if (resolution === null) return null;
  return isRecord(resolution) && typeof resolution.name === "string" ? resolution.name : undefined;
}

/** The UTC date of the resolution date (s5), null when there is none, or undefined when it is not a
 *  timestamp of the recorded form or Node cannot parse it (R3). */
function resolvedOn(fields: Json): string | null | undefined {
  const { resolutiondate } = fields;
  if (resolutiondate === null || resolutiondate === undefined) return null;
  const time = typeof resolutiondate === "string" && TIMESTAMP.test(resolutiondate) ? new Date(resolutiondate) : undefined;
  const date = time === undefined || Number.isNaN(time.getTime()) ? "" : time.toISOString().slice(0, 10);
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) ? date : undefined;
}

/** The neutral state of a status category and the names an item carries (§8, J16). */
function mapped(category: string, names: string[], lists: Lists): ObservedState {
  if (category !== "done") return "open";
  if (names.some((name) => lists.dropped.includes(name))) return "dropped";
  if (names.some((name) => lists.done.includes(name))) return "done";
  return "closed";
}

/** The state, the detail (s4) and, on a closed item, the closing date (s5) of a view's fields. */
function stateOf(fields: Json, lists: Lists): { state: ObservedState; detail: string; closed_date?: string } {
  const status = statusOf(fields);
  const resolution = resolutionOf(fields);
  const date = resolvedOn(fields);
  if (status === undefined || resolution === undefined || date === undefined) throw unreadable("the view", JSON.stringify(fields));
  const state = mapped(status.category, resolution === null ? [status.name] : [status.name, resolution], lists);
  const detail = resolution === null ? status.name : `${status.name}, resolution ${resolution}`;
  return state === "open" || date === null ? { state, detail } : { state, detail, closed_date: date };
}

/** The answered key, the fields and the description of a view of the item `id`, each of the shape
 *  read. The key is held to the work item key grammar: the observation's link is stored, and the
 *  next read refuses a stored key outside it before any request (R2). An answer for another id is
 *  not of the shape read (R4). */
function viewOf(stdout: string, id: string): { key: string; fields: Json; description: AdfDoc | null } {
  const item = jsonOf(stdout);
  const fields: unknown = isRecord(item) ? item.fields : undefined;
  const description = descriptionOf(fields);
  if (!isRecord(item) || item.id !== id || typeof item.key !== "string" || !ITEM_KEY.test(item.key) || !isRecord(fields) || description === undefined) {
    throw unreadable("the view", stdout);
  }
  return { key: item.key, fields, description };
}

/** One linked item by its id; its key and URL in the observation are where it is now (§8). */
async function observe(ctx: Ctx, link: Link): Promise<Observation> {
  const answer = await run(ctx, ["workitem", "view", link.id, VIEW_FIELDS, "--json"]);
  if (answer.status === 1 && answer.firstLine === NOT_FOUND) return { link, state: "unreachable", detail: "not found" };
  if (answer.status !== 0) throw failure(answer);
  const { key, fields, description } = viewOf(answer.stdout, link.id);
  return { link: linkOf(ctx, link.id, key), ...stateOf(fields, ctx.lists), marker: readMarker(description)?.key ?? null };
}

async function read(ctx: Ctx, links: Link[]): Promise<Observation[]> {
  checkLinks(ctx, links);
  const observations: Observation[] = [];
  for (const link of links) observations.push(await observe(ctx, link));
  return observations;
}

function refuseConfig(message: string, field: string): never {
  throw new ScriptError("TRACKER_CONFIG", message, `/meta/tracker/${field}`);
}

/** The Jira provider for a document's tracker configuration. The host, the project and the label
 *  are held to their grammars here, since the last two enter the JQL (§7, s11). */
export function jiraProvider(config: TrackerConfig, acli: Acli, tempRoot: string = tmpdir()): Provider {
  const { host, project, label } = config;
  if (host === undefined) refuseConfig("a jira target needs host, the site such as example.atlassian.net", "host");
  if (!PROJECT_KEY.test(project)) refuseConfig(`the project must be a Jira project key, such as PROJ, got ${JSON.stringify(project)}`, "project");
  if (!PLAIN_ID.test(label)) refuseConfig(`the label must be a plain id, got ${JSON.stringify(label)}`, "label");
  const lists: Lists = { done: config.states?.done ?? ["Done"], dropped: config.states?.dropped ?? ["Won't Do"] };
  const parent = config.parent === undefined ? {} : { parent: config.parent };
  const ctx: Ctx = { acli, host, project, label, type: config.type ?? DEFAULT_TYPE, ...parent, tempRoot, lists };
  return {
    describe: () => describe(ctx),
    listMarked: () => listMarked(ctx),
    create: (item) => create(ctx, item),
    read: (links) => read(ctx, links),
  };
}
