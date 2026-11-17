import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, PAIRS, strip } from "./gen-skill.ts";

const TAG = "[skill-authored]";

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
