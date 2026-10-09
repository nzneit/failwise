import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  CRITERIA,
  criteriaFor,
  renderReport,
  STALE_SCORES_CLOSING,
  STALE_SCORES_RULING9,
  staleCriticClosing,
  staleCriticParts,
  staleScoreParts,
  staleScoresC1,
  staleScoresC3,
  summarizeRun,
  unreachableRosters,
  unscoredRosterRuns,
  type EvalResults,
  type RunResult,
  type RunScore,
} from "./eval-report.ts";

function allTwo(prompt: number, except: Record<string, number> = {}, rubric = 1): RunScore[] {
  return criteriaFor(prompt, rubric).map((c) => ({ id: c.id, score: except[c.id] ?? 2, evidence: "ok" }));
}

test("fifteen criteria; under rubric 1 prompts 1, 5 and 6 have 10 applicable with 8 musts, prompt 7 has 11 with 9", () => {
  assert.equal(CRITERIA.length, 15);
  for (const p of [1, 5, 6]) {
    assert.equal(criteriaFor(p).length, 10);
    assert.equal(criteriaFor(p).filter((c) => c.must).length, 8);
  }
  assert.equal(criteriaFor(7).length, 11);
  assert.equal(criteriaFor(7).filter((c) => c.must).length, 9);
  // c5 is not scored on prompt 6: the conversion rule never re-rates, so a
  // converted document holds no rating the run authored (evals/rubric.md).
  assert.equal(criteriaFor(6).some((c) => c.id === "c5-provisional-rescore"), false);
  assert.deepEqual(criteriaFor(6).map((c) => c.id).slice(-1), ["c11-prompt6-conversion"]);
  assert.deepEqual(criteriaFor(7).map((c) => c.id).slice(-1), ["c12-prompt7-update"]);
  assert.equal(criteriaFor(1).some((c) => c.id === "c13-element-typing"), false);
});

test("rubric 2 adds c13 to prompts 1 and 6, giving 11 applicable with 8 musts, and leaves prompts 5 and 7 as they were", () => {
  for (const p of [1, 6]) {
    assert.equal(criteriaFor(p, 2).length, 11);
    assert.equal(criteriaFor(p, 2).filter((c) => c.must).length, 8);
    assert.deepEqual(criteriaFor(p, 2).map((c) => c.id).slice(-1), ["c13-element-typing"]);
  }
  for (const p of [5, 7]) assert.deepEqual(criteriaFor(p, 2), criteriaFor(p));
});

test("under rubric 2 prompts 1 and 6 score out of 22, prompt 5 out of 20, and the total rule binds", () => {
  assert.equal(summarizeRun(1, allTwo(1), 2).max, 22);
  assert.equal(summarizeRun(5, allTwo(5), 2).max, 20);
  // Every must at 2 and the three non-musts (c3, c8, c13) at 0 totals 16 of 22,
  // below 80%: the total rule binds on these prompts under rubric 2.
  for (const p of [1, 6]) {
    const lowest = summarizeRun(p, criteriaFor(p, 2).map((c) => ({ id: c.id, score: c.must ? 2 : 0, evidence: "" })), 2);
    assert.deepEqual(lowest, { total: 16, max: 22, mustsAt2: 8, mustCount: 8, pass: false });
  }
  // Without the rubric argument a c13 score is ignored, as on the v1 results.
  const withC13 = [...allTwo(1), { id: "c13-element-typing", score: 0, evidence: "" }];
  assert.deepEqual(summarizeRun(1, withC13), { total: 20, max: 20, mustsAt2: 8, mustCount: 8, pass: true });
});

test("rubric 3 adds c14 and c15 to prompt 1 and c14 to prompt 6, scoring prompts 1, 6 and 7 out of 26, 24 and 22", () => {
  assert.deepEqual(criteriaFor(1, 3).map((c) => c.id).slice(-3), ["c13-element-typing", "c14-edges-and-codebases", "c15-cross-service-trace"]);
  assert.deepEqual(criteriaFor(6, 3).map((c) => c.id).slice(-2), ["c13-element-typing", "c14-edges-and-codebases"]);
  for (const p of [1, 6]) assert.equal(criteriaFor(p, 3).filter((c) => c.must).length, 8);
  for (const p of [5, 7]) assert.deepEqual(criteriaFor(p, 3), criteriaFor(p));
  assert.equal(summarizeRun(1, allTwo(1, {}, 3), 3).max, 26);
  assert.equal(summarizeRun(6, allTwo(6, {}, 3), 3).max, 24);
  assert.equal(summarizeRun(7, allTwo(7, {}, 3), 3).max, 22);
});

test("under rubric 3 the musts total 16, so prompt 1 needs 21 of 26 and prompt 6 needs 20 of 24", () => {
  const zero = (p: number) => Object.fromEntries(criteriaFor(p, 3).filter((c) => !c.must).map((c) => [c.id, 0]));
  assert.deepEqual(summarizeRun(1, allTwo(1, zero(1), 3), 3), { total: 16, max: 26, mustsAt2: 8, mustCount: 8, pass: false });
  assert.deepEqual(summarizeRun(6, allTwo(6, zero(6), 3), 3), { total: 16, max: 24, mustsAt2: 8, mustCount: 8, pass: false });
  const p1 = { ...zero(1), "c3-chain-completeness": 2, "c8-html-renders": 2 };
  assert.equal(summarizeRun(1, allTwo(1, { ...p1, "c13-element-typing": 1 }, 3), 3).pass, true); // 21 of 26
  assert.equal(summarizeRun(1, allTwo(1, p1, 3), 3).pass, false); // 20 of 26
  const p6 = { ...zero(6), "c3-chain-completeness": 2, "c8-html-renders": 2 };
  assert.equal(summarizeRun(6, allTwo(6, p6, 3), 3).pass, true); // 20 of 24
  assert.equal(summarizeRun(6, allTwo(6, { ...p6, "c8-html-renders": 1 }, 3), 3).pass, false); // 19 of 24
});

test("a rubric-2 file reads c14 and c15 scores as absent: prompts 1, 6 and 7 still score out of 22", () => {
  for (const p of [1, 6]) {
    assert.deepEqual(summarizeRun(p, allTwo(p, {}, 3), 2), { total: 22, max: 22, mustsAt2: 8, mustCount: 8, pass: true });
  }
  assert.equal(summarizeRun(7, allTwo(7, {}, 3), 2).max, 22);
});

test("a perfect run scores max and passes", () => {
  const s = summarizeRun(1, allTwo(1));
  assert.deepEqual(s, { total: 20, max: 20, mustsAt2: 8, mustCount: 8, pass: true });
  const t = summarizeRun(6, allTwo(6));
  assert.deepEqual(t, { total: 20, max: 20, mustsAt2: 8, mustCount: 8, pass: true });
});

test("exactly 80% of maximum with every must at 2 passes", () => {
  // c3 and c8 are the only non-musts, so with every must at 2 the lowest
  // total is 16 / 20 on prompts 1, 5 and 6 and 18 / 22 on prompt 7, both at or
  // above 80%: the total rule binds only if a threshold changes.
  const p1 = summarizeRun(1, allTwo(1, { "c3-chain-completeness": 0, "c8-html-renders": 0 }));
  assert.deepEqual(p1, { total: 16, max: 20, mustsAt2: 8, mustCount: 8, pass: true });
  const p6 = summarizeRun(6, allTwo(6, { "c3-chain-completeness": 0, "c8-html-renders": 0 }));
  assert.deepEqual(p6, { total: 16, max: 20, mustsAt2: 8, mustCount: 8, pass: true });
  const p7 = summarizeRun(7, allTwo(7, { "c3-chain-completeness": 0, "c8-html-renders": 0 }));
  assert.deepEqual(p7, { total: 18, max: 22, mustsAt2: 9, mustCount: 9, pass: true });
});

test("with every must at 2 the total rule cannot bind under the current criterion set", () => {
  // Worth knowing at the gate: the musts alone carry 16 of 20 on prompts 1, 5
  // and 6 and 18 of 22 on prompt 7, both at or above 80%, so a run that satisfies
  // every must passes on total whatever the two non-musts score. If a threshold in
  // rubric.md moves, this stops holding and the acceptance note has to say so.
  for (const p of [1, 5, 6, 7]) {
    const musts = criteriaFor(p).filter((c) => c.must).length;
    const lowest = summarizeRun(
      p,
      criteriaFor(p).map((c) => ({ id: c.id, score: c.must ? 2 : 0, evidence: "" })),
    );
    assert.equal(lowest.total, 2 * musts);
    assert.equal(lowest.max, 2 * criteriaFor(p).length);
    assert.equal(lowest.pass, true);
  }
  // The rule is integer arithmetic (5 * total >= 4 * max), not a float comparison.
  assert.equal(5 * 17 >= 4 * 22, false);
  assert.equal(5 * 18 >= 4 * 22, true);
});

test("a must at 1 fails even with a high total", () => {
  const s = summarizeRun(1, allTwo(1, { "c7-json-validates": 1 }));
  assert.equal(s.total, 19);
  assert.equal(s.mustsAt2, 7);
  assert.equal(s.pass, false);
});

test("a criterion the judge omitted counts as 0", () => {
  const s = summarizeRun(5, allTwo(5).filter((x) => x.id !== "c10-no-invented-elements"));
  assert.equal(s.total, 18);
  assert.equal(s.mustsAt2, 7);
  assert.equal(s.pass, false);
});

function sampleResults(): EvalResults {
  // The shape build/evals/results.json has since 2026-09-12: a models table
  // first, and every run and pair keyed on a model capability.
  return {
    models: { high: "opus", medium: "sonnet" },
    runs: [
      { prompt: 1, model_capability: "high", run: 1, dir: "build/evals/p1/high/run1", scores: allTwo(1), total: 20, max: 20, musts_at_2: 8, notes: "" },
      { prompt: 1, model_capability: "high", run: 2, dir: "build/evals/p1/high/run2", scores: allTwo(1, { "c3-chain-completeness": 1 }), total: 19, max: 20, musts_at_2: 8, notes: "" },
      { prompt: 1, model_capability: "medium", run: 1, dir: "build/evals/p1/medium/run1", scores: allTwo(1, { "c7-json-validates": 0 }), total: 18, max: 20, musts_at_2: 7, notes: "validator errors" },
      { prompt: 1, model_capability: "medium", run: 2, dir: "build/evals/p1/medium/run2", scores: allTwo(1), total: 20, max: 20, musts_at_2: 8, notes: "" },
    ],
    stability: [
      { prompt: 1, model_capability: "high", jaccard: 1, maxRows: 8, countDiffs: { H: 0, M: 1, L: 1 }, bound: 1.6, pass: true },
      { prompt: 1, model_capability: "medium", jaccard: 0.6, maxRows: 7, countDiffs: { H: 2, M: 0, L: 2 }, bound: 1.4, pass: false },
    ],
    critic: {
      missing: [{ area: "prompt 1 medium", detail: "run 1 never invoked validate.ts --write" }],
      blocking_candidates: ["medium fails prompt 1 on c7-json-validates"],
    },
  };
}

/** The title and results label the v1 document was generated with. */
const V1_OPTIONS = { title: "Eval results, v1", resultsLabel: "build/evals/results.json" };

test("renderReport lays out the per-prompt, stability, overall, and critic sections", () => {
  const md = renderReport(sampleResults(), V1_OPTIONS);
  assert.equal(md, renderReport(sampleResults()));
  assert.match(md, /^# Eval results, v1\n/);
  assert.match(md, /^Generated by `node tools\/eval-report\.ts` from `build\/evals\/results\.json`\. /m);
  assert.match(md, /### Prompt 1: design FMEA of a checkout service with a payment gateway and a pricing service/);
  assert.match(md, /\| high \| 1 \| 20 \/ 20 \| 8 \/ 8 \| pass \|/);
  assert.match(md, /\| high \| 2 \| 19 \/ 20 \| 8 \/ 8 \| pass \|/);
  assert.match(md, /\| medium \| 1 \| 18 \/ 20 \| 7 \/ 8 \| FAIL \|/);
  assert.match(md, /- high run 2, c3-chain-completeness = 1: ok/);
  assert.match(md, /\| 1 \| high \| 1\.000 \| 8 \| 1\.600 \| H: 0, M: 1, L: 1 \| pass \|/);
  assert.match(md, /\| 1 \| medium \| 0\.600 \| 7 \| 1\.400 \| H: 2, M: 0, L: 2 \| FAIL \|/);
  assert.match(md, /\| 1 \| high \| pass \| pass \| pass \| pass \|/);
  assert.match(md, /\| 1 \| medium \| FAIL \| pass \| FAIL \| FAIL \|/);
  assert.match(md, /Judge notes:\n\n- medium run 1: validator errors/);
  assert.match(md, /- prompt 1 medium: run 1 never invoked validate\.ts --write/);
  assert.match(md, /- medium fails prompt 1 on c7-json-validates/);
});

test("renderReport prints None. for an empty critic list and FAIL for a missing stability entry", () => {
  const r = sampleResults();
  r.critic = { missing: [], blocking_candidates: [] };
  r.stability = [];
  const md = renderReport(r);
  assert.match(md, /### Missing\n\nNone\./);
  assert.match(md, /### Blocking candidates\n\nNone\./);
  assert.match(md, /\| 1 \| high \| — \| — \| — \| — \| FAIL \(no result\) \|/);
});

test("an unjudged run, a dead stability pair, and the unverified list render as UNVERIFIED, not as measured failures", () => {
  const r = sampleResults();
  r.runs[2] = { ...r.runs[2], scores: [], total: 0, max: 20, musts_at_2: 0, notes: "judge returned no result on three attempts", unverified: true };
  r.stability[1] = { ...r.stability[1], jaccard: 0, maxRows: 0, countDiffs: { H: 0, M: 0, L: 0 }, bound: 0, pass: false, unverified: true };
  r.unverified = [{ unit: "judge p1 medium run1", detail: "the judge agent returned nothing on three attempts" }];
  const md = renderReport(r);
  assert.match(md, /\| medium \| 1 \| 0 \/ 20 \| 0 \/ 8 \| UNVERIFIED \|/);
  assert.match(md, /- medium run 1: judge returned no result on three attempts/);
  assert.match(md, /\| 1 \| medium \| 0\.000 \| 0 \| 0\.000 \| H: 0, M: 0, L: 0 \| UNVERIFIED \|/);
  assert.match(md, /\| 1 \| medium \| UNVERIFIED \| pass \| UNVERIFIED \| UNVERIFIED \|/);
  assert.match(md, /## Unverified units\n\nJudges, stability pairs/);
  assert.match(md, /- judge p1 medium run1: the judge agent returned nothing on three attempts/);
  const clean = renderReport(sampleResults());
  assert.doesNotMatch(clean, /UNVERIFIED/);
  assert.match(clean, /## Unverified units\n\n[^\n]*\n\nNone\./);
});

test("renderReport prints the title and the results label it is given", () => {
  const md = renderReport(sampleResults(), { title: "Eval results, element kinds", resultsLabel: "/tmp/x/results.json" });
  assert.match(md, /^# Eval results, element kinds\n/);
  assert.match(md, /^Generated by `node tools\/eval-report\.ts` from `\/tmp\/x\/results\.json`\. /m);
});

/** sampleResults' prompt-1 runs scored on c13 as well, c13 at 1 on high run 1. */
function withC13(rubric?: number): EvalResults {
  const r = sampleResults();
  if (rubric !== undefined) r.rubric = rubric;
  r.runs = r.runs.map((run, i) => ({
    ...run,
    scores: [...run.scores, { id: "c13-element-typing", score: i === 0 ? 1 : 2, evidence: "pricing typed in_scope" }],
  }));
  return r;
}

test("a results file with rubric 2 scores prompt 1 on c13 out of 22; one without rubric reads as rubric 1, out of 20", () => {
  const two = renderReport(withC13(2));
  assert.match(two, /\| high \| 1 \| 21 \/ 22 \| 8 \/ 8 \| pass \|/);
  assert.match(two, /\| high \| 2 \| 21 \/ 22 \| 8 \/ 8 \| pass \|/);
  assert.match(two, /- high run 1, c13-element-typing = 1: pricing typed in_scope/);
  const one = renderReport(withC13());
  assert.match(one, /\| high \| 1 \| 20 \/ 20 \| 8 \/ 8 \| pass \|/);
  assert.doesNotMatch(one, /\/ 22/);
  assert.doesNotMatch(one, /c13-element-typing/);
});

test("a results file with rubric 3 scores prompt 1 out of 26 and lists a c15 below 2; read as rubric 2 it scores out of 22", () => {
  const r = sampleResults();
  r.runs = r.runs.map((run, i) => ({ ...run, scores: allTwo(1, i === 0 ? { "c15-cross-service-trace": 1 } : {}, 3) }));
  r.rubric = 3;
  const three = renderReport(r);
  assert.match(three, /\| high \| 1 \| 25 \/ 26 \| 8 \/ 8 \| pass \|/);
  assert.match(three, /\| high \| 2 \| 26 \/ 26 \| 8 \/ 8 \| pass \|/);
  assert.match(three, /- high run 1, c15-cross-service-trace = 1: ok/);
  r.rubric = 2;
  const two = renderReport(r);
  assert.match(two, /\| high \| 1 \| 22 \/ 22 \| 8 \/ 8 \| pass \|/);
  assert.doesNotMatch(two, /c15-cross-service-trace/);
});

test("the stability table gains a Typing column only when an entry carries typing", () => {
  const plain = renderReport(sampleResults());
  assert.match(plain, /^\| Prompt \| Model capability \| Jaccard \| Max rows \| Bound \| Count diffs \| Pass \|$/m);
  assert.doesNotMatch(plain, /Typing/);
  const r = sampleResults();
  r.stability[0] = { ...r.stability[0], typing: { shared: 3, agreeing: 3, pass: true } };
  r.stability[1] = { ...r.stability[1], typing: { shared: 3, agreeing: 2, pass: false } };
  const typed = renderReport(r);
  assert.match(typed, /^\| Prompt \| Model capability \| Jaccard \| Max rows \| Bound \| Count diffs \| Typing \| Pass \|\n\|---\|---\|---\|---\|---\|---\|---\|---\|$/m);
  assert.match(typed, /\| 1 \| high \| 1\.000 \| 8 \| 1\.600 \| H: 0, M: 1, L: 1 \| 3\/3 pass \| pass \|/);
  assert.match(typed, /\| 1 \| medium \| 0\.600 \| 7 \| 1\.400 \| H: 2, M: 0, L: 2 \| 2\/3 FAIL \| FAIL \|/);
  // An entry without typing in a file where another has it prints a dash.
  const mixed = sampleResults();
  mixed.stability[0] = { ...mixed.stability[0], typing: { shared: 3, agreeing: 3, pass: true } };
  assert.match(renderReport(mixed), /\| 1 \| medium \| 0\.600 \| 7 \| 1\.400 \| H: 2, M: 0, L: 2 \| — \| FAIL \|/);
  // A missing entry in a typed file keeps the row's column count.
  const missing = sampleResults();
  missing.stability = [{ ...missing.stability[0], typing: { shared: 3, agreeing: 3, pass: true } }];
  assert.match(renderReport(missing), /\| 1 \| medium \| — \| — \| — \| — \| — \| FAIL \(no result\) \|/);
});

test("CRITERIA matches the rubric: same ids in the same order, same must flags", () => {
  const rubric = readFileSync(
    join(import.meta.dirname, "..", "skills", "fmea-software", "evals", "rubric.md"),
    "utf8",
  );
  const headings = [...rubric.matchAll(/^### (c\d+-[a-z0-9-]+)( \(must[^)]*\))?/gm)].map((m) => ({
    id: m[1],
    must: m[2] !== undefined,
  }));
  assert.deepEqual(headings.map((h) => h.id), CRITERIA.map((c) => c.id));
  assert.deepEqual(headings.map((h) => h.must), CRITERIA.map((c) => c.must));
  assert.match(rubric, /prompts 1 and 5 are scored on c1 to c10 \(maximum 20, 8 musts\)/);
  assert.match(rubric, /prompt 6 on c1 to c4 and c6 to c11 \(maximum 20, 8 musts\)/);
  assert.match(rubric, /prompt 7 on c1 to c10 and c12 \(maximum 22, 9 musts\)/);
  assert.match(rubric, /Under rubric 2, prompts 1 and 6 add c13 \(maximum 22, 8 musts\)\./);
  assert.match(rubric, /^\*\*Rubric version\.\*\* This is rubric 3, dated 2026-10-09: it adds c14 and c15\./m);
  assert.match(rubric, /rubric 2, dated 2026-10-07, which added c13, and is read without c14 and c15/);
  assert.match(rubric, /^### c13-element-typing \(prompts 1 and 6; rubric 2\)$/m);
  assert.deepEqual(CRITERIA.find((c) => c.id === "c13-element-typing"), { id: "c13-element-typing", must: false, prompts: [1, 6], rubric: 2 });
  // c5 carries its applicability on its heading the way c11 and c12 do; the
  // heading, the paragraph above, and both CRITERIA copies have to agree.
  assert.match(rubric, /^### c5-provisional-rescore \(must, not prompt 6\)$/m);
  assert.deepEqual(CRITERIA.find((c) => c.id === "c5-provisional-rescore")?.prompts, [1, 5, 7]);
  assert.match(rubric, /Under rubric 3, prompt 1 adds c14 and c15 \(maximum 26, 8 musts\) and prompt 6 adds c14 \(maximum 24, 8 musts\); prompt 7 is unchanged \(maximum 22, 9 musts\)\./);
  assert.match(rubric, /^### c14-edges-and-codebases \(prompts 1 and 6; rubric 3\)$/m);
  assert.match(rubric, /^### c15-cross-service-trace \(prompt 1; rubric 3\)$/m);
  assert.match(rubric, /only c3, c8, c13, c14 and c15 are not musts/);
  assert.match(rubric, /21 of 26, since 20\.8 rounds up/);
  assert.match(rubric, /20 of 24, since 19\.2 rounds up/);
  assert.deepEqual(CRITERIA.find((c) => c.id === "c14-edges-and-codebases"), { id: "c14-edges-and-codebases", must: false, prompts: [1, 6], rubric: 3 });
  assert.deepEqual(CRITERIA.find((c) => c.id === "c15-cross-service-trace"), { id: "c15-cross-service-trace", must: false, prompts: [1], rubric: 3 });
  const workflow = readFileSync(join(import.meta.dirname, "workflows", "evals.js"), "utf8");
  assert.match(workflow, /^const RUBRIC = 3$/m);
  assert.match(workflow, /node \$\{SKILL\}\/scripts\/update-check\.ts \$\{SKILL\}\/evals\/fixtures\/update\/before\.fmea\.json \$\{item\.dir\}\/analysis\.json/);
  const fromWorkflow = [...workflow.matchAll(/\{ id: '(c\d+-[a-z0-9-]+)', must: (true|false), prompts: (\[[0-9, ]*\])(?:, rubric: (\d+))? \}/g)]
    .map((m) => ({ id: m[1], must: m[2] === "true", prompts: JSON.parse(m[3]), rubric: m[4] === undefined ? undefined : Number(m[4]) }));
  assert.deepEqual(fromWorkflow, CRITERIA.map((c) => ({ id: c.id, must: c.must, prompts: c.prompts, rubric: c.rubric })));
});

test("CLI reads --results and writes --out", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-report-"));
  try {
    const results = join(dir, "results.json");
    const out = join(dir, "eval-results.md");
    writeFileSync(results, JSON.stringify(sampleResults()));
    const r = spawnSync(process.execPath, [join(import.meta.dirname, "eval-report.ts"), "--results", results, "--out", out], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `wrote ${out}\n`);
    assert.equal(readFileSync(out, "utf8"), renderReport(sampleResults(), { title: "Eval results, v1", resultsLabel: results }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --title sets the first line; the header names the results path relative to the repository root, or absolute outside it", () => {
  const script = join(import.meta.dirname, "eval-report.ts");
  const root = join(import.meta.dirname, "..");
  const outside = mkdtempSync(join(tmpdir(), "eval-report-title-"));
  mkdirSync(join(root, "build"), { recursive: true });
  const inside = mkdtempSync(join(root, "build", "eval-report-title-"));
  try {
    for (const dir of [outside, inside]) {
      const results = join(dir, "results.json");
      const out = join(dir, "eval-results.md");
      writeFileSync(results, JSON.stringify(sampleResults()));
      const r = spawnSync(process.execPath, [script, "--title", "Eval results, element kinds", "--results", results, "--out", out], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      const md = readFileSync(out, "utf8");
      assert.equal(md.split("\n")[0], "# Eval results, element kinds");
      const label = dir === inside ? `build/${basename(inside)}/results.json` : results;
      assert.ok(md.includes(`Generated by \`node tools/eval-report.ts\` from \`${label}\`. `), md.slice(0, 400));
    }
  } finally {
    rmSync(outside, { recursive: true, force: true });
    rmSync(inside, { recursive: true, force: true });
  }
});

test("CLI exits 3 when the results file is missing and 1 on an unknown flag", () => {
  const script = join(import.meta.dirname, "eval-report.ts");
  const missing = spawnSync(process.execPath, [script, "--results", "/nonexistent/results.json"], { encoding: "utf8" });
  assert.equal(missing.status, 3);
  assert.match(missing.stderr, /^error IO_READ: cannot read \/nonexistent\/results\.json/);
  const usage = spawnSync(process.execPath, [script, "--bogus"], { encoding: "utf8" });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /^error USAGE: /);
});

test("multi-paragraph judge notes and evidence stay inside their bullet", () => {
  // Judges routinely return several paragraphs. Interpolated raw, everything after
  // the first blank line left the bullet and read as the document's own prose.
  const r = sampleResults();
  r.runs[2] = {
    ...r.runs[2],
    scores: allTwo(1, { "c7-json-validates": 0 }).map((s) =>
      s.id === "c7-json-validates" ? { ...s, evidence: "validate.ts exited 2\n\nand the second attempt\n  was denied" } : s,
    ),
    notes: "validator errors\n\nA second paragraph.\nA wrapped line.",
  };
  const md = renderReport(r);
  assert.match(md, /- medium run 1, c7-json-validates = 0: validate\.ts exited 2 and the second attempt was denied\n/);
  assert.match(md, /- medium run 1: validator errors A second paragraph\. A wrapped line\.\n/);
  const judgeNotes = md.split("Judge notes:\n\n")[1].split("\n\n")[0];
  assert.equal(judgeNotes.split("\n").filter((l) => l.trim() === "").length, 0, judgeNotes);
  assert.equal(judgeNotes.split("\n").every((l) => l.startsWith("- ")), true, judgeNotes);
});

test("judge text prints repository paths relative to the repository root", () => {
  // Judges quote the paths they read, absolute under this machine's checkout.
  // The generated document is committed and read from wherever the repository
  // sits, so the root prefix comes off before the text reaches a bullet.
  const root = join(import.meta.dirname, "..");
  const r = sampleResults();
  r.runs[2] = {
    ...r.runs[2],
    scores: allTwo(1, { "c7-json-validates": 0 }).map((s) =>
      s.id === "c7-json-validates"
        ? { ...s, evidence: `${root}/build/evals/p1/medium/run1/validate.json lists two errors` }
        : s,
    ),
    notes: `see ${root}/build/evals/p1/medium/run1/analysis.json`,
  };
  r.critic = {
    missing: [{ area: "prompt 1 medium", detail: `${root}/build/evals/p1/medium/run1/report.html is missing` }],
    blocking_candidates: [`${root}/build/evals/p1/medium/run1 produced no analysis.json`],
  };
  r.unverified = [{ unit: "judge p1 medium run1", detail: `no judge read ${root}/build/evals/p1/medium/run1` }];
  const md = renderReport(r);
  assert.match(md, /- medium run 1, c7-json-validates = 0: build\/evals\/p1\/medium\/run1\/validate\.json lists two errors\n/);
  assert.match(md, /- medium run 1: see build\/evals\/p1\/medium\/run1\/analysis\.json\n/);
  assert.match(md, /- prompt 1 medium: build\/evals\/p1\/medium\/run1\/report\.html is missing\n/);
  assert.match(md, /- build\/evals\/p1\/medium\/run1 produced no analysis\.json\n/);
  assert.match(md, /- judge p1 medium run1: no judge read build\/evals\/p1\/medium\/run1\n/);
  assert.equal(md.includes(root), false, md);
});

test("the stability table prints jaccard and bound to three decimals", () => {
  // A column that mixes `1` with `0.778` reads as two different measurements,
  // and a Jaccard printed as `1` hides how close it sits to the 0.8 floor.
  const r = sampleResults();
  r.stability[0] = { ...r.stability[0], jaccard: 1, bound: 2 };
  const md = renderReport(r);
  assert.match(md, /\| 1 \| high \| 1\.000 \| 8 \| 2\.000 \| H: 0, M: 1, L: 1 \| pass \|/);
});

test("the below-2 list skips a stored score for a criterion the prompt is not scored on", () => {
  // build/evals/results.json still holds a c5 score on every prompt-6 run, judged
  // before ruling 9 took c5 out of prompt 6. summarizeRun ignores such a score;
  // the list under the table has to ignore it too, or the document prints a
  // criterion below 2 that the run was never scored on.
  const r: EvalResults = {
    models: { high: "opus", medium: "sonnet", low: "haiku" },
    runs: [{
      prompt: 6, model_capability: "opus", run: 1, dir: "build/evals/p6/opus/run1",
      scores: [
        ...allTwo(6, { "c3-chain-completeness": 1 }),
        { id: "c5-provisional-rescore", score: 1, evidence: "judged before ruling 9" },
      ],
      total: 19, max: 20, musts_at_2: 8, notes: "",
    }],
    stability: [],
    critic: { missing: [], blocking_candidates: [] },
  };
  const md = renderReport(r);
  assert.match(md, /- opus run 1, c3-chain-completeness = 1: ok/);
  assert.doesNotMatch(md, /run 1, c5-provisional-rescore/);
});

test("a stability number is truncated, so a value below a threshold never renders at the threshold", () => {
  // A rounded 0.7996 printed as 0.800 beside its FAIL reads as a pass that the
  // table then contradicts.
  const r = sampleResults();
  r.stability[1] = { ...r.stability[1], jaccard: 0.7996, bound: 1.4999, pass: false };
  const md = renderReport(r);
  assert.match(md, /\| 1 \| medium \| 0\.799 \| 7 \| 1\.499 \| H: 2, M: 0, L: 2 \| FAIL \|/);
});

test("a sibling checkout's path survives the repository-prefix stripping", () => {
  // The root came off wherever it appeared, so a judge quoting a sibling checkout
  // (<root>-research/x) had it rendered as .-research/x.
  const root = join(import.meta.dirname, "..");
  const r = sampleResults();
  r.runs[2] = {
    ...r.runs[2],
    notes: `compared with ${root}-research/x and ${root}/build/evals/p1/medium/run1; the checkout is ${root}.`,
  };
  const md = renderReport(r);
  assert.equal(
    md.includes(`- medium run 1: compared with ${root}-research/x and build/evals/p1/medium/run1; the checkout is .`),
    true,
    md,
  );
});

function prompt6Scores(c3: number): RunScore[] {
  // A prompt-6 run as build/evals/results.json holds it: the prompt's ten
  // criteria plus the c5 the judge scored before ruling 9 took c5 out of prompt 6.
  return [
    ...allTwo(6, { "c3-chain-completeness": c3 }),
    { id: "c5-provisional-rescore", score: 2, evidence: "judged before ruling 9" },
  ];
}

function staleShapedResults(): EvalResults {
  // The shape build/evals/results.json has today: the four c1 = 2 runs awarded
  // before ruling 3, the four prompt-6 c3 scores awarded before ruling 8, the c5
  // score every prompt-6 run still carries from before ruling 9, and four critic
  // entries — two the stale-critic bullets answer, the half-answered c1 one, and
  // the pair-tally entry the closing paragraph reconciles.
  const runs: RunResult[] = [];
  for (const [prompt, model, run] of [[1, "opus", 2], [1, "sonnet", 1], [5, "opus", 2], [5, "sonnet", 2]] as [number, string, number][]) {
    runs.push({ prompt, model_capability: model, run, dir: `build/evals/p${prompt}/${model}/run${run}`, scores: allTwo(prompt), total: 20, max: 20, musts_at_2: 8, notes: "" });
  }
  for (const model of ["opus", "sonnet"]) {
    for (const run of [1, 2]) {
      runs.push({ prompt: 6, model_capability: model, run, dir: `build/evals/p6/${model}/run${run}`, scores: prompt6Scores(1), total: 19, max: 20, musts_at_2: 8, notes: "" });
    }
  }
  // The archived results file predates the models field; the default table
  // stands in here, and nothing in the stale machinery reads it.
  return {
    models: { high: "opus", medium: "sonnet", low: "haiku" },
    runs,
    stability: [],
    critic: {
      missing: [
        { area: "Overall pair tally (rubric §Pass rule, design §15 criterion 2)", detail: "only 2 of 8 (prompt, model) pairs pass, and both are prompt 6" },
        { area: 'rubric §"Unattended runs" — no substitute defined for c5', detail: "the rubric defines no unattended substitute for c5" },
        { area: "Stability metric — elements[].name vs elements[].id", detail: "the Jaccard is computed over free-text names" },
        { area: "c1-missing-inputs-asked (must) — prompts 1 and 5, applied inconsistently", detail: "the planted-gap clause needs a ruling" },
      ],
      blocking_candidates: [],
    },
  };
}

const ALL_C1 = ["prompt 1 opus run 2", "prompt 1 sonnet run 1", "prompt 5 opus run 2", "prompt 5 sonnet run 2"];
const ALL_C3 = ["prompt 6 opus run 1", "prompt 6 opus run 2", "prompt 6 sonnet run 1", "prompt 6 sonnet run 2"];

test("the two stale sections are printed only while the results they describe still stand", () => {
  const stale = staleShapedResults();
  const parts = staleScoreParts(stale);
  assert.deepEqual(parts, { c1: ALL_C1, c3: ALL_C3, ruling9: true, c1Unverified: [], c3Unverified: [] });
  const criticParts = staleCriticParts(stale);
  assert.equal(criticParts.answered.length, 2);
  assert.equal(criticParts.halfAnswered, true);
  assert.equal(criticParts.pairTally, true);
  const md = renderReport(stale);
  assert.match(md, /## Scores recorded before rulings 3, 8 and 9/);
  assert.equal(md.includes(staleScoresC1(parts.c1)), true);
  assert.equal(md.includes(staleScoresC3(parts.c3)), true);
  assert.equal(md.includes(STALE_SCORES_RULING9), true);
  assert.equal(md.includes(STALE_SCORES_CLOSING), true);
  assert.match(md, /### What the critic's lists predate/);
});

test("re-judging one of the four c1 runs narrows the bullet to the other three", () => {
  // The failure this pins: a bullet gated on all four of its runs at once
  // vanished when one was re-judged, taking the caveat on the other three with
  // it — and with it the sentence that no pair may be accepted on the c1 numbers.
  const cured = staleShapedResults();
  cured.runs = cured.runs.map((r) =>
    r.prompt === 1 && r.model_capability === "opus" && r.run === 2
      ? { ...r, scores: allTwo(1, { "c1-missing-inputs-asked": 0 }) }
      : r,
  );
  const parts = staleScoreParts(cured);
  assert.deepEqual(parts.c1, ALL_C1.slice(1));
  const md = renderReport(cured);
  assert.match(md, /## Scores recorded before rulings 3, 8 and 9/);
  assert.equal(md.includes(staleScoresC1(parts.c1)), true);
  assert.equal(md.includes(STALE_SCORES_CLOSING), true);
  assert.match(md, /\(a \*\*must\*\*\) on prompt 1 sonnet run 1, prompt 5 opus run 2 and prompt 5 sonnet run 2\./);
  assert.doesNotMatch(md, /prompt 1 opus run 2's assumption is not carried/);
  assert.match(md, /prompt 1 sonnet run 1 records no assumption naming it/);
});

test("re-judging three of the four c1 runs leaves the bullet naming the one that stands", () => {
  const cured = staleShapedResults();
  cured.runs = cured.runs.map((r) =>
    r.prompt === 5 || (r.prompt === 1 && r.model_capability === "sonnet")
      ? { ...r, scores: allTwo(r.prompt, { "c1-missing-inputs-asked": 0 }) }
      : r,
  );
  const parts = staleScoreParts(cured);
  assert.deepEqual(parts.c1, ["prompt 1 opus run 2"]);
  const md = renderReport(cured);
  assert.equal(md.includes(staleScoresC1(parts.c1)), true);
  assert.equal(md.includes(STALE_SCORES_CLOSING), true);
  assert.match(md, /\(a \*\*must\*\*\) on prompt 1 opus run 2\. Each scored 2 under the pre-ruling text\./);
  assert.match(md, /prompt 1 opus run 2's assumption is not carried/);
  assert.doesNotMatch(md, /records no assumption naming it/);
});

test("re-judging c1 on all four runs leaves the c3 bullet and the ruling-9 sentence standing", () => {
  const cured = staleShapedResults();
  cured.runs = cured.runs.map((r) =>
    r.prompt === 6 ? r : { ...r, scores: allTwo(r.prompt, { "c1-missing-inputs-asked": 0 }) },
  );
  const parts = staleScoreParts(cured);
  assert.deepEqual(parts, { c1: [], c3: ALL_C3, ruling9: true, c1Unverified: [], c3Unverified: [] });
  const md = renderReport(cured);
  assert.match(md, /## Scores recorded before rulings 8 and 9/);
  assert.doesNotMatch(md, /`c1-missing-inputs-asked` \(a \*\*must\*\*\)/);
  assert.equal(md.includes(STALE_SCORES_CLOSING), false);
  assert.equal(md.includes(staleScoresC3(parts.c3)), true);
  assert.equal(md.includes(STALE_SCORES_RULING9), true);
});

test("re-judging one of the four prompt-6 c3 scores narrows the bullet to the other three", () => {
  const cured = staleShapedResults();
  cured.runs = cured.runs.map((r) =>
    r.prompt === 6 && r.model_capability === "opus" && r.run === 1 ? { ...r, scores: prompt6Scores(2) } : r,
  );
  const parts = staleScoreParts(cured);
  assert.deepEqual(parts.c3, ALL_C3.slice(1));
  const md = renderReport(cured);
  assert.match(md, /## Scores recorded before rulings 3, 8 and 9/);
  assert.equal(md.includes(staleScoresC3(parts.c3)), true);
  assert.match(md, /\(not a must\) on prompt 6 opus run 2, prompt 6 sonnet run 1 and prompt 6 sonnet run 2\./);
  assert.doesNotMatch(md, /on prompt 6 opus run 1/);
});

test("re-judging three of the four prompt-6 c3 scores leaves the bullet naming the one that stands", () => {
  const cured = staleShapedResults();
  cured.runs = cured.runs.map((r) =>
    r.prompt === 6 && !(r.model_capability === "sonnet" && r.run === 1) ? { ...r, scores: prompt6Scores(2) } : r,
  );
  const parts = staleScoreParts(cured);
  assert.deepEqual(parts.c3, ["prompt 6 sonnet run 1"]);
  const md = renderReport(cured);
  assert.equal(md.includes(staleScoresC3(parts.c3)), true);
  assert.match(md, /\(not a must\) on prompt 6 sonnet run 1\. It scored 0 or 1 because/);
  assert.match(md, /prompt 6 sonnet run 1 asks in as many words/);
});

test("re-judging c3 on all four prompt-6 runs leaves the c1 bullet, its closing paragraph and the ruling-9 sentence", () => {
  const cured = staleShapedResults();
  cured.runs = cured.runs.map((r) => (r.prompt === 6 ? { ...r, scores: prompt6Scores(2) } : r));
  const parts = staleScoreParts(cured);
  assert.deepEqual(parts, { c1: ALL_C1, c3: [], ruling9: true, c1Unverified: [], c3Unverified: [] });
  const md = renderReport(cured);
  assert.match(md, /## Scores recorded before rulings 3 and 9/);
  assert.doesNotMatch(md, /`c3-chain-completeness` \(not a must\)/);
  assert.equal(md.includes(staleScoresC1(parts.c1)), true);
  assert.equal(md.includes(STALE_SCORES_CLOSING), true);
  assert.equal(md.includes(STALE_SCORES_RULING9), true);
});

test("a roster run whose judge never returned is not read as re-judged in the c1 part", () => {
  // The first finding the Task 32 gate left open: the c1 roster filtered on
  // score === 2 alone, so an unjudged run (scores: [], unverified: true) counted
  // as cured and the closing paragraph printed "every c1 score ruling 3 governs
  // has since been re-judged" above tables printing UNVERIFIED for those runs.
  const holed = staleShapedResults();
  holed.runs = holed.runs.map((r) =>
    r.prompt === 1 && r.model_capability === "opus" && r.run === 2
      ? { ...r, scores: [], total: 0, max: 20, musts_at_2: 0, notes: "judge returned no result on three attempts", unverified: true }
      : r,
  );
  const parts = staleScoreParts(holed);
  assert.deepEqual(parts.c1, ALL_C1.slice(1));
  const md = renderReport(holed);
  assert.match(md, /## Scores recorded before rulings 3, 8 and 9/);
  assert.doesNotMatch(md, /has since been re-judged/);
  assert.doesNotMatch(md, /every c1 score ruling 3 governs/);
});

/** A run as build/evals/results.json holds one whose judge never returned. */
function unjudged(r: RunResult): RunResult {
  return { ...r, scores: [], total: 0, musts_at_2: 0, notes: "judge returned no result on three attempts", unverified: true };
}

test("with all four c1 roster runs unjudged the closing paragraph names them unverified, not re-judged", () => {
  // The fail-open the 2026-09-29 audit found behind the 2026-09-12 fix: an unjudged
  // run was left out of parts.c1, and an empty parts.c1 is exactly what the closing
  // paragraph read as cured, so it printed "every c1 score ruling 3 governs has
  // since been re-judged" above tables printing UNVERIFIED for those four runs.
  const holed = staleShapedResults();
  holed.runs = holed.runs.map((r) => (r.prompt === 6 ? r : unjudged(r)));
  const parts = staleScoreParts(holed);
  assert.deepEqual(parts.c1, []);
  assert.deepEqual(parts.c1Unverified, ALL_C1);
  assert.deepEqual(parts.c3Unverified, []);
  const closing = staleCriticClosing(holed);
  assert.equal(renderReport(holed).includes(closing), true);
  assert.doesNotMatch(closing, /has since been re-judged/);
  assert.doesNotMatch(closing, /every c1 score ruling 3 governs/);
  assert.match(
    closing,
    /prompt 1 opus run 2, prompt 1 sonnet run 1, prompt 5 opus run 2 and prompt 5 sonnet run 2 are unverified for c1:/,
  );
  for (const run of ALL_C1) assert.equal(closing.includes(run), true, run);
  assert.match(closing, /counted neither on the superseded reading nor among the pairs resting on c1 scores the current rubric produced\./);
  // No run is left for either tally to hold.
  assert.doesNotMatch(closing, /still hold the c1 score awarded before ruling 3/);
  assert.doesNotMatch(closing, /The Overall table marks/);
});

test("with two c1 roster runs unjudged and two still at 2 the closing names the two unverified and counts them in neither tally", () => {
  const holed = staleShapedResults();
  holed.runs = holed.runs.map((r) => (r.prompt === 1 ? unjudged(r) : r));
  const parts = staleScoreParts(holed);
  assert.deepEqual(parts.c1, ["prompt 5 opus run 2", "prompt 5 sonnet run 2"]);
  assert.deepEqual(parts.c1Unverified, ["prompt 1 opus run 2", "prompt 1 sonnet run 1"]);
  const closing = staleCriticClosing(holed);
  assert.doesNotMatch(closing, /has since been re-judged/);
  // The superseded tally names the two runs still at 2 and neither unjudged one.
  assert.match(
    closing,
    /The Overall table's pass count is neither tally: prompt 5 opus run 2 and prompt 5 sonnet run 2 still hold the c1 score awarded before ruling 3, so the pairs those runs belong to are counted in it on a superseded reading, while the pairs with no run in that list or among the unverified runs named next rest on c1 scores the current rubric produced\./,
  );
  assert.match(
    closing,
    /prompt 1 opus run 2 and prompt 1 sonnet run 1 are unverified for c1: [^.]*so whether they still hold the score awarded before ruling 3 is unknown, and the pairs they belong to are counted neither on the superseded reading nor among the pairs resting on c1 scores the current rubric produced\./,
  );
  // The unjudged runs are named only in the unverified sentence.
  const tally = closing.split("The Overall table's pass count is neither tally:")[1].split(" are unverified for c1:")[0];
  assert.equal(tally.split("rest on c1 scores the current rubric produced.")[0].includes("prompt 1"), false, tally);
});

test("a c1 roster run missing from the file, or judged without a c1 entry, is unverified rather than re-judged", () => {
  const holed = staleShapedResults();
  holed.runs = holed.runs
    .filter((r) => !(r.prompt === 1 && r.model_capability === "opus" && r.run === 2))
    .map((r) =>
      r.prompt === 1 && r.model_capability === "sonnet" && r.run === 1
        ? { ...r, scores: allTwo(1).filter((s) => s.id !== "c1-missing-inputs-asked") }
        : r.prompt === 5
          ? { ...r, scores: allTwo(5, { "c1-missing-inputs-asked": 0 }) }
          : r,
    );
  const parts = staleScoreParts(holed);
  assert.deepEqual(parts.c1, []);
  assert.deepEqual(parts.c1Unverified, ["prompt 1 opus run 2", "prompt 1 sonnet run 1"]);
  const closing = staleCriticClosing(holed);
  assert.doesNotMatch(closing, /has since been re-judged/);
  assert.match(closing, /prompt 1 opus run 2 and prompt 1 sonnet run 1 are unverified for c1:/);
});

test("with the four prompt-6 c3 runs unjudged the closing never says every score rulings 3 and 8 govern was re-judged", () => {
  // The closing's last sentence read an empty parts.c3 as cured the same way.
  const holed = staleShapedResults();
  holed.runs = holed.runs.map((r) =>
    r.prompt === 6 ? unjudged(r) : { ...r, scores: allTwo(r.prompt, { "c1-missing-inputs-asked": 0 }) },
  );
  const parts = staleScoreParts(holed);
  assert.deepEqual(parts.c3, []);
  assert.deepEqual(parts.c3Unverified, ALL_C3);
  assert.deepEqual(parts.c1Unverified, []);
  const closing = staleCriticClosing(holed);
  // c1 was re-judged on all four runs, and the paragraph still says so.
  assert.match(closing, /every c1 score ruling 3 governs has since been re-judged/);
  assert.doesNotMatch(closing, /Every score rulings 3 and 8 govern has since been re-judged/);
  assert.match(
    closing,
    /prompt 6 opus run 1, prompt 6 opus run 2, prompt 6 sonnet run 1 and prompt 6 sonnet run 2 are unverified for c3: [^.]*so whether they still hold the score awarded before ruling 8 is unknown\./,
  );
  assert.match(
    closing,
    /No pair count in this document is shown to be the count on the current rubric: the runs named above as unverified have no judged score on the criterion ruling 8 governs\./,
  );
});

test("with every run of both rosters unjudged nothing in the closing paragraph says re-judged", () => {
  const holed = staleShapedResults();
  holed.runs = holed.runs.map(unjudged);
  const parts = staleScoreParts(holed);
  assert.deepEqual(parts, { c1: [], c3: [], ruling9: false, c1Unverified: ALL_C1, c3Unverified: ALL_C3 });
  const closing = staleCriticClosing(holed);
  assert.doesNotMatch(closing, /re-judged/);
  assert.match(closing, /are unverified for c1:/);
  assert.match(closing, /are unverified for c3:/);
  assert.match(
    closing,
    /No pair count in this document is shown to be the count on the current rubric: the runs named above as unverified have no judged score on the criteria rulings 3 and 8 govern\./,
  );
});

test("a roster that reaches some of its runs reports the ones it holds no judged score for", () => {
  // unreachableRosters reports a roster only when it reaches none of its runs, so
  // a roster reached by some runs and missing or unjudged on the others dropped
  // those from the section at the head of the document with nothing saying why.
  const holed = staleShapedResults();
  holed.runs = holed.runs
    .filter((r) => !(r.prompt === 6 && r.model_capability === "sonnet" && r.run === 2))
    .map((r) => (r.prompt === 1 && r.model_capability === "opus" && r.run === 2 ? unjudged(r) : r));
  assert.deepEqual(unscoredRosterRuns(holed), [
    { roster: "STALE_C1_RUNS", criterion: "c1-missing-inputs-asked", runs: ["prompt 1 opus run 2"] },
    { roster: "STALE_C3_RUNS", criterion: "c3-chain-completeness", runs: ["prompt 6 sonnet run 2"] },
  ]);
  const md = renderReport(holed);
  assert.match(md, /^## Checks that could not be evaluated$/m);
  assert.match(md, /- `STALE_C1_RUNS` \(c1-missing-inputs-asked\): prompt 1 opus run 2\.\n/);
  assert.match(md, /- `STALE_C3_RUNS` \(c3-chain-completeness\): prompt 6 sonnet run 2\.\n/);
  assert.match(md, /not because the check came back clear; the acceptance note rules on each one\./);
  // A roster that reaches none of its runs stays in the unreachable list alone.
  assert.deepEqual(unscoredRosterRuns(sampleResults()), []);
  assert.deepEqual(unscoredRosterRuns(staleShapedResults()), []);
});

test("a prompt-6 run whose judge never returned is not named in the c3 bullet", () => {
  // A judge that returned nothing leaves `scores: []` and `unverified: true`, and
  // the table prints UNVERIFIED for that run. Scanning every prompt-6 run for a c3
  // below 2 with a missing score read as 0 named such a run as having scored 0 or 1
  // before ruling 8: a measured pre-ruling score for a run that was never judged.
  const cured = staleShapedResults();
  cured.runs = cured.runs.map((r) =>
    r.prompt === 6 && r.model_capability === "opus" && r.run === 1
      ? { ...r, scores: [], total: 0, max: 20, musts_at_2: 0, notes: "judge returned no result on three attempts", unverified: true }
      : r,
  );
  const parts = staleScoreParts(cured);
  assert.deepEqual(parts.c3, ALL_C3.slice(1));
  const md = renderReport(cured);
  assert.match(md, /\| opus \| 1 \| 0 \/ 20 \| 0 \/ 8 \| UNVERIFIED \|/);
  assert.equal(md.includes(staleScoresC3(parts.c3)), true);
  assert.doesNotMatch(md, /on prompt 6 opus run 1/);
});

test("the c5-verdicts sentence prints only while the runs it names still hold c5 = 1", () => {
  // The third finding the Task 32 gate left open: the sentence had no gate at
  // all, and re-judging c5 on those runs is an expected next action.
  const holding = staleShapedResults();
  holding.runs.push({ prompt: 1, model_capability: "sonnet", run: 2, dir: "build/evals/p1/sonnet/run2", scores: allTwo(1, { "c5-provisional-rescore": 1 }), total: 19, max: 20, musts_at_2: 7, notes: "" });
  const md = renderReport(holding);
  assert.match(md, /Its c5 verdicts stand — prompt 1 sonnet run 2 still scores c5 = 1 in the tables above\./);
  const cured = staleShapedResults();
  cured.runs.push({ prompt: 1, model_capability: "sonnet", run: 2, dir: "build/evals/p1/sonnet/run2", scores: allTwo(1), total: 20, max: 20, musts_at_2: 8, notes: "" });
  assert.doesNotMatch(renderReport(cured), /Its c5 verdicts stand/);
  // And the default fixture, which holds none of the four runs, never prints it.
  assert.doesNotMatch(renderReport(staleShapedResults()), /Its c5 verdicts stand/);
});

test("a re-judged results file and a re-run critic drop the stale sections by themselves", () => {
  const moved = staleShapedResults();
  // c1 re-judged on the four runs ruling 3 governs, c3 re-judged and the c5 entry
  // gone on the four prompt-6 runs, and the four critic entries gone.
  moved.runs = moved.runs.map((r) =>
    r.prompt === 6
      ? { ...r, scores: allTwo(6) }
      : { ...r, scores: allTwo(r.prompt, { "c1-missing-inputs-asked": 0 }) },
  );
  moved.critic = { missing: [{ area: "SKILL.md — no coverage rule", detail: "unanswered" }], blocking_candidates: [] };
  assert.deepEqual(staleScoreParts(moved), { c1: [], c3: [], ruling9: false, c1Unverified: [], c3Unverified: [] });
  assert.deepEqual(staleCriticParts(moved), { answered: [], halfAnswered: false, pairTally: false });
  const md = renderReport(moved);
  assert.doesNotMatch(md, /## Scores recorded before/);
  assert.doesNotMatch(md, /### What the critic's lists predate/);
  // Only the stale prose goes: the critic's own lists and the tables stay.
  assert.match(md, /### Missing\n\n- SKILL\.md — no coverage rule: unanswered/);
  assert.match(md, /## Scores per prompt/);
});

test("a critic entry that has been answered and removed takes its own bullet and no other", () => {
  const stale = staleShapedResults();
  // Only the stability entry left: its bullet stays, the c5-substitute bullet, the
  // half-answered paragraph and the pair-tally paragraph go, and the intro stays.
  stale.critic = { missing: [stale.critic.missing[2]], blocking_candidates: [] };
  assert.equal(staleCriticParts(stale).answered.length, 1);
  assert.equal(staleCriticParts(stale).halfAnswered, false);
  assert.equal(staleCriticParts(stale).pairTally, false);
  const md = renderReport(stale);
  assert.match(md, /### What the critic's lists predate/);
  assert.match(md, /The critic below ran before/);
  assert.match(md, /These entries are answered:/);
  assert.match(md, /answered by ruling 4/);
  assert.doesNotMatch(md, /answered by ruling 2/);
  assert.doesNotMatch(md, /One entry is half-answered/);
  assert.doesNotMatch(md, /pair tallies in this document/);
});

test("the half-answered entry alone still prints the sentence that the critic predates the rulings", () => {
  // The failure this pins: the intro was gated on the answered bullets, so an
  // otherwise-cured critic left the half-answered paragraph under no sentence
  // saying when the critic ran.
  const stale = staleShapedResults();
  stale.critic = { missing: [stale.critic.missing[3]], blocking_candidates: [] };
  assert.deepEqual(staleCriticParts(stale), { answered: [], halfAnswered: true, pairTally: false });
  const md = renderReport(stale);
  assert.match(md, /### What the critic's lists predate/);
  assert.match(md, /The critic below ran before/);
  assert.match(md, /One entry is half-answered/);
  assert.doesNotMatch(md, /These entries are answered:/);
  assert.doesNotMatch(md, /pair tallies in this document/);
});

test("the pair-tally entry alone prints the intro and the paragraph that reconciles the tallies", () => {
  const stale = staleShapedResults();
  stale.critic = { missing: [stale.critic.missing[0]], blocking_candidates: [] };
  assert.deepEqual(staleCriticParts(stale), { answered: [], halfAnswered: false, pairTally: true });
  const md = renderReport(stale);
  assert.match(md, /### What the critic's lists predate/);
  assert.match(md, /The critic below ran before/);
  assert.match(md, /The pair tallies in this document/);
  assert.doesNotMatch(md, /These entries are answered:/);
  assert.doesNotMatch(md, /One entry is half-answered/);
});

test("the closing paragraph computes its pair counts from the results file, not from history", () => {
  const stale = staleShapedResults();
  const parts = staleScoreParts(stale);
  assert.deepEqual(parts, { c1: ALL_C1, c3: ALL_C3, ruling9: true, c1Unverified: [], c3Unverified: [] });
  const md = renderReport(stale);
  assert.equal(md.includes(staleCriticClosing(stale)), true);
  // With no stability entries the Overall table marks no pair pass, and the
  // closing paragraph says so: the counts are computed from this file, not
  // asserted from history (the second finding the Task 32 gate left open —
  // the old hard-coded "marks **4** pairs" printed above a table that
  // contradicted it).
  assert.match(md, /The Overall table marks \*\*0\*\* of 6 pairs pass\./);
  assert.doesNotMatch(md, /The Overall table marks \*\*4\*\*/);
  assert.doesNotMatch(md, /the count is \*\*2\*\* again/);
  assert.match(
    md,
    /No pair count in this document is the count after a re-judging on rulings 3 and 8: the runs the bullets at the head of this document name still hold their pre-ruling scores\./,
  );
  assert.doesNotMatch(md, /has since been re-judged/);
});

test("stability outcomes move the computed pair count and the split", () => {
  // The same fixture with the archived world's stability outcomes and its
  // missing runs filled in: the count and the resting/superseded split follow
  // the data, reproducing the historical 4 and 2 as computed values.
  const withStability = staleShapedResults();
  const st = (p: number, m: string, pass: boolean) => ({ prompt: p, model_capability: m, jaccard: pass ? 1 : 0.5, maxRows: 8, countDiffs: { H: 0, M: 0, L: 0 }, bound: 1.6, pass });
  withStability.stability = [
    st(1, "opus", true), st(1, "sonnet", false),
    st(5, "opus", true), st(5, "sonnet", false),
    st(6, "opus", true), st(6, "sonnet", true),
  ];
  for (const [p, m, r] of [[1, "opus", 1], [1, "sonnet", 2], [5, "opus", 1], [5, "sonnet", 1]] as [number, string, number][]) {
    withStability.runs.push({ prompt: p, model_capability: m, run: r, dir: `build/evals/p${p}/${m}/run${r}`, scores: allTwo(p), total: 20, max: 20, musts_at_2: 8, notes: "" });
  }
  const md = renderReport(withStability);
  assert.match(md, /The Overall table marks \*\*4\*\* of 6 pairs pass — prompt 1 opus, prompt 5 opus, prompt 6 opus and prompt 6 sonnet\./);
  assert.match(md, /Of those, prompt 6 opus and prompt 6 sonnet rest on c1 scores the current rubric produced, and prompt 1 opus and prompt 5 opus on the pre-ruling reading the c1 bullet names\./);
});

test("with part of the c1 roster re-judged the closing paragraph names no pair count of its own", () => {
  // A count of the passing pairs holds only while every score it was computed
  // from stands. Re-judge one of the four and the table's count is neither the
  // critic's tally nor a current-rubric tally, so the paragraph states which runs
  // still carry a pre-ruling score instead of naming a number.
  const cured = staleShapedResults();
  cured.runs = cured.runs.map((r) =>
    r.prompt === 1 && r.model_capability === "opus" && r.run === 2
      ? { ...r, scores: allTwo(1, { "c1-missing-inputs-asked": 0 }) }
      : r,
  );
  const parts = staleScoreParts(cured);
  assert.deepEqual(parts.c1, ALL_C1.slice(1));
  const md = renderReport(cured);
  assert.equal(md.includes(staleCriticClosing(cured)), true);
  assert.match(
    md,
    /The Overall table's pass count is neither tally: prompt 1 sonnet run 1, prompt 5 opus run 2 and prompt 5 sonnet run 2 still hold the c1 score awarded before ruling 3/,
  );
  assert.doesNotMatch(md, /The Overall table marks \*\*4\*\*/);
  assert.doesNotMatch(md, /the count is \*\*2\*\* again/);
});

test("a full re-judging with the critic untouched leaves the closing paragraph printing and saying so", () => {
  // The failure this pins: the paragraph is gated on the critic's pair-tally
  // entry, which a re-judging does not touch, but its text asserted the state of
  // the c1 and c3 scores. Re-judge the four c1 runs and the four prompt-6 c3
  // scores without re-running the critic and every one of those sentences kept
  // printing after it had become false.
  const rejudged = staleShapedResults();
  rejudged.runs = rejudged.runs.map((r) =>
    r.prompt === 6
      ? { ...r, scores: prompt6Scores(2) }
      : { ...r, scores: allTwo(r.prompt, { "c1-missing-inputs-asked": 0 }) },
  );
  const parts = staleScoreParts(rejudged);
  assert.deepEqual(parts, { c1: [], c3: [], ruling9: true, c1Unverified: [], c3Unverified: [] });
  assert.equal(staleCriticParts(rejudged).pairTally, true);
  const md = renderReport(rejudged);
  assert.match(md, /### What the critic's lists predate/);
  assert.equal(md.includes(staleCriticClosing(rejudged)), true);
  assert.match(md, /every c1 score ruling 3 governs has since been re-judged/);
  assert.match(md, /Every score rulings 3 and 8 govern has since been re-judged/);
  assert.doesNotMatch(md, /The Overall table marks \*\*4\*\*/);
  assert.doesNotMatch(md, /the count is \*\*2\*\* again/);
  assert.doesNotMatch(md, /no re-judging has happened/);
});

// The four tests below feed the CLI the shapes build/evals/results.json can really
// have — a judge that returned a short object, a half-written file, and the hand
// edits evals/rubric.md's threshold procedure has a human make to stability[]
// before re-running this tool. Each one used to crash with an uncaught TypeError
// or print V8's multi-line parse message; each must now be one coded line with the
// I/O exit 3 (§9).

function reportOn(json: string, prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    const results = join(dir, "results.json");
    writeFileSync(results, json);
    return spawnSync(
      process.execPath,
      [join(import.meta.dirname, "eval-report.ts"), "--results", results, "--out", join(dir, "out.md")],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a run with no scores[] is one coded IO_READ line, not a stack trace", () => {
  const r = JSON.parse(JSON.stringify(sampleResults()));
  delete r.runs[0].scores;
  const out = reportOn(JSON.stringify(r), "eval-report-noscores-");
  assert.equal(out.status, 3);
  assert.equal(out.stderr.trimEnd().split("\n").length, 1, out.stderr);
  assert.match(out.stderr, /^error IO_READ: .*has a run with no scores\[\] at runs\[0\]/);
});

test("a results file with no models table is one coded IO_READ line", () => {
  const r = JSON.parse(JSON.stringify(sampleResults()));
  delete r.models;
  const out = reportOn(JSON.stringify(r), "eval-report-nomodels-");
  assert.equal(out.status, 3);
  assert.equal(out.stderr.trimEnd().split("\n").length, 1, out.stderr);
  assert.match(out.stderr, /^error IO_READ: .*is missing its models table/);
});

test("a scores entry that is not {id, score, evidence} is one coded IO_READ line naming it", () => {
  const r = JSON.parse(JSON.stringify(sampleResults()));
  r.runs[1].scores[2] = { id: "c3-chain-completeness", score: "one" };
  const out = reportOn(JSON.stringify(r), "eval-report-score-");
  assert.equal(out.status, 3);
  assert.equal(out.stderr.trimEnd().split("\n").length, 1, out.stderr);
  assert.match(out.stderr, /^error IO_READ: .*at runs\[1\]\.scores\[2\]/);
});

test("a stability entry with no countDiffs object, and a critic item that is not {area, detail}, are one coded IO_READ line each", () => {
  const noCounts = JSON.parse(JSON.stringify(sampleResults()));
  noCounts.stability[1].countDiffs = null;
  const r1 = reportOn(JSON.stringify(noCounts), "eval-report-stability-");
  assert.equal(r1.status, 3);
  assert.equal(r1.stderr.trimEnd().split("\n").length, 1, r1.stderr);
  assert.match(r1.stderr, /^error IO_READ: .*has a stability entry with no countDiffs object at stability\[1\]/);
  const badCritic = JSON.parse(JSON.stringify(sampleResults()));
  badCritic.critic.missing[0] = "run 1 never invoked validate.ts --write";
  const r2 = reportOn(JSON.stringify(badCritic), "eval-report-critic-");
  assert.equal(r2.status, 3);
  assert.equal(r2.stderr.trimEnd().split("\n").length, 1, r2.stderr);
  assert.match(r2.stderr, /^error IO_READ: .*has a critic\.missing\[0\] that is not \{area, detail\}/);
});

test("a rubric that is not a positive integer is one coded IO_READ line", () => {
  for (const rubric of [0, "2", 1.5]) {
    const r = JSON.parse(JSON.stringify(sampleResults()));
    r.rubric = rubric;
    const out = reportOn(JSON.stringify(r), "eval-report-rubric-");
    assert.equal(out.status, 3, `rubric ${JSON.stringify(rubric)}`);
    assert.equal(out.stderr.trimEnd().split("\n").length, 1, out.stderr);
    assert.match(out.stderr, /^error IO_READ: .*has a rubric that is not a positive integer/);
  }
  const ok = JSON.parse(JSON.stringify(sampleResults()));
  ok.rubric = 2;
  assert.equal(reportOn(JSON.stringify(ok), "eval-report-rubric-").status, 0);
});

test("a stability typing that is not {shared, agreeing, pass} is one coded IO_READ line", () => {
  for (const typing of [null, { shared: 3, agreeing: "3", pass: true }]) {
    const r = JSON.parse(JSON.stringify(sampleResults()));
    r.stability[1].typing = typing;
    const out = reportOn(JSON.stringify(r), "eval-report-typing-");
    assert.equal(out.status, 3, `typing ${JSON.stringify(typing)}`);
    assert.equal(out.stderr.trimEnd().split("\n").length, 1, out.stderr);
    assert.match(out.stderr, /^error IO_READ: .*has a stability entry whose typing is not \{shared, agreeing, pass\} at stability\[1\]/);
  }
});

test("a malformed JSON results file is one coded IO_READ line even though the parse message spans lines", () => {
  const out = reportOn('{\n  "runs": [},\n', "eval-report-parse-");
  assert.equal(out.status, 3);
  assert.equal(out.stderr.trimEnd().split("\n").length, 1, out.stderr);
  assert.match(out.stderr, /^error IO_READ: cannot read /);
});

test("a roster that names no run in the file is reported, not read as cleared", () => {
  // The 2026-09-15 defect: the three STALE_* rosters name the retired `opus`
  // and `sonnet` labels, so against a capability-keyed file they match nothing
  // and staleScoreParts returns empty lists — which the callers read as "those
  // scores have since been re-judged". The roster was never checked, so that
  // clearance is unmeasured; a checker that could not run is unverified.
  const r = sampleResults();
  const out = unreachableRosters(r);
  assert.deepEqual(out.map((x) => x.roster), ["STALE_C1_RUNS", "STALE_C3_RUNS", "STALE_C5_RUNS"]);
  for (const x of out) {
    assert.ok(x.entries > 0);
    assert.deepEqual(x.labels, ["opus", "sonnet"].filter((l) => x.labels.includes(l)));
    assert.ok(x.labels.every((l) => l === "opus" || l === "sonnet"));
  }
  // staleScoreParts says "nothing stale" on the same file: that is exactly the
  // pair of answers the guard exists to tell apart.
  assert.deepEqual(staleScoreParts(r).c1, []);
  assert.deepEqual(staleScoreParts(r).c3, []);
});

test("a roster that does reach its runs is not reported unreachable", () => {
  // The archived opus/sonnet-keyed file: the c1 and c3 rosters match real runs
  // there, so the check ran and its verdict stands on its own.
  const out = unreachableRosters(staleShapedResults()).map((x) => x.roster);
  assert.equal(out.includes("STALE_C1_RUNS"), false);
  assert.equal(out.includes("STALE_C3_RUNS"), false);
});

test("the unreachable-roster section prints only when a roster is unreachable", () => {
  const md = renderReport(sampleResults());
  assert.match(md, /^## Checks that could not be evaluated$/m);
  assert.match(md, /`STALE_C1_RUNS` \(c1-missing-inputs-asked\): \d+ entries, all keyed on model capability `opus` and `sonnet`, none matching a run in this file\./);
  // It says why the section above is absent, so the absence cannot be read as a pass.
  assert.match(md, /because the check could not run — not because the check came back clear/);
  // And it is placed after the unverified list and before the critic.
  assert.ok(md.indexOf("## Unverified units") < md.indexOf("## Checks that could not be evaluated"));
  assert.ok(md.indexOf("## Checks that could not be evaluated") < md.indexOf("## Completeness critic"));

  // The archived fixture reaches the c1 and c3 rosters but carries no prompt-7
  // run, so the c5 roster is genuinely unreachable there and is the only one
  // named: the section reports per roster, not all-or-nothing.
  const archived = renderReport(staleShapedResults());
  assert.match(archived, /^## Checks that could not be evaluated$/m);
  assert.match(archived, /`STALE_C5_RUNS`/);
  assert.equal(/`STALE_C1_RUNS`/.test(archived), false);
  assert.equal(/`STALE_C3_RUNS`/.test(archived), false);

  // A file every roster reaches prints no section at all.
  const full = staleShapedResults();
  for (const [prompt, model, run] of [[1, "sonnet", 2], [7, "opus", 2], [7, "sonnet", 1], [7, "sonnet", 2]] as [number, string, number][]) {
    full.runs.push({ prompt, model_capability: model, run, dir: `build/evals/p${prompt}/${model}/run${run}`, scores: allTwo(prompt), total: 2 * criteriaFor(prompt).length, max: 2 * criteriaFor(prompt).length, musts_at_2: criteriaFor(prompt).filter((c) => c.must).length, notes: "" });
  }
  assert.deepEqual(unreachableRosters(full), []);
  assert.equal(/^## Checks that could not be evaluated$/m.test(renderReport(full)), false);
});

/** A `rejudged[]` entry in the shape tools/workflows/rejudge-c1.js's caller wrote on 2026-09-15. */
function rejudging(criterion: string, date: string, runs: number, unverified: number) {
  return {
    criterion, date, runs, by: "tools/workflows/rejudge-c1.js",
    models: { high: "opus", medium: "sonnet", low: "haiku" },
    reason: "the clause was reconciled with its reference and re-scored on that criterion alone",
    unverified,
  };
}

test("a re-judging recorded in the results file prints what the critic ran before, immediately before its lists", () => {
  // The critic runs once, inside the evaluation; a criterion re-judged afterwards
  // leaves its entries and the judge notes quoting the old scores describing
  // scores the tables no longer carry. The archived-round caveat above is keyed
  // to the old labels and does not print for a capability-keyed file.
  const r = sampleResults();
  r.rejudged = [rejudging("c1-missing-inputs-asked", "2026-09-15", 8, 0)];
  const md = renderReport(r);
  assert.equal(
    md.includes(
      "### What the critic ran before\n\nThe critic ran before the 2026-09-15 re-judging of c1-missing-inputs-asked by tools/workflows/rejudge-c1.js (8 runs, 0 unverified), so its entries and any judge note quoting a pre-re-judging score for that criterion describe scores the tables above no longer carry; the acceptance note rules on each entry.\n\n### Missing\n",
    ),
    true,
    md,
  );
  assert.ok(md.indexOf("## Completeness critic") < md.indexOf("### What the critic ran before"));
  assert.doesNotMatch(md, /### What the critic's lists predate/);
});

test("two re-judgings print two paragraphs under the one heading", () => {
  const r = sampleResults();
  r.rejudged = [rejudging("c1-missing-inputs-asked", "2026-09-15", 8, 0), rejudging("c5-provisional-rescore", "2026-09-20", 6, 1)];
  const md = renderReport(r);
  assert.equal(md.split("### What the critic ran before").length, 2);
  const section = md.split("### What the critic ran before\n\n")[1].split("### Missing")[0];
  const paragraphs = section.split("\n\n").filter((p) => p.trim() !== "");
  assert.equal(paragraphs.length, 2, section);
  assert.match(paragraphs[0], /^The critic ran before the 2026-09-15 re-judging of c1-missing-inputs-asked by tools\/workflows\/rejudge-c1\.js \(8 runs, 0 unverified\), /);
  assert.match(paragraphs[1], /^The critic ran before the 2026-09-20 re-judging of c5-provisional-rescore by tools\/workflows\/rejudge-c1\.js \(6 runs, 1 unverified\), /);
});

test("with no re-judging recorded nothing about one prints", () => {
  assert.doesNotMatch(renderReport(sampleResults()), /What the critic ran before|re-judging of/);
  const empty = sampleResults();
  empty.rejudged = [];
  assert.doesNotMatch(renderReport(empty), /What the critic ran before|re-judging of/);
  // The archived fixture, with its own stale-critic subsection, gains nothing either.
  assert.doesNotMatch(renderReport(staleShapedResults()), /What the critic ran before/);
});

test("a rejudged entry with no date, or a rejudged that is not a list, is one coded IO_READ line", () => {
  const noDate = JSON.parse(JSON.stringify(sampleResults()));
  noDate.rejudged = [rejudging("c1-missing-inputs-asked", "2026-09-15", 8, 0)];
  delete noDate.rejudged[0].date;
  const out = reportOn(JSON.stringify(noDate), "eval-report-rejudged-");
  assert.equal(out.status, 3);
  assert.equal(out.stderr.trimEnd().split("\n").length, 1, out.stderr);
  assert.match(out.stderr, /^error IO_READ: .*has a rejudged\[0\] that is not \{criterion, date, runs, by, reason, unverified\}/);
  const countAsText = JSON.parse(JSON.stringify(sampleResults()));
  countAsText.rejudged = [rejudging("c1-missing-inputs-asked", "2026-09-15", 8, 0)];
  countAsText.rejudged[0].runs = "8";
  assert.match(reportOn(JSON.stringify(countAsText), "eval-report-rejudged-").stderr, /has a rejudged\[0\] that is not/);
  const notList = JSON.parse(JSON.stringify(sampleResults()));
  notList.rejudged = { criterion: "c1-missing-inputs-asked" };
  const out2 = reportOn(JSON.stringify(notList), "eval-report-rejudged-");
  assert.equal(out2.status, 3);
  assert.match(out2.stderr, /^error IO_READ: .*has a rejudged that is not a list/);
  // And a well-formed entry passes the check.
  const ok = JSON.parse(JSON.stringify(sampleResults()));
  ok.rejudged = [rejudging("c1-missing-inputs-asked", "2026-09-15", 8, 0)];
  assert.equal(reportOn(JSON.stringify(ok), "eval-report-rejudged-").status, 0);
});
