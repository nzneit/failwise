// Enforces the pull request and commit limits (design section S9, S10 and 8.2).
//
//   node tools/check-bodies.ts --pr                    # reads PR_BODY and PR_TITLE from the environment
//   node tools/check-bodies.ts --commits <base>..<head> # every non-merge commit in the range
//
// A pull request body is at most 350 words, opens with a Revision City diff link, and carries
// `## Purpose` and `## Verification`. A title is at most 100 characters.
// A commit body is at most 200 words and its subject at most 100 characters. A squash landing
// whose subject carries a ` (#N)` suffix is exempt from the 200-word body limit, because the
// pull request limit governs it; its title is measured without the suffix.
// The body and title arrive only through the environment, never through argv, because a fork's
// pull request body is attacker-controlled.
// Exit 1 on a violation or a usage error, 3 when the body is absent or git cannot be read.
import process from "node:process";
import { isEntry } from "./lib/entry.ts";
import { defaultHost, type Host } from "./lib/host.ts";
import { countWords } from "./lib/measure.ts";

const PR_BODY_CAP = 350;
const COMMIT_BODY_CAP = 200;
const TITLE_CAP = 100;
const DIFF_PREFIX = "Read the diff: https://revision.city/";
const USAGE = "usage: node tools/check-bodies.ts --pr | --commits <base>..<head>";
const SQUASH = /^(.*) \(#\d+\)$/u;

interface Commit {
  sha: string;
  subject: string;
  body: string;
}

function lengthInCodePoints(text: string): number {
  return Array.from(text).length;
}

function commitLines({ sha, subject, body }: Commit): string[] {
  const short = sha.slice(0, 7);
  const squash = SQUASH.exec(subject);
  const title = squash ? (squash[1] ?? subject) : subject;
  const bodyCap = squash ? PR_BODY_CAP : COMMIT_BODY_CAP;
  const errors: string[] = [];
  const words = countWords(body);
  if (words > bodyCap) {
    errors.push(`error BODIES: ${short} has a ${words}-word body, above the cap of ${bodyCap}`);
  }
  const characters = lengthInCodePoints(title);
  if (characters > TITLE_CAP) {
    const noun = squash ? "title" : "subject";
    errors.push(`error BODIES: ${short} has a ${characters}-character ${noun}, above the cap of ${TITLE_CAP}`);
  }
  return errors;
}

function checkPullRequest(
  env: Record<string, string | undefined>,
  write: (line: string) => void,
  fail: (line: string) => void,
): number {
  const body = env.PR_BODY;
  if (body === undefined || body.trim() === "") {
    fail("error IO_READ: PR_BODY is absent or empty");
    return 3;
  }
  const title = env.PR_TITLE ?? "";
  const words = countWords(body);
  const characters = lengthInCodePoints(title);
  const lines = body.split("\n").map((line) => line.trim());
  const errors: string[] = [];
  if (words > PR_BODY_CAP) {
    errors.push(`error BODIES: the pull request body is ${words} words, above the cap of ${PR_BODY_CAP}`);
  }
  if (!(lines[0] ?? "").startsWith(DIFF_PREFIX)) {
    errors.push(`error BODIES: the pull request body's first line does not start "${DIFF_PREFIX}"`);
  }
  if (!lines.includes("## Purpose")) {
    errors.push("error BODIES: the pull request body has no ## Purpose heading");
  }
  if (!lines.includes("## Verification")) {
    errors.push("error BODIES: the pull request body has no ## Verification heading");
  }
  if (characters > TITLE_CAP) {
    errors.push(`error BODIES: the pull request title is ${characters} characters, above the cap of ${TITLE_CAP}`);
  }
  if (errors.length > 0) {
    for (const line of errors) fail(line);
    return 1;
  }
  write(`## bodies: the pull request body is ${words} words and its title ${characters} characters`);
  return 0;
}

function readCommits(root: string, range: string, host: Host, fail: (line: string) => void): Commit[] | null {
  const listed = host.spawn("git", ["rev-list", "--no-merges", range], { cwd: root, stdio: "pipe" });
  if (listed.status !== 0 || typeof listed.stdout !== "string") {
    fail(`error IO_READ: git rev-list could not read ${range}`);
    return null;
  }
  const shas = listed.stdout.split(/\s+/u).filter((sha) => sha !== "");
  const commits: Commit[] = [];
  for (const sha of shas) {
    const shown = host.spawn("git", ["show", "-s", "--format=%s%x00%b", sha], { cwd: root, stdio: "pipe" });
    if (shown.status !== 0 || typeof shown.stdout !== "string") {
      fail(`error IO_READ: git show could not read ${sha}`);
      return null;
    }
    const separator = shown.stdout.indexOf("\0");
    const subject = separator === -1 ? shown.stdout.trimEnd() : shown.stdout.slice(0, separator);
    const body = separator === -1 ? "" : shown.stdout.slice(separator + 1);
    commits.push({ sha, subject, body });
  }
  return commits;
}

function checkCommits(
  root: string,
  range: string,
  host: Host,
  write: (line: string) => void,
  fail: (line: string) => void,
): number {
  const commits = readCommits(root, range, host, fail);
  if (commits === null) return 3;
  const errors = commits.flatMap(commitLines);
  if (errors.length > 0) {
    for (const line of errors) fail(line);
    return 1;
  }
  write(`## bodies: ${commits.length} commits within their limits`);
  return 0;
}

export function runBodies(
  root: string,
  argv: string[],
  env: Record<string, string | undefined>,
  host: Host,
  write: (line: string) => void = (line) => void process.stdout.write(line + "\n"),
  writeError: (line: string) => void = (line) => void process.stderr.write(line + "\n"),
): number {
  const fail = (line: string): void => {
    writeError(line);
  };
  if (argv.length === 1 && argv[0] === "--pr") return checkPullRequest(env, write, fail);
  const range = argv[1];
  if (argv.length === 2 && argv[0] === "--commits" && range !== undefined && range !== "") {
    return checkCommits(root, range, host, write, fail);
  }
  fail(`error USAGE: ${USAGE}`);
  return 1;
}

function main(args: string[]): number {
  return runBodies(process.cwd(), args, process.env, defaultHost());
}

if (isEntry(import.meta)) {
  process.exit(main(process.argv.slice(2)));
}
