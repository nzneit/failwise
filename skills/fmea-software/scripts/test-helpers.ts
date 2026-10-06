import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
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

/** Runs a script under the current Node; `env`, when given, replaces the inherited environment. */
export function runCli(script: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [join(SKILL_ROOT, "scripts", script), ...args], { encoding: "utf8", env: options.env });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
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
      boundary: { included: ["svc"], excluded: [], security: "no security component in scope" },
      ground_rules: [],
      assumptions: [],
      reviews: [],
      scales: { version: 1, priority_table: "priority-fmea-software-v1" },
      created: "2026-09-01",
      updated: "2026-09-01",
      history: [],
    },
    elements: [
      { id: "svc", kind: "service", name: "Service", description: "", parent: null, sources: [{ kind: "document", ref: "arch.md" }] },
    ],
    functions: [
      { id: "fn-1", element: "svc", statement: "serve requests", conditions: [], for_whom: "clients" },
    ],
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
