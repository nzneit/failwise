import assert from "node:assert/strict";
import { test } from "node:test";
import type { Host, Spawn } from "./lib/host.ts";
import { runBodies } from "./check-bodies.ts";

const ROOT = "/repo";
const USAGE = "usage: node tools/check-bodies.ts --pr | --commits <base>..<head>";

interface Commit {
  sha: string;
  subject: string;
  body: string;
  merge?: boolean;
}

function words(n: number): string {
  return Array.from({ length: n }, () => "word").join(" ");
}

/** A body of exactly n words: the diff link, the headings and their text make 9 of them. */
function body(n: number): string {
  return `Read the diff: https://revision.city/diffs/nzneit/failwise/compare/main...b\n\n## Purpose\n\n${words(n - 9)}\n\n## Verification\n\nnone\n`;
}

function fakeHost(
  options: { commits?: Commit[]; revListStatus?: number; showStatus?: number; calls?: string[][] } = {},
): Host {
  const spawn: Spawn = (_command, args) => {
    options.calls?.push(args);
    if (args[0] === "rev-list") {
      const status = options.revListStatus ?? 0;
      return { status, stdout: status === 0 ? (options.commits ?? []).filter((commit) => !commit.merge).map((commit) => commit.sha).join("\n") : "" };
    }
    const sha = args.at(-1) ?? "";
    const commit = (options.commits ?? []).find((each) => each.sha === sha);
    const status = options.showStatus ?? (commit ? 0 : 128);
    return { status, stdout: commit ? `${commit.subject}\0${commit.body}` : "" };
  };
  return {
    execPath: "/opt/node/bin/node",
    isNode: true,
    env: { PATH: "/usr/bin:/bin" },
    exists: () => true,
    listDir: () => [],
    listEntries: () => [],
    spawn,
    home: "/home/u",
  };
}

function runPr(
  env: Record<string, string | undefined>,
  host = fakeHost(),
): { status: number; lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  const status = runBodies(ROOT, ["--pr"], env, host, (line) => lines.push(line), (line) => errors.push(line));
  return { status, lines, errors };
}

function runCommits(
  range: string,
  host = fakeHost(),
  argv: string[] = ["--commits", range],
): { status: number; lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  const status = runBodies(ROOT, argv, {}, host, (line) => lines.push(line), (line) => errors.push(line));
  return { status, lines, errors };
}

test("a conforming pull request passes", () => {
  const result = runPr({ PR_BODY: body(120), PR_TITLE: "Reduce the public surface" });
  assert.equal(result.status, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.lines, ["## bodies: the pull request body is 120 words and its title 25 characters"]);
});

test("a 351-word body fails on the 350-word cap", () => {
  const result = runPr({ PR_BODY: body(351), PR_TITLE: "Title" });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error BODIES: the pull request body is 351 words, above the cap of 350"]);
});

test("a body without the diff link first fails", () => {
  const result = runPr({ PR_BODY: "## Purpose\n\nx\n\n## Verification\n\nx\n", PR_TITLE: "Title" });
  assert.equal(result.status, 1);
  assert.ok(result.errors.some((line) => line.includes("Read the diff")), result.errors.join("\n"));
});

test("a body without ## Purpose fails", () => {
  const result = runPr({ PR_BODY: "Read the diff: https://revision.city/x\n\n## Verification\n\nx\n", PR_TITLE: "Title" });
  assert.equal(result.status, 1);
  assert.ok(result.errors.includes("error BODIES: the pull request body has no ## Purpose heading"));
});

test("a body without ## Verification fails", () => {
  const result = runPr({ PR_BODY: "Read the diff: https://revision.city/x\n\n## Purpose\n\nx\n", PR_TITLE: "Title" });
  assert.equal(result.status, 1);
  assert.ok(result.errors.includes("error BODIES: the pull request body has no ## Verification heading"));
});

test("a 101-character title fails", () => {
  const result = runPr({ PR_BODY: body(10), PR_TITLE: "t".repeat(101) });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error BODIES: the pull request title is 101 characters, above the cap of 100"]);
});

test("an absent body is exit 3, never a pass", () => {
  const result = runPr({ PR_TITLE: "Title" });
  assert.equal(result.status, 3);
  assert.deepEqual(result.errors, ["error IO_READ: PR_BODY is absent or empty"]);
});

test("an empty body is exit 3", () => {
  const result = runPr({ PR_BODY: "", PR_TITLE: "Title" });
  assert.equal(result.status, 3);
  assert.deepEqual(result.errors, ["error IO_READ: PR_BODY is absent or empty"]);
});

test("the pull request reads the body and title only through env", () => {
  const calls: string[][] = [];
  const result = runPr({ PR_BODY: body(10), PR_TITLE: "Title" }, fakeHost({ calls }));
  assert.equal(result.status, 0);
  assert.deepEqual(calls, []);
});

test("a 201-word commit body fails, naming the short sha and the cap", () => {
  const sha = "a".repeat(40);
  const result = runCommits("main..head", fakeHost({ commits: [{ sha, subject: "Subject", body: words(201) }] }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, [`error BODIES: ${sha.slice(0, 7)} has a 201-word body, above the cap of 200`]);
});

test("a 101-character commit subject fails, naming the short sha and the cap", () => {
  const sha = "b".repeat(40);
  const result = runCommits("main..head", fakeHost({ commits: [{ sha, subject: "s".repeat(101), body: words(10) }] }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, [`error BODIES: ${sha.slice(0, 7)} has a 101-character subject, above the cap of 100`]);
});

test("a merge commit is skipped", () => {
  const result = runCommits(
    "main..head",
    fakeHost({
      commits: [
        { sha: "c".repeat(40), subject: "Merge", body: words(500), merge: true },
        { sha: "d".repeat(40), subject: "Ordinary", body: words(20) },
      ],
    }),
  );
  assert.equal(result.status, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.lines, ["## bodies: 1 commits within their limits"]);
});

test("a squash landing takes the 350-word body cap", () => {
  const sha = "e".repeat(40);
  const result = runCommits("main..head", fakeHost({ commits: [{ sha, subject: "Title (#31)", body: words(300) }] }));
  assert.equal(result.status, 0);
});

test("a direct push with the same body fails the 200-word cap", () => {
  const sha = "f".repeat(40);
  const result = runCommits("main..head", fakeHost({ commits: [{ sha, subject: "Title", body: words(300) }] }));
  assert.equal(result.status, 1);
  assert.ok(result.errors[0]?.includes("200-word cap") || result.errors[0]?.includes("cap of 200"), result.errors[0]);
});

test("a squash title is measured without its suffix", () => {
  const sha = "0".repeat(40);
  const result = runCommits("main..head", fakeHost({ commits: [{ sha, subject: `${"t".repeat(100)} (#31)`, body: words(10) }] }));
  assert.equal(result.status, 0);
});

test("an unreadable range is exit 3", () => {
  const result = runCommits("missing..head", fakeHost({ revListStatus: 128 }));
  assert.equal(result.status, 3);
  assert.deepEqual(result.errors, ["error IO_READ: git rev-list could not read missing..head"]);
});

test("usage: no arguments, both modes, and a missing value", () => {
  for (const argv of [[], ["--pr", "--commits", "a..b"], ["--commits"]]) {
    const lines: string[] = [];
    const errors: string[] = [];
    const status = runBodies(ROOT, argv, {}, fakeHost(), (line) => lines.push(line), (line) => errors.push(line));
    assert.equal(status, 1, argv.join(" "));
    assert.deepEqual(errors, [`error USAGE: ${USAGE}`], argv.join(" "));
  }
});
