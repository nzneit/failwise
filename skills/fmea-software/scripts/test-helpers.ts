import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { FmeaDocument, Rating, RatingEvidenceKind, ReviewStatus } from "./lib/types.ts";
import { computePriority } from "./lib/table.ts";
import type { PriorityTable } from "./lib/table.ts";

/** `skills/fmea-software/`: this file lives in its `scripts/` directory. */
export const SKILL_ROOT: string = join(import.meta.dirname, "..");
const FIXTURES: string = join(SKILL_ROOT, "evals", "fixtures");

export function fixturePath(...parts: string[]): string {
  return join(FIXTURES, ...parts);
}

export function loadFixture<T = unknown>(...parts: string[]): T {
  return JSON.parse(readFileSync(fixturePath(...parts), "utf8")) as T;
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

/** The document with the tracker target and every action's link removed: what the checkout fixture
 *  was before it gained them, for a test of how the report looks when nothing is tracked. */
export function withoutTracker(doc: FmeaDocument): FmeaDocument {
  const bare = clone(doc);
  delete bare.meta.tracker;
  for (const chain of bare.chains) for (const action of chain.actions) delete action.tracker;
  return bare;
}

/** A shape-valid priority table, id `priority-test-properties`, vocabulary H, M, L, with three bands
 *  per factor, [1, 1], [2, 8] and [9, 10], whose every cell in S band s holds `bySBand[s - 1]`.
 *  With ["L", "M", "H"] it keeps the four priority properties of scales-software.md; a test
 *  changes cells of it to break them. */
export function bandTable(bySBand: [string, string, string]): PriorityTable {
  const bands: [number, number][] = [[1, 1], [2, 8], [9, 10]];
  const cells: Record<string, string> = {};
  for (const s of [1, 2, 3]) for (const o of [1, 2, 3]) for (const d of [1, 2, 3]) cells[`${s}-${o}-${d}`] = bySBand[s - 1];
  return { id: "priority-test-properties", vocabulary: ["H", "M", "L"], bands: { S: bands, O: clone(bands), D: clone(bands) }, cells };
}

/** Writes `table` to table.json in `dir`, as a --table-file, and returns the path. */
export function writeTable(dir: string, table: PriorityTable): string {
  const path = join(dir, "table.json");
  writeFileSync(path, JSON.stringify(table, null, 2) + "\n");
  return path;
}

/** minimalDoc as priority.ts --write leaves it under `table`: the table recorded, the row priced by it. */
export function minimalDocOn(table: PriorityTable): FmeaDocument {
  const doc = minimalDoc();
  doc.meta.scales.priority_table = table.id;
  doc.chains[0].priority = computePriority(table, doc.chains[0].ratings);
  return doc;
}

/** Run `fn` against a fresh temporary directory and remove it afterwards, so a test that writes
 *  files never touches the repository. */
export function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "fmea-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs a script under the current Node; `env`, when given, replaces the inherited environment, and
 *  `execArgv` goes to Node before the script. */
export function runCli(script: string, args: string[], options: { env?: NodeJS.ProcessEnv; execArgv?: string[] } = {}): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [...(options.execArgv ?? []), join(SKILL_ROOT, "scripts", script), ...args], { encoding: "utf8", env: options.env });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** A module, loaded before the script, that saves `content` to `path` as soon as the script has
 *  first read that file: what a person's editor saving the analysis file in the middle of a run
 *  does. It wraps fs.readFileSync, which every read of the skill goes through. */
function otherWriterModule(path: string, content: string): string {
  return [
    'import fs from "node:fs";',
    'import { syncBuiltinESMExports } from "node:module";',
    "const readFileSync = fs.readFileSync;",
    "let saved = false;",
    "fs.readFileSync = function (file, ...rest) {",
    "  const result = readFileSync.call(this, file, ...rest);",
    `  if (!saved && file === ${JSON.stringify(path)}) { saved = true; fs.writeFileSync(file, ${JSON.stringify(content)}); }`,
    "  return result;",
    "};",
    "syncBuiltinESMExports();",
  ].join("\n");
}

/** Runs a script as runCli does while another writer saves `content` to `path` just after the
 *  script has read it. */
export function runCliWithOtherWriter(script: string, args: string[], path: string, content: string): { status: number; stdout: string; stderr: string } {
  return withTempDir((dir) => {
    const hook = join(dir, "other-writer.mjs");
    writeFileSync(hook, otherWriterModule(path, content));
    return runCli(script, args, { execArgv: ["--import", pathToFileURL(hook).href] });
  });
}

/** The IO_CHANGED message for `path`, as io.ts words it. */
export function changedMessage(path: string): string {
  return `${path} changed after this command last read or wrote it, so it was not replaced and holds the other writer's change: run the command again on the file as it now is`;
}

/** One way a v1 or v2 document reaches a script: a name, the change that turns the checkout fixture
 *  into it, and the pointer and code of the KIND_LEGACY or DEPENDENCY_LEGACY line that refuses it.
 *  validate.ts, render.ts and track.ts are each run over the whole list. */
export interface LegacyTrigger { name: string; mutate: (doc: FmeaDocument) => void; pointer: string; code: "KIND_LEGACY" | "DEPENDENCY_LEGACY" }

const LEGACY_MESSAGE_PREFIXES: Record<LegacyTrigger["code"], string> = { KIND_LEGACY: "document predates schema v2 (", DEPENDENCY_LEGACY: "document predates schema v3 (" };

const element = (doc: FmeaDocument, i: number): Record<string, unknown> => doc.elements[i] as unknown as Record<string, unknown>;

export const LEGACY_TRIGGERS: LegacyTrigger[] = [
  { name: "a v1 document with no boundary is KIND_LEGACY, pointing at the element, before the schema runs",
    mutate: (doc) => { delete element(doc, 0).boundary; }, pointer: "/elements/0", code: "KIND_LEGACY" },
  { name: "a v1 document with no security_relevant is KIND_LEGACY",
    mutate: (doc) => { delete element(doc, 0).security_relevant; }, pointer: "/elements/0", code: "KIND_LEGACY" },
  { name: "a removed kind is KIND_LEGACY, pointing at the kind",
    mutate: (doc) => { element(doc, 2).kind = "external_dependency"; }, pointer: "/elements/2/kind", code: "KIND_LEGACY" },
  { name: "a legacy row id in catalog_refs is KIND_LEGACY, pointing at the id",
    mutate: (doc) => { doc.chains[0].catalog_refs[0].id = "cat-external_dependency-01"; }, pointer: "/chains/0/catalog_refs/0/id", code: "KIND_LEGACY" },
  { name: "a legacy row id that survives only in a catalog source is KIND_LEGACY, pointing at the ref",
    mutate: (doc) => { doc.elements[2].sources[1].ref = "cat-security_component-01"; }, pointer: "/elements/2/sources/1/ref", code: "KIND_LEGACY" },
];

/** Turns a v3 document back into its v2 shape: each edge becomes a dependency block on the first
 *  element whose id is the edge's `to`, and the top-level dependencies array goes. */
function moveEdgesIntoBlocks(doc: FmeaDocument): void {
  for (const edge of doc.dependencies) {
    const target = doc.elements.find((e) => e.id === edge.to);
    if (target === undefined) continue;
    const block: Record<string, unknown> = { strength: edge.strength };
    if (edge.sla !== undefined) block.sla = edge.sla;
    if (edge.limits !== undefined) block.limits = edge.limits;
    (target as unknown as Record<string, unknown>).dependency = block;
  }
  delete (doc as unknown as Record<string, unknown>).dependencies;
}

export const V2_TRIGGERS: LegacyTrigger[] = [
  { name: "a document with no top-level dependencies array is DEPENDENCY_LEGACY at /dependencies, before the schema runs",
    mutate: (doc) => { delete (doc as unknown as Record<string, unknown>).dependencies; }, pointer: "/dependencies", code: "DEPENDENCY_LEGACY" },
  { name: "an element with a dependency block is DEPENDENCY_LEGACY, pointing at the block",
    mutate: (doc) => { element(doc, 2).dependency = { strength: "strong" }; }, pointer: "/elements/2/dependency", code: "DEPENDENCY_LEGACY" },
  { name: "blocks on two elements are one DEPENDENCY_LEGACY line, at the earlier block",
    mutate: (doc) => { element(doc, 2).dependency = { strength: "strong" }; element(doc, 5).dependency = { strength: "weak" }; }, pointer: "/elements/2/dependency", code: "DEPENDENCY_LEGACY" },
  { name: "no top-level array and a block are one DEPENDENCY_LEGACY line, at /dependencies",
    mutate: (doc) => { delete (doc as unknown as Record<string, unknown>).dependencies; element(doc, 2).dependency = { strength: "strong" }; }, pointer: "/dependencies", code: "DEPENDENCY_LEGACY" },
  { name: "a v1 trait beside a missing dependencies array is KIND_LEGACY alone",
    mutate: (doc) => { delete element(doc, 0).boundary; delete (doc as unknown as Record<string, unknown>).dependencies; }, pointer: "/elements/0", code: "KIND_LEGACY" },
  { name: "a whole v2 document, every edge moved back into a block on its to element, is DEPENDENCY_LEGACY at /dependencies",
    mutate: moveEdgesIntoBlocks, pointer: "/dependencies", code: "DEPENDENCY_LEGACY" },
];

/** Writes the checkout fixture, changed by `trigger`, to analysis.json in `dir` and returns the path. */
export function writeLegacy(dir: string, trigger: LegacyTrigger): string {
  const doc = loadFixture<FmeaDocument>("checkout-service.fmea.json");
  trigger.mutate(doc);
  const path = join(dir, "analysis.json");
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  return path;
}

/** A script's run refused the document with exit 2 and one `code` line at `pointer` whose message
 *  starts with `prefix`, and the schema stage never ran. */
export function assertLegacyRefused(r: { status: number; stderr: string }, pointer: string, code: LegacyTrigger["code"] = "KIND_LEGACY", prefix: string = LEGACY_MESSAGE_PREFIXES[code]): void {
  assert.equal(r.status, 2, r.stderr);
  assert.ok(r.stderr.startsWith(`error ${code}: format-legacy: ${prefix}`), r.stderr);
  assert.ok(r.stderr.endsWith(` at ${pointer}\n`), r.stderr);
  assert.equal(r.stderr.split("\n").length, 2, r.stderr);
  assert.ok(!r.stderr.includes("error SCHEMA:"), r.stderr);
}

/** A rating for test documents. A provisional review carries no `by` or `date`; any other status
 *  must carry both (an invariant the validator checks). */
export function rating(value: number, status: ReviewStatus = "rescored", evidence: RatingEvidenceKind = "estimate"): Rating {
  return {
    value,
    rationale: "test rationale",
    evidence_kind: evidence,
    review: status === "provisional" ? { status } : { status, by: "T. Tester", date: "2026-09-03" },
  };
}

/** The smallest document that passes the schema, the invariants, and priority recomputation
 *  against the shipped table, and produces only the two `metadata-without-ground-rules` blockers at
 *  /meta/ground_rules and /meta/assumptions (fill both lists for a lint-free document). With that
 *  table S 8 is band 4, O 3 band 2,
 *  and D 4 band 3, so the weighted sum is 3*4 + 2 + 3 = 17 and the priority is M; rpn is 8*3*4. */
export function minimalDoc(): FmeaDocument {
  return {
    meta: {
      id: "fmea-min",
      name: "Minimal",
      version: 1,
      branch: "DFMEA",
      scope: "one element",
      boundary: { included: ["svc"], excluded: [], security: "no security-relevant element in scope" },
      ground_rules: [],
      assumptions: [],
      reviews: [],
      scales: { version: 1, priority_table: "priority-fmea-software-v1" },
      created: "2026-09-01",
      updated: "2026-09-01",
      history: [],
    },
    elements: [
      { id: "svc", kind: "service", name: "Service", description: "", parent: null, boundary: "in_scope", security_relevant: false, sources: [{ kind: "document", ref: "arch.md" }] },
    ],
    functions: [
      { id: "fn-1", element: "svc", statement: "serve requests", conditions: [], for_whom: "clients" },
    ],
    dependencies: [],
    chains: [
      {
        id: "ch-1",
        function: "fn-1",
        failure_mode: "stops serving",
        effects: { local: "no response", next_level: "client timeout", end: "users cannot check out" },
        causes: [{ text: "process crash" }],
        controls: [],
        ratings: { S: rating(8), O: rating(3), D: rating(4) },
        priority: { value: "M", table: "priority-fmea-software-v1", rpn: 96 },
        actions: [],
        catalog_refs: [],
        stale: { flag: false },
        history: [],
      },
    ],
  };
}
