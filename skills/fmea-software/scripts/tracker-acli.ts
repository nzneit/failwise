// A fake acli for the tests of the Jira adapter, and acli's answers in the forms recorded on
// 2026-10-07 (acli 1.3.39-stable): no process, no network. The site and the account's email are
// replaced by reserved names (UJ24); project keys, item keys and ids stay as recorded.

import { readFileSync } from "node:fs";
import type { Acli } from "./lib/tracker/jira.ts";
import type { ProcessResult } from "./lib/tracker/spawn.ts";
import type { TrackerConfig } from "./lib/types.ts";

export const HOST = "jira.example.com";
export const EMAIL = "someone@example.com";
export const jiraConfig: TrackerConfig = { provider: "jira", host: HOST, project: "FAILW", label: "failwise" };

/** The not-found line of `workitem view`, which has no variable part. */
export const NOT_FOUND = "✗ Error: Issue does not exist or you do not have permission to see it.";

const INTERNAL = "https://jira-prod-us-99-5.prod.atl-paas.net/rest/api/3";

/** Exit 0 with `stdout`; an object is printed as JSON. */
export function ok(stdout: string | object): ProcessResult {
  return { status: 0, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "", missing: false };
}

/** Exit 1 with one line on stderr and nothing on stdout, as every recorded failure. */
export function failed(stderr: string): ProcessResult {
  return { status: 1, stdout: "", stderr: `${stderr}\n`, missing: false };
}

export const MISSING: ProcessResult = { status: null, stdout: "", stderr: "", missing: true };

/** `auth status` as recorded, with the reserved site and email. */
export function authStatus(site = HOST, type = "api_token"): ProcessResult {
  return ok(`✓ Authenticated\n  Site: ${site}\n  Email: ${EMAIL}\n  Authentication Type: ${type}\n`);
}

const issueType = (id: string, name: string, hierarchyLevel: number, subtask = false): object => ({
  avatarId: 10307, entityId: null, hierarchyLevel, id, name, scope: null, self: `${INTERNAL}/issuetype/${id}`, subtask,
});

/** The work types of the recorded team-managed project FAILW. */
export const FAILW_TYPES: object[] = [
  issueType("10005", "Epic", 1),
  issueType("10006", "Subtask", -1, true),
  issueType("10007", "Task", 0),
  issueType("10008", "Story", 0),
];

/** `project view --key=<key> --json`, with the keys the adapter reads and a few recorded others. */
export function project(key = "FAILW", issueTypes: object[] = FAILW_TYPES): ProcessResult {
  return ok({ id: "10001", key, name: "Failwise", projectTypeKey: "software", self: `${INTERNAL}/project/10001`, simplified: true, style: "next-gen", issueTypes });
}

/** A work item in the recorded top-level shape. */
export function workItem(key: string, id: string, fields: object): object {
  return { id, key, self: `${INTERNAL}/issue/${id}`, fields };
}

/** The `view` of an Epic of the project FAILW, with the fields describe asks for. */
export function epic(key = "FAILW-4", id = "10004"): ProcessResult {
  return ok(workItem(key, id, { project: { id: "10001", key: "FAILW", name: "Failwise" }, issuetype: { id: "10005", name: "Epic", hierarchyLevel: 1, subtask: false } }));
}

/** The recorded answer of `search --count`. */
export function count(n: number): ProcessResult {
  return ok(`✓ Number of work items in the search: ${n}\n`);
}

const DESCRIPTION_FILE = "--description-file=";

/** An acli that records each call and answers from the queue, in order. A call that names a
 *  description file has the file read into `files` before it is answered (s2). */
export function fakeAcli(answers: ProcessResult[]): { acli: Acli; calls: string[][]; files: string[] } {
  const queue = [...answers];
  const calls: string[][] = [];
  const files: string[] = [];
  const acli: Acli = async (args) => {
    calls.push(args);
    const file = args.find((a) => a.startsWith(DESCRIPTION_FILE));
    if (file !== undefined) files.push(readFileSync(file.slice(DESCRIPTION_FILE.length), "utf8"));
    const next = queue.shift();
    if (next === undefined) throw new Error(`acli was called once more than the test expected: ${args.join(" ")}`);
    return next;
  };
  return { acli, calls, files };
}
