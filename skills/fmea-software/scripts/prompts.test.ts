import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

interface Prompt {
  id: number;
  name: string;
  text: string;
  inputs: string[];
}
interface PromptFile {
  unattended_preamble: string;
  prompts: Prompt[];
}

const SKILL_ROOT = join(import.meta.dirname, "..");
const PROMPTS_PATH = join(SKILL_ROOT, "evals", "prompts.json");
const file = JSON.parse(readFileSync(PROMPTS_PATH, "utf8")) as PromptFile;

// The four prompt texts are quoted verbatim from the research plan; the evals are only
// comparable across runs if the wording never drifts.
const TEXTS: Record<number, string> = {
  1: "Design FMEA of a checkout service that depends on a third-party payment gateway and a pricing service.",
  5: "Seed an FMEA baseline from a set of existing postmortems and identify gaps.",
  6: "Convert a legacy RPN-based FMEA spreadsheet to the JSON model with AP, preserving RPN for reference.",
  7: "Update an existing FMEA after an architecture change (living-document behavior: diff, re-rate, flag stale rows).",
};

// The fixture files each prompt hands to the run, by file name.
const INPUT_NAMES: Record<number, string[]> = {
  1: ["checkout-inputs.md"],
  5: [
    "INC-2026-0314-gateway-timeouts.md",
    "INC-2026-0502-stale-prices.md",
    "INC-2026-0621-retry-storm.md",
    "checkout-inputs.md",
  ],
  6: ["legacy-rpn-sheet.csv"],
  7: ["after-architecture.md", "before.fmea.json"],
};

// Every fixture Task 13 writes, relative to evals/fixtures/.
const FIXTURE_FILES = [
  "checkout-inputs.md",
  "checkout-service.fmea.json",
  "injection-vectors.json",
  "legacy-rpn-sheet.csv",
  "legacy-rpn-sheet.expected.fmea.json",
  "postmortems/INC-2026-0314-gateway-timeouts.md",
  "postmortems/INC-2026-0502-stale-prices.md",
  "postmortems/INC-2026-0621-retry-storm.md",
  "tables/malformed-cell-missing.json",
  "tables/malformed-gap.json",
  "tables/malformed-overlap.json",
  "tables/malformed-vocab.json",
  "tables/well-formed-alt.json",
  "update/after-architecture.md",
  "update/before.fmea.json",
  "update/expected-stale.json",
  "update/stale-rows.fmea.json",
];

test("prompts.json has a non-empty unattended preamble", () => {
  assert.equal(typeof file.unattended_preamble, "string");
  const pre = file.unattended_preamble;
  assert.ok(pre.length >= 80, "the preamble must state the unattended rules");
  // Task 2's four preamble content assertions, restated here so replacing its file loses
  // nothing. The last one is load-bearing beyond this task: Task 30's sixteen eval runs
  // depend on the preamble naming the skill outright, because skill invocation under
  // `claude -p` otherwise rests on description matching alone.
  assert.ok(pre.includes("meta.assumptions"), "missing inputs become open assumptions");
  assert.ok(pre.includes("inputs/"), "inputs live in inputs/");
  assert.ok(pre.includes("./analysis.json") && pre.includes("./report.html"), "output paths");
  assert.ok(pre.includes("Use the fmea-software skill."), "names the skill explicitly");
});

test("prompts.json carries exactly prompts 1, 5, 6 and 7", () => {
  assert.deepEqual(file.prompts.map((p) => p.id), [1, 5, 6, 7]);
});

test("every prompt has a unique kebab-case name", () => {
  // Task 2 asserted both halves — uniqueness and the kebab-case shape — and both are
  // restated here so replacing its file loses nothing. The names are a human label for
  // readers of prompts.json: no script reads them (Task 30's runner takes only
  // unattended_preamble, text and inputs, and Task 32's report titles its per-prompt
  // sections from its own hard-coded PROMPT_TITLES map), so this test keeps them unique
  // and kebab-case rather than pinning any downstream output to them.
  const names = file.prompts.map((p) => p.name);
  assert.equal(new Set(names).size, names.length, "prompt names must be unique");
  for (const p of file.prompts) {
    assert.match(p.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `prompt ${p.id} name`);
  }
});

test("prompt texts match the research plan verbatim", () => {
  for (const p of file.prompts) {
    assert.equal(p.text, TEXTS[p.id], `prompt ${p.id} text`);
  }
});

test("each prompt lists the fixtures its task shape needs", () => {
  for (const p of file.prompts) {
    const names = p.inputs.map((i) => basename(i)).sort();
    assert.deepEqual(names, INPUT_NAMES[p.id].slice().sort(), `prompt ${p.id} inputs`);
  }
});

test("every input path is relative and stays inside the skill directory", () => {
  for (const p of file.prompts) {
    // Task 2 asserted the list is non-empty and every entry sits under evals/fixtures/;
    // both are restated here so replacing its file loses nothing.
    assert.ok(p.inputs.length >= 1, `prompt ${p.id} has no inputs`);
    for (const input of p.inputs) {
      assert.ok(!isAbsolute(input), `prompt ${p.id} input ${input} must be relative`);
      assert.ok(input.startsWith("evals/fixtures/"), `prompt ${p.id} input ${input} is not under evals/fixtures/`);
      const rel = relative(SKILL_ROOT, resolve(SKILL_ROOT, input));
      assert.ok(!rel.startsWith(".."), `prompt ${p.id} input ${input} escapes the skill directory`);
    }
  }
});

test("every input file exists on disk", () => {
  for (const p of file.prompts) {
    for (const input of p.inputs) {
      const full = resolve(SKILL_ROOT, input);
      assert.ok(statSync(full).isFile(), `prompt ${p.id} input ${input} is not a file`);
    }
  }
});

test("every fixture file is present", () => {
  for (const name of FIXTURE_FILES) {
    const full = join(SKILL_ROOT, "evals", "fixtures", name);
    assert.ok(statSync(full).isFile(), `${name} is missing`);
  }
});

test("every JSON fixture parses", () => {
  for (const name of FIXTURE_FILES.filter((n) => n.endsWith(".json"))) {
    const full = join(SKILL_ROOT, "evals", "fixtures", name);
    assert.doesNotThrow(() => JSON.parse(readFileSync(full, "utf8")), `${name} does not parse`);
  }
});
