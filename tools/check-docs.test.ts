import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import type { Host, Spawn } from "./lib/host.ts";
import { ALLOWLIST, BASELINE_PATH, checkDocs, type DocsHost } from "./check-docs.ts";

const ROOT = "/repo";
const SEED = {
  files: {
    ".claude/CLAUDE.md": { words: 700 },
    "CONTRIBUTING.md": { words: 1000 },
    "README.md": { words: 1200 },
    "docs/design.md": { lines: 450, words: 3200 },
    "docs/scripts.md": { lines: 40, words: 900 },
    "docs/style.md": { lines: 60, words: 1000 },
    "docs/tracking.md": { lines: 70, words: 700 },
  },
  totalLines: 660,
  totalWords: 8700,
};

function words(n: number): string {
  return Array.from({ length: n }, () => "word").join(" ") + "\n";
}

function lines(n: number): string {
  return "word\n".repeat(n);
}

/** The seven allowlisted files, one word and one line each. */
function cleanFiles(): Record<string, string> {
  return Object.fromEntries(ALLOWLIST.map((path) => [path, "word\n"]));
}

interface Written {
  path: string;
  text: string;
}

function fakeHost(
  options: {
    tracked?: string[];
    files?: Record<string, string>;
    baseline?: unknown;
    baselineText?: string | null;
    gitStatus?: number;
    calls?: string[][];
  } = {},
): DocsHost & { written: Written[] } {
  const written: Written[] = [];
  const files = options.files ?? cleanFiles();
  const tracked = options.tracked ?? [...ALLOWLIST];
  const baselineText =
    options.baselineText !== undefined
      ? options.baselineText
      : options.baseline === null
        ? null
        : JSON.stringify(options.baseline ?? SEED);
  const spawn: Spawn = (_command, args) => {
    options.calls?.push(args);
    if (args[0] === "ls-files") {
      const status = options.gitStatus ?? 0;
      return { status, stdout: status === 0 ? tracked.join("\0") + "\0" : "" };
    }
    return { status: 0, stdout: "" };
  };
  const host: Host = {
    execPath: "/opt/node/bin/node",
    isNode: true,
    env: { PATH: "/usr/bin:/bin" },
    exists: () => true,
    listDir: () => [],
    listEntries: () => [],
    spawn,
    home: "/home/u",
  };
  return {
    ...host,
    written,
    readFile: (path) => {
      if (path === join(ROOT, BASELINE_PATH)) return baselineText;
      const relative = path.startsWith(ROOT + "/") ? path.slice(ROOT.length + 1) : path;
      return files[relative] ?? null;
    },
    writeFile: (path, text) => {
      written.push({ path, text });
      return true;
    },
  };
}

function run(
  host: DocsHost,
  writeBaseline = false,
): { status: number; lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  const status = checkDocs(ROOT, host, (line) => lines.push(line), (line) => errors.push(line), writeBaseline);
  return { status, lines, errors };
}

test("seven allowlisted files within caps: exit 0 and one summary line", () => {
  const result = run(fakeHost());
  assert.equal(result.status, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.lines, ["## docs: 7 files, 7 words, 4 lines in docs/"]);
});

test("an unlisted Markdown file outside skills/ fails and names the path", () => {
  const result = run(fakeHost({ tracked: [...ALLOWLIST, "notes.md"], files: { ...cleanFiles(), "notes.md": "word\n" } }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error DOCS: notes.md is tracked and not on the allowlist"]);
});

test("an allowlisted file that is not tracked fails", () => {
  const result = run(fakeHost({ tracked: ALLOWLIST.filter((path) => path !== "README.md") }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error DOCS: README.md is on the allowlist and is not tracked"]);
});

test("a file over its word cap reports the measurement and the cap", () => {
  const result = run(fakeHost({ files: { ...cleanFiles(), "docs/design.md": words(3201) } }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error DOCS: docs/design.md is 3201 words, above its cap of 3200"]);
});

test("a file over its line cap reports the measurement and the cap", () => {
  const result = run(fakeHost({ files: { ...cleanFiles(), "docs/design.md": lines(451) } }));
  assert.equal(result.status, 1);
  assert.ok(result.errors.includes("error DOCS: docs/design.md is 451 lines, above its cap of 450"));
});

test("the total over its word budget fails", () => {
  const baseline = { ...SEED, totalWords: 8600 };
  const files = {
    ".claude/CLAUDE.md": words(700),
    "CONTRIBUTING.md": words(1000),
    "README.md": words(1200),
    "docs/design.md": words(3200),
    "docs/scripts.md": words(900),
    "docs/style.md": words(1000),
    "docs/tracking.md": words(700),
  };
  const result = run(fakeHost({ files, baseline }));
  assert.equal(result.status, 1);
  assert.ok(result.errors.includes("error DOCS: total words 8700, above the budget of 8600"));
});

test("the total over its line budget fails", () => {
  const baseline = { ...SEED, totalLines: 500 };
  const files = {
    ...cleanFiles(),
    "docs/design.md": lines(450),
    "docs/scripts.md": lines(40),
    "docs/style.md": lines(60),
    "docs/tracking.md": lines(70),
  };
  const result = run(fakeHost({ files, baseline }));
  assert.equal(result.status, 1);
  assert.ok(result.errors.includes("error DOCS: total lines 620, above the budget of 500"));
});

test("a docs/ subdirectory fails", () => {
  const result = run(
    fakeHost({ tracked: [...ALLOWLIST, "docs/notes/a.md"], files: { ...cleanFiles(), "docs/notes/a.md": "word\n" } }),
  );
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error DOCS: docs/notes/a.md is under a subdirectory of docs/"]);
});

test("a dated docs/ basename fails", () => {
  const result = run(
    fakeHost({ tracked: [...ALLOWLIST, "docs/2026-10-19-design.md"], files: { ...cleanFiles(), "docs/2026-10-19-design.md": "word\n" } }),
  );
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error DOCS: docs/2026-10-19-design.md carries a date"]);
});

test("a docs/ path carrying a banned word fails", () => {
  const result = run(fakeHost({ tracked: [...ALLOWLIST, "docs/plans.md"], files: { ...cleanFiles(), "docs/plans.md": "word\n" } }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error DOCS: docs/plans.md carries the word \"plan\""]);
});

test("a non-Markdown file under docs/ fails as unlisted", () => {
  const result = run(fakeHost({ tracked: [...ALLOWLIST, "docs/notes.txt"], files: { ...cleanFiles(), "docs/notes.txt": "word\n" } }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error DOCS: docs/notes.txt is tracked and not on the allowlist"]);
});

test("skills/**/*.md is out of scope", () => {
  const result = run(
    fakeHost({ tracked: [...ALLOWLIST, "skills/fmea-software/README.md"], files: { ...cleanFiles(), "skills/fmea-software/README.md": "word\n" } }),
  );
  assert.equal(result.status, 0);
});

test("the pull request template is excluded", () => {
  const result = run(
    fakeHost({
      tracked: [...ALLOWLIST, ".github/pull_request_template.md"],
      files: { ...cleanFiles(), ".github/pull_request_template.md": "word\n" },
    }),
  );
  assert.equal(result.status, 0);
});

test("--write-baseline lowers every cap to the measurement", () => {
  const host = fakeHost();
  const result = run(host, true);
  assert.equal(result.status, 0);
  assert.equal(host.written.length, 1);
  assert.equal(host.written[0].path, join(ROOT, BASELINE_PATH));
  const written = JSON.parse(host.written[0].text) as typeof SEED;
  assert.deepEqual(written.files["docs/design.md"], { lines: 1, words: 1 });
  assert.deepEqual(written.files["README.md"], { words: 1 });
  assert.equal(written.totalWords, 7);
  assert.equal(written.totalLines, 4);
  assert.ok(host.written[0].text.endsWith("\n"));
});

test("--write-baseline refuses a raise and leaves the file unchanged", () => {
  const host = fakeHost({ files: { ...cleanFiles(), "docs/design.md": words(3201) } });
  const result = run(host, true);
  assert.equal(result.status, 1);
  assert.equal(host.written.length, 0);
  assert.deepEqual(result.errors, [
    "error DOCS: --write-baseline would raise docs/design.md's word cap from 3200 to 3201",
  ]);
});

test("--write-baseline refuses to add or remove a path", () => {
  const baseline = { ...SEED, files: Object.fromEntries(Object.entries(SEED.files).filter(([path]) => path !== "docs/tracking.md")) };
  const host = fakeHost({ baseline });
  const result = run(host, true);
  assert.equal(result.status, 1);
  assert.equal(host.written.length, 0);
  assert.deepEqual(result.errors, ["error DOCS: --write-baseline refuses to add or remove a path"]);
});

test("--write-baseline refuses to drop a path that is not tracked", () => {
  const tracked = ALLOWLIST.filter((path) => path !== "README.md");
  const host = fakeHost({ tracked });
  const result = run(host, true);
  assert.equal(result.status, 1);
  assert.equal(host.written.length, 0);
  assert.deepEqual(result.errors, ["error DOCS: README.md is on the allowlist and is not tracked"]);
});

test("--write-baseline never creates a missing baseline", () => {
  const host = fakeHost({ baseline: null });
  const result = run(host, true);
  assert.equal(result.status, 3);
  assert.equal(host.written.length, 0);
  assert.deepEqual(result.errors, ["error IO_READ: dev/docs-baseline.json is absent"]);
});

test("an unreadable baseline is exit 3", () => {
  const result = run(fakeHost({ baselineText: "{not json" }));
  assert.equal(result.status, 3);
  assert.deepEqual(result.errors, ["error IO_READ: dev/docs-baseline.json is not JSON"]);
});

test("an unreadable tracked list is exit 3", () => {
  const result = run(fakeHost({ gitStatus: 128 }));
  assert.equal(result.status, 3);
  assert.deepEqual(result.errors, ["error IO_READ: git ls-files could not be read"]);
});
