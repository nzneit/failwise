import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, PAIRS, strip } from "./gen-skill.ts";

const TAG = "[skill-authored]";
const ROOT = join(import.meta.dirname, "..");
const SOURCED_TAG = /\[(?:sourced|paraphrased|adapted-from|cites):C\d+\]/;

/** The lines of text outside its frontmatter and fences, numbered from 1, and the number of the
 *  fence line left open, if one is. */
function outsideFences(text: string): { lines: { n: number; line: string }[]; open: number | undefined } {
  const all = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const close = all[0] === "---" ? all.indexOf("---", 1) : -1;
  const lines: { n: number; line: string }[] = [];
  let open: number | undefined;
  all.forEach((line, i) => {
    if (i <= close) return;
    if (line.startsWith("```")) open = open === undefined ? i + 1 : undefined;
    else if (open === undefined) lines.push({ n: i + 1, line });
  });
  return { lines, open };
}

/** The trimmed cells of a table row, its outer pipes dropped. */
function cells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/** One message per breach of the success criterion of the design (spec §1), written apart from
 *  strip: a tag with no sourced tag on its line, a Provenance column of only empty cells, and a
 *  fence left open. Frontmatter and fenced lines are not read. */
function leftovers(text: string): string[] {
  const { lines, open } = outsideFences(text);
  const messages = lines.filter(({ line }) => line.includes(TAG) && !SOURCED_TAG.test(line)).map(({ n }) => `line ${n}: ${TAG} without a sourced tag`);
  const tables: { n: number; line: string }[][] = [];
  for (const entry of lines.filter(({ line }) => line.startsWith("|"))) {
    const current = tables.at(-1);
    if (current && current[current.length - 1].n === entry.n - 1) current.push(entry);
    else tables.push([entry]);
  }
  // The column is the header's last cell, found by its index in every row; a missing cell is empty.
  for (const [header, , ...body] of tables.filter((table) => table.length >= 2)) {
    const column = cells(header.line).length - 1;
    if (cells(header.line)[column] === "Provenance" && body.every(({ line }) => (cells(line)[column] ?? "") === "")) messages.push(`line ${header.n}: Provenance column of only empty cells`);
  }
  if (open !== undefined) messages.push(`line ${open}: unclosed fence`);
  return messages;
}

test("every generated skill file is exactly strip of its tagged source", () => {
  for (const { source, output } of PAIRS) {
    const message = `${output} differs from strip(${source}); edit ${source}, then run node tools/gen-skill.ts`;
    assert.equal(readFileSync(join(ROOT, output), "utf8"), strip(readFileSync(join(ROOT, source), "utf8")), message);
  }
});

test("every generated skill file meets the success criterion on its own", () => {
  for (const { output } of PAIRS) assert.deepEqual(leftovers(readFileSync(join(ROOT, output), "utf8")), [], output);
});

test("leftovers names a stray tag, an empty Provenance column and an unclosed fence", () => {
  assert.deepEqual(leftovers("Write `[skill-authored]` here.\n"), ["line 1: [skill-authored] without a sourced tag"]);
  assert.deepEqual(leftovers("| A | Provenance |\n|---|---|\n| x | |\n"), ["line 1: Provenance column of only empty cells"]);
  assert.deepEqual(leftovers("One.\n```\ncode [skill-authored]\n"), ["line 2: unclosed fence"]);
  assert.deepEqual(leftovers("A. [paraphrased:C103] [skill-authored]\n```\nx [skill-authored]\n```\n"), []);
});

test("leftovers finds the Provenance column by the header's cells, so a row without its closing pipe or with an extra cell still counts", () => {
  const empty = ["line 1: Provenance column of only empty cells"];
  assert.deepEqual(leftovers("| A | Provenance\n|---|---\n| x |\n"), empty);
  assert.deepEqual(leftovers("| S | P | Provenance |\n|---|---|---|\n| a | A. | |\n| b | B. |\n"), empty);
  assert.deepEqual(leftovers("| A | Provenance |\n|---|---|\n| x | | extra |\n"), empty);
  assert.deepEqual(leftovers("| A | Provenance |\n|---|---|\n| x | |\n| y | [cites:C001] |\n"), []);
});

test("PAIRS holds the one pair: the tagged source generates the shipped SKILL.md", () => {
  assert.deepEqual(PAIRS, [{ source: "dev/skill-source/SKILL.md", output: "skills/fmea-software/SKILL.md" }]);
});

test("strip removes a prose tag with the space before it, two on one line too", () => {
  assert.equal(strip(`One. ${TAG}\n`), "One.\n");
  assert.equal(strip(`One. ${TAG} Two. ${TAG}\n`), "One. Two.\n");
});

test("strip keeps a tag directly after or directly before a sourced tag", () => {
  for (const line of [`A. [paraphrased:C103] ${TAG}\n`, `A. ${TAG} [cites:C001]\n`, `A. [sourced:C010] ${TAG}\n`, `A. [adapted-from:C020] ${TAG}\n`]) {
    assert.equal(strip(line), line);
  }
});

test("strip leaves frontmatter and fenced blocks as they are", () => {
  const text = `---\nname: x ${TAG}\n---\n\`\`\`\ncode ${TAG}\n\`\`\`\nProse. ${TAG}\n`;
  assert.equal(strip(text), `---\nname: x ${TAG}\n---\n\`\`\`\ncode ${TAG}\n\`\`\`\nProse.\n`);
});

test("strip removes a last Provenance column that held only skill-authored tags, and no other column", () => {
  const own = `| Script | Purpose | Provenance |\n|---|---|---|\n| a.ts | Runs a. | ${TAG} |\n| b.ts | Runs b. | ${TAG} |\n`;
  assert.equal(strip(own), "| Script | Purpose |\n|---|---|\n| a.ts | Runs a. |\n| b.ts | Runs b. |\n");
  assert.equal(strip(`| A | Notes |\n|---|---|\n| x | ${TAG} |\n`), "| A | Notes |\n|---|---|\n| x | |\n");
});

test("strip keeps a Provenance column holding a sourced cell and empties its own cells", () => {
  const mixed = `| File | Provenance |\n|---|---|\n| a | ${TAG} |\n| b | [cites:C001] |\n`;
  assert.equal(strip(mixed), "| File | Provenance |\n|---|---|\n| a | |\n| b | [cites:C001] |\n");
});

test("strip keeps every column of a table whose lines do not end in a pipe", () => {
  assert.equal(strip(`| A | Provenance\n|---|---\n| x | ${TAG}\n`), "| A | Provenance\n|---|---\n| x |\n");
});

test("strip keeps a tag with no space before it: at the start of a line or in a code span", () => {
  for (const line of [`${TAG} starts the line.\n`, `Write \`${TAG}\` here.\n`]) assert.equal(strip(line), line);
});

test("strip copies everything after a fence that never closes", () => {
  const text = `Prose. ${TAG}\n\`\`\`\ncode ${TAG}\nMore. ${TAG}\n`;
  assert.equal(strip(text), `Prose.\n\`\`\`\ncode ${TAG}\nMore. ${TAG}\n`);
});

test("strip keeps CRLF endings, treats an unclosed frontmatter as body and keeps a missing final newline", () => {
  const crlf = `One. ${TAG}\r\n| A | Provenance |\r\n|---|---|\r\n| x | ${TAG} |\r\n`;
  assert.equal(strip(crlf), "One.\r\n| A |\r\n|---|\r\n| x |\r\n");
  assert.equal(strip(`---\nOne. ${TAG}\n`), "---\nOne.\n");
  assert.equal(strip(`One. ${TAG}`), "One.");
});

test("strip is idempotent", () => {
  const text = `---\nname: x\n---\nOne. ${TAG}\n| A | Provenance |\n|---|---|\n| x | ${TAG} |\n| y | [cites:C001] ${TAG} |\n`;
  assert.equal(strip(strip(text)), strip(text));
});

test("the CLI writes each output and exits 0; an argument is USAGE and an unreadable source is IO_READ, both writing nothing; an unwritable output is IO_WRITE", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "gen-skill-"));
  try {
    const source = join(dir, "source.md");
    const out = join(dir, "out.md");
    writeFileSync(source, `# T\n\nOne. ${TAG}\n`);
    writeFileSync(out, "stale\n");
    const errors: string[] = [];
    t.mock.method(process.stderr, "write", (text: string) => { errors.push(text); return true; });

    assert.equal(main(["--check"], [{ source, output: out }]), 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^error USAGE: usage: node tools\/gen-skill\.ts\n$/);
    assert.equal(readFileSync(out, "utf8"), "stale\n");

    assert.equal(main([], [{ source, output: out }]), 0);
    assert.equal(errors.length, 1);
    assert.equal(readFileSync(out, "utf8"), "# T\n\nOne.\n");

    const out2 = join(dir, "out2.md");
    assert.equal(main([], [{ source, output: out2 }, { source: join(dir, "none.md"), output: out }]), 3);
    assert.match(errors.at(-1) ?? "", /^error IO_READ: cannot read .*none\.md: /);
    assert.equal(existsSync(out2), false);

    assert.equal(main([], [{ source, output: join(dir, "no-dir", "out.md") }]), 3);
    assert.match(errors.at(-1) ?? "", /^error IO_WRITE: cannot write .*out\.md: /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
