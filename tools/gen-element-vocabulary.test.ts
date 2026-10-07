import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { END, main, REFERENCE_PATH, renderRegion, replaceRegion, START, VOCABULARY_PATH } from "./gen-element-vocabulary.ts";

function committedVocabulary(): unknown {
  return JSON.parse(readFileSync(VOCABULARY_PATH, "utf8"));
}

function entry(id: string, tags: string[]): Record<string, unknown> {
  return { id, label: id.toUpperCase(), test: `${id} test`, basis: `${id} basis`, tags };
}

/** A small vocabulary of the committed file's shape, its roles out of the schema's order. */
function sample(): Record<string, unknown> {
  return {
    version: 1,
    roles: [entry("component", ["skill-authored"]), entry("service", ["paraphrased:C153", "cites:C147"])],
    boundaries: [entry("in_scope", ["cites:C143"])],
    security: { label: "Flag", test: "flag test", tags: ["cites:C157"] },
    tie_breaks: [{ text: "A cache is a `datastore`.", tags: ["skill-authored"] }],
  };
}

/** The table rows (header and rule left out) under a `### <heading>` of a rendered region. */
function tableRows(region: string, heading: string): string[] {
  const section = region.split(`### ${heading}\n`)[1].split("\n### ")[0];
  return section.split("\n").filter((line) => line.startsWith("| ")).slice(1);
}

test("the committed region of structure-elements.md is exactly what the committed data file generates", () => {
  const text = readFileSync(REFERENCE_PATH, "utf8");
  assert.equal(text, replaceRegion(text, renderRegion(committedVocabulary())));
});

test("renderRegion writes one row per role in data order with the tags in brackets", () => {
  const region = renderRegion(sample());
  assert.ok(region.startsWith(`${START}\n\n### Role\n\n| Role | Test | Basis | Provenance |\n`), region);
  assert.ok(region.endsWith(`\n\n${END}`), region);
  assert.deepEqual(tableRows(region, "Role"), [
    "| COMPONENT (`component`) | component test | component basis | [skill-authored] |",
    "| SERVICE (`service`) | service test | service basis | [paraphrased:C153] [cites:C147] |",
  ]);
  assert.deepEqual(tableRows(region, "Boundary"), ["| IN_SCOPE (`in_scope`) | in_scope test | in_scope basis | [cites:C143] |"]);
  assert.deepEqual(tableRows(region, "Security relevance"), ["| Flag | flag test |  | [cites:C157] |"]);
  assert.ok(region.includes("### Tie-breaks\n\n- A cache is a `datastore`. [skill-authored]\n"), region);
});

test("replaceRegion refuses a text with no start marker, no end marker, or two of either", () => {
  const region = `${START}\nnew\n${END}`;
  assert.equal(replaceRegion(`before\n${START}\nold\n${END}\nafter\n`, region), `before\n${region}\nafter\n`);
  for (const text of [
    `${END}\n`,
    `${START}\n`,
    `${START}\n${START}\n${END}\n`,
    `${START}\n${END}\n${END}\n`,
    `${END}\n${START}\n`,
  ]) {
    assert.throws(() => replaceRegion(text, region), { code: "REGION_MISSING" }, JSON.stringify(text));
  }
});

test("renderRegion refuses a bare record id in tags and a tag outside the vocabulary", () => {
  for (const bad of ["C153", "quoted:C153", "cites:C15", ""]) {
    const role = sample();
    (role.roles as Record<string, unknown>[])[1].tags = ["cites:C147", bad];
    assert.throws(() => renderRegion(role), { code: "VOCABULARY_INVALID" }, `role tag ${JSON.stringify(bad)}`);
    const tie = sample();
    (tie.tie_breaks as Record<string, unknown>[])[0].tags = [bad];
    assert.throws(() => renderRegion(tie), { code: "VOCABULARY_INVALID" }, `tie-break tag ${JSON.stringify(bad)}`);
  }
  const untagged = sample();
  (untagged.security as Record<string, unknown>).tags = [];
  assert.throws(() => renderRegion(untagged), { code: "VOCABULARY_INVALID" });
  assert.throws(() => renderRegion({ ...sample(), roles: "service" }), { code: "VOCABULARY_INVALID" });
});

test("the CLI rewrites the file in place and exits 0; an argument is USAGE", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "gen-element-vocabulary-"));
  try {
    const reference = join(dir, "structure-elements.md");
    const stale = `# Head\n\n${START}\n\nstale\n\n${END}\n\nTail. [skill-authored]\n`;
    writeFileSync(reference, stale);
    const errors: string[] = [];
    t.mock.method(process.stderr, "write", (text: string) => { errors.push(text); return true; });
    assert.equal(main(["extra"], { vocabulary: VOCABULARY_PATH, reference }), 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^error USAGE: usage: node tools\/gen-element-vocabulary\.ts\n$/);
    assert.equal(readFileSync(reference, "utf8"), stale);
    assert.equal(main([], { vocabulary: VOCABULARY_PATH, reference }), 0);
    assert.equal(errors.length, 1);
    const written = readFileSync(reference, "utf8");
    assert.equal(written, replaceRegion(stale, renderRegion(committedVocabulary())));
    assert.ok(written.startsWith(`# Head\n\n${START}\n\n### Role\n`) && written.endsWith(`${END}\n\nTail. [skill-authored]\n`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
