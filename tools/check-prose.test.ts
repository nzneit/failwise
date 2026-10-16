import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  BASELINE_PATH,
  checkProse,
  compareToBaseline,
  defaultProseHost,
  FILLER,
  LONG_WORDS,
  MIN_WORDS,
  measureText,
  proseFiles,
  type Counts,
  type FileMeasure,
  type HeadingCounts,
  type ProseHost,
} from "./check-prose.ts";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(import.meta.dirname, "check-prose.ts");
const SKILL = "skills/fmea-software/SKILL.md";
const REF = "skills/fmea-software/references/methodology.md";
const STRUCTURE = "skills/fmea-software/references/structure-elements.md";
const PROVENANCE = "skills/fmea-software/references/provenance.md";
const FAKE_ROOT = "/r";

/** A sentence of `n` words, opening with a capital and ending with a full stop. */
function sentence(n: number): string {
  return ["Alpha", ...Array.from({ length: n - 2 }, () => "beta"), "omega."].join(" ");
}

function total(path: string, text: string): Counts {
  return measureText(path, text).total;
}

function measure(path: string, untagged: number, long: number, filler: number, items = 1): FileMeasure {
  return { path, headings: [], total: { untagged, long, filler }, items };
}

test("the caps and the filler list are the spec's", () => {
  assert.equal(LONG_WORDS, 25);
  assert.equal(MIN_WORDS, 3);
  assert.deepEqual(FILLER, ["basically", "essentially", "simply", "actually", "in order to"]);
  assert.equal(BASELINE_PATH, "dev/prose-baseline.json");
});

test("measureText: a paragraph line in the repository's layout is one item per sentence, each keeping its tag, tagged when it carries one, long above 25 words", () => {
  const tagged = `${sentence(10)} [skill-authored] ${sentence(15)} [skill-authored] ${sentence(29)} [paraphrased:C071]`;
  const first = measureText(SKILL, tagged);
  assert.equal(first.items, 3);
  assert.deepEqual(first.total, { untagged: 0, long: 1, filler: 0 });
  const second = `${tagged}\n${sentence(10)} ${sentence(11)} ${sentence(12)} [skill-authored]`;
  assert.equal(total(SKILL, second).untagged, 2);
});

test("measureText: a list item is one item, tagged when it carries a tag anywhere, and its sentences count for long and filler", () => {
  assert.equal(total(SKILL, `- ${sentence(5)} ${sentence(6)} [skill-authored]`).untagged, 0);
  const link = "- x. [skill-authored] [design-failure-catalog](references/design-failure-catalog.md) offers rows. [skill-authored]";
  const linked = measureText(SKILL, link);
  assert.equal(linked.total.untagged, 0);
  assert.equal(linked.items, 1);
  const twoLong = `- ${sentence(26)} [skill-authored] [design-failure-catalog](x.md) ${"w ".repeat(24)}end. [skill-authored]`;
  const split = total(SKILL, twoLong);
  assert.equal(split.untagged, 0);
  assert.equal(split.long, 2);
  assert.deepEqual(total(SKILL, `1. ${sentence(5)}`), { untagged: 1, long: 0, filler: 0 });
  assert.equal(total(SKILL, `- Run it in order to learn. [skill-authored]`).filler, 1);
});

test("measureText: a table row is one item read from its Provenance cell, and its other cells count for long", () => {
  const table = [
    "| Name | Note | Provenance |",
    "| --- | :-: | --- |",
    `| a | ${sentence(30)} | [skill-authored] |`,
    "| b | Short note here | |",
    "| c | A tag in the middle [skill-authored] | |",
  ].join("\n");
  const measured = measureText(SKILL, table);
  assert.equal(measured.items, 3);
  assert.deepEqual(measured.total, { untagged: 2, long: 1, filler: 0 });
});

test("measureText: frontmatter, fences, headings, blank lines and HTML comments are not measured, and a # inside a fence is not a heading", () => {
  const text = [
    "---",
    "name: fmea-software",
    "description: A description line that is not measured at all.",
    "---",
    "",
    "<!-- a comment line that is skipped entirely -->",
    "## Scripts",
    "",
    "```bash",
    "# not a heading",
    "node ${CLAUDE_SKILL_DIR}/scripts/validate.ts report.json",
    "```",
    "",
    `${sentence(6)} [skill-authored]`,
  ].join("\n");
  const measured = measureText(SKILL, text);
  assert.deepEqual(
    measured.headings.map((h) => h.heading),
    ["(preamble)", "Scripts"],
  );
  assert.equal(measured.items, 1);
  assert.deepEqual(measured.total, { untagged: 0, long: 0, filler: 0 });
});

test("measureText: counts are reported per heading, in order, with (preamble) first", () => {
  const text = [`${sentence(5)}`, "# Input rule", `${sentence(6)} [skill-authored]`, "## The spine", `- ${sentence(5)}`].join("\n");
  const measured = measureText(SKILL, text);
  assert.deepEqual(
    measured.headings.map((h) => h.heading),
    ["(preamble)", "Input rule", "The spine"],
  );
  assert.deepEqual(
    measured.headings.map((h) => h.counts.untagged),
    [1, 0, 1],
  );
});

test("measureText: the vocabulary region of structure-elements.md and the source register of provenance.md are exempt, and the heading after the register is measured", () => {
  const vocabulary = ["# Top", "<!-- vocabulary:start -->", `- ${sentence(5)}`, `- ${sentence(6)}`, "<!-- vocabulary:end -->", `- ${sentence(7)}`].join("\n");
  assert.equal(total(STRUCTURE, vocabulary).untagged, 1);
  assert.equal(total(REF, vocabulary).untagged, 3);
  const register = ["## Before", `${sentence(5)} [skill-authored]`, "## The source register", `- ${sentence(5)}`, "| a | b |", "| - | - |", "| c | |", "## IEC 60812:2018", sentence(8)].join("\n");
  const exempt = measureText(PROVENANCE, register);
  assert.equal(exempt.total.untagged, 1);
  const last: HeadingCounts | undefined = exempt.headings.at(-1);
  assert.equal(last?.heading, "IEC 60812:2018");
  assert.equal(last?.counts.untagged, 1);
  assert.equal(total(REF, register).untagged, 3);
});

test("measureText: a sentence of fewer than three words is not an item, a code span is one word, a link counts its label", () => {
  assert.equal(measureText(SKILL, "**Plan.**").items, 0);
  const tokens = Array.from({ length: LONG_WORDS }, () => "word").join(" ");
  const withSpan = `Alpha ${tokens.split(" ").slice(1).join(" ")} \`five words in one span\`.`;
  assert.equal(withSpan.split(" ").filter((w) => w !== "").length > LONG_WORDS + 1, true);
  assert.equal(total(SKILL, `${withSpan} [skill-authored]`).long, 1);
  const exactly = `Alpha ${Array.from({ length: LONG_WORDS - 2 }, () => "word").join(" ")} \`five words in one span\`.`;
  assert.equal(total(SKILL, `${exactly} [skill-authored]`).long, 0);
  const label = `[three word label](a.md "a title") ${Array.from({ length: LONG_WORDS - 4 }, () => "word").join(" ")}.`;
  assert.equal(total(SKILL, `Alpha ${label}`).long, 0);
  assert.equal(total(SKILL, `Alpha ${label} extra`).long, 1);
});

test("compareToBaseline: equal counts pass; a count above its baseline, a missing entry and an entry outside the scope are PROSE lines", () => {
  const measured = [measure(SKILL, 2, 1, 0)];
  assert.deepEqual(compareToBaseline(measured, { [SKILL]: { untagged: 2, long: 1, filler: 0 } }), []);
  assert.deepEqual(compareToBaseline(measured, { [SKILL]: { untagged: 3, long: 2, filler: 1 } }), []);
  assert.deepEqual(compareToBaseline(measured, { [SKILL]: { untagged: 2, long: 0, filler: 0 } }), [
    `error PROSE: ${SKILL}: long is 1, above its baseline 0`,
  ]);
  assert.deepEqual(compareToBaseline(measured, {}), [`error PROSE: dev/prose-baseline.json lacks ${SKILL}`]);
  assert.deepEqual(compareToBaseline(measured, { [SKILL]: { untagged: 2, long: 1, filler: 0 }, "gone.md": { untagged: 0, long: 0, filler: 0 } }), [
    "error PROSE: dev/prose-baseline.json names gone.md, which is not in scope",
  ]);
  assert.deepEqual(compareToBaseline(measured, []), ["error IO_READ: dev/prose-baseline.json is not a JSON object"]);
});

/** A host with no machine behind it: `files` maps a repository-relative path to its text, or to the
 *  error a read of it throws. */
function fakeProseHost(files: Record<string, string | Error>): ProseHost {
  const relative = (path: string): string => path.slice(FAKE_ROOT.length + 1);
  return {
    execPath: "/opt/node/bin/node",
    isNode: true,
    env: {},
    exists: (path) => relative(path) in files,
    listDir: (path) => Object.keys(files).filter((name) => name.startsWith(`${relative(path)}/`)).map((name) => name.slice(relative(path).length + 1)),
    listEntries: () => [],
    spawn: () => ({ status: 0 }),
    home: "/home/u",
    readFile: (path) => {
      const value = files[relative(path)];
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

function runCheck(host: ProseHost, writeBaseline = false): { status: number; lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  const status = checkProse(FAKE_ROOT, host, { writeBaseline }, (line) => lines.push(line), (line) => errors.push(line));
  return { status, lines, errors };
}

const GOOD_BASELINE = JSON.stringify({
  [SKILL]: { untagged: 1, long: 0, filler: 0 },
  [REF]: { untagged: 1, long: 0, filler: 0 },
});
const GOOD_TEXT = `# Top\n${sentence(6)}\n`;

test("checkProse fails closed: a missing or non-JSON baseline, an unreadable file and a file measuring nothing are IO_READ lines, exit 3, an IO_READ beside a PROSE line still exits 3, and under --write-baseline a non-JSON baseline or an unreadable file still exits 3 and writes nothing", () => {
  const base = { [SKILL]: GOOD_TEXT, [REF]: GOOD_TEXT };
  assert.deepEqual(proseFiles(FAKE_ROOT, fakeProseHost(base)), [SKILL, REF]);
  const passing = runCheck(fakeProseHost({ ...base, [BASELINE_PATH]: GOOD_BASELINE }));
  assert.equal(passing.status, 0);
  assert.deepEqual(passing.errors, []);
  assert.match(passing.lines.join("\n"), /^## skills\/fmea-software\/SKILL\.md$/m);

  const missing = runCheck(fakeProseHost(base));
  assert.equal(missing.status, 3);
  assert.match(missing.errors.join("\n"), /^error IO_READ: dev\/prose-baseline\.json: /m);

  const notJson = runCheck(fakeProseHost({ ...base, [BASELINE_PATH]: "not json" }));
  assert.equal(notJson.status, 3);
  assert.match(notJson.errors.join("\n"), /^error IO_READ: dev\/prose-baseline\.json: /m);

  const unreadable = runCheck(fakeProseHost({ ...base, [REF]: new Error("EACCES"), [BASELINE_PATH]: GOOD_BASELINE }));
  assert.equal(unreadable.status, 3);
  assert.match(unreadable.errors.join("\n"), /^error IO_READ: skills\/fmea-software\/references\/methodology\.md: EACCES$/m);
  assert.doesNotMatch(unreadable.errors.join("\n"), /PROSE/);

  const empty = runCheck(fakeProseHost({ ...base, [REF]: "# Only a heading\n", [BASELINE_PATH]: GOOD_BASELINE }));
  assert.equal(empty.status, 3);
  assert.match(empty.errors.join("\n"), /^error IO_READ: skills\/fmea-software\/references\/methodology\.md: measures 0 items$/m);

  const both = runCheck(
    fakeProseHost({
      [SKILL]: `# Top\n${sentence(30)}\n`,
      [REF]: new Error("EACCES"),
      [BASELINE_PATH]: GOOD_BASELINE,
    }),
  );
  assert.equal(both.status, 3);
  assert.match(both.errors.join("\n"), /^error PROSE: skills\/fmea-software\/SKILL\.md: long is 1, above its baseline 0$/m);
  assert.match(both.errors.join("\n"), /^error IO_READ: /m);

  const mixed = runCheck(
    fakeProseHost({
      [SKILL]: `# Top\n${sentence(30)}\n${sentence(31)}\n`,
      [REF]: new Error("EACCES"),
      [BASELINE_PATH]: GOOD_BASELINE,
    }),
  );
  assert.equal(mixed.status, 3);
  assert.match(mixed.errors.join("\n"), /^error PROSE: skills\/fmea-software\/SKILL\.md: untagged is 2, above its baseline 1$/m);
  assert.match(mixed.errors.join("\n"), /^error IO_READ: skills\/fmea-software\/references\/methodology\.md: EACCES$/m);

  const writeNotJson = runCheck(fakeProseHost({ ...base, [BASELINE_PATH]: "not json" }), true);
  assert.equal(writeNotJson.status, 3);
  assert.equal(writeNotJson.lines.some((line) => line.startsWith("wrote")), false);
  const writeUnreadable = runCheck(fakeProseHost({ ...base, [REF]: new Error("EACCES") }), true);
  assert.equal(writeUnreadable.status, 3);
  assert.equal(writeUnreadable.lines.some((line) => line.startsWith("wrote")), false);
});

/** A temporary repository root holding SKILL.md, one reference and an empty dev folder. */
function tempRoot(skill: string, reference: string): string {
  const root = mkdtempSync(join(tmpdir(), "check-prose-"));
  mkdirSync(join(root, "skills", "fmea-software", "references"), { recursive: true });
  mkdirSync(join(root, "dev"));
  writeFileSync(join(root, SKILL), skill);
  writeFileSync(join(root, REF), reference);
  return root;
}

test("checkProse --write-baseline writes the measured counts with sorted keys and exits 0, the next run without it passes, and a write that would raise a count refuses", () => {
  const skill = `# Top\n${sentence(6)} [skill-authored]\n`;
  const reference = `# Ref\n${sentence(7)}\n`;
  const root = tempRoot(skill, reference);
  try {
    const host = defaultProseHost();
    const lines: string[] = [];
    const errors: string[] = [];
    const run = (writeBaseline: boolean): number => checkProse(root, host, { writeBaseline }, (line) => lines.push(line), (line) => errors.push(line));
    assert.equal(run(true), 0);
    assert.ok(lines.includes("wrote dev/prose-baseline.json"));
    const path = join(root, BASELINE_PATH);
    const written = readFileSync(path, "utf8");
    const expected = {
      [SKILL]: { filler: 0, long: 0, untagged: 0 },
      [REF]: { filler: 0, long: 0, untagged: 1 },
    };
    assert.equal(written, JSON.stringify(expected, null, 2) + "\n");
    assert.equal(run(false), 0);
    assert.deepEqual(errors, []);

    writeFileSync(join(root, SKILL), `${skill}${sentence(30)} [skill-authored]\n`);
    assert.equal(run(true), 1);
    assert.match(errors.join("\n"), /^error PROSE: skills\/fmea-software\/SKILL\.md: long would rise from 0 to 1$/m);
    assert.equal(readFileSync(path, "utf8"), written);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkProse: a references folder that cannot be listed still measures SKILL.md, compares it alone and exits 3", () => {
  const host = fakeProseHost({ [SKILL]: GOOD_TEXT, [BASELINE_PATH]: GOOD_BASELINE });
  host.listDir = () => {
    throw new Error("EACCES");
  };
  const result = runCheck(host);
  assert.equal(result.status, 3);
  assert.match(result.lines.join("\n"), /^## skills\/fmea-software\/SKILL\.md$/m);
  assert.equal(result.errors.filter((line) => line.startsWith("error IO_READ:")).length, 1);
  assert.doesNotMatch(result.errors.join("\n"), /error PROSE:/);
  assert.equal(runCheck(host, true).status, 3);
});

test("checkProse: a baseline that is JSON but not an object is an IO_READ line, exit 3, in both modes", () => {
  const files = { [SKILL]: GOOD_TEXT, [REF]: GOOD_TEXT, [BASELINE_PATH]: "null" };
  for (const writeBaseline of [false, true]) {
    const result = runCheck(fakeProseHost(files), writeBaseline);
    assert.equal(result.status, 3);
    assert.deepEqual(result.errors, ["error IO_READ: dev/prose-baseline.json is not a JSON object"]);
    assert.equal(result.lines.some((line) => line.startsWith("wrote")), false);
  }
});

test("checkProse: a failed baseline write is one IO_WRITE line, exit 3, and no file", () => {
  const root = tempRoot(`# Top\n${sentence(6)} [skill-authored]\n`, `# Ref\n${sentence(7)}\n`);
  rmSync(join(root, "dev"), { recursive: true });
  try {
    const lines: string[] = [];
    const errors: string[] = [];
    const status = checkProse(root, defaultProseHost(), { writeBaseline: true }, (line) => lines.push(line), (line) => errors.push(line));
    assert.equal(status, 3);
    assert.match(errors.join("\n"), /^error IO_WRITE: dev\/prose-baseline\.json: /m);
    assert.equal(lines.some((line) => line.startsWith("wrote")), false);
    assert.equal(existsSync(join(root, BASELINE_PATH)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the CLI prints every count and exits 1 above the baseline, 0 at it", () => {
  const skill = `# Top\n${sentence(6)} [skill-authored]\n`;
  const root = tempRoot(skill, `# Ref\n${sentence(7)} [skill-authored]\n`);
  try {
    const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: "utf8" });
    const written = run("--write-baseline");
    assert.equal(written.status, 0, written.stderr);
    assert.ok(existsSync(join(root, BASELINE_PATH)));
    assert.equal(run().status, 0);

    writeFileSync(join(root, SKILL), `${skill}${sentence(30)} [skill-authored]\n`);
    const above = run();
    assert.equal(above.status, 1);
    assert.match(above.stderr, /^error PROSE: skills\/fmea-software\/SKILL\.md: long is 1, above its baseline 0$/m);
    assert.match(above.stdout, /^## skills\/fmea-software\/SKILL\.md$/m);
    assert.match(above.stdout, /^- \(preamble\): \d+ untagged, \d+ over 25 words, \d+ filler$/m);

    const other = run("--other");
    assert.equal(other.status, 1);
    assert.match(other.stderr, /^error USAGE: usage: node tools\/check-prose\.ts \[--write-baseline\]$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  "the real baseline is never above the real counts",
  () => {
    const host = defaultProseHost();
    const baseline = JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), "utf8")) as Record<string, Record<string, number>>;
    for (const path of proseFiles(ROOT, host)) {
      const measured = measureText(path, readFileSync(join(ROOT, path), "utf8")).total;
      assert.ok(baseline[path], `${path} has no baseline entry`);
      for (const name of ["untagged", "long", "filler"] as const) {
        assert.ok(baseline[path][name] <= measured[name], `${path} ${name}: baseline ${baseline[path][name]} above measured ${measured[name]}`);
      }
    }
  },
);
