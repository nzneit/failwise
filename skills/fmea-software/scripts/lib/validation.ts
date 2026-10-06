// The validator's checks and how their results are printed, shared by validate.ts, render.ts and
// track.ts. Not an entry point: a CLI that imported another CLI would run that one's isEntry guard
// too, and on a runtime without import.meta.main print a second NODE line.

import process from "node:process";
import type { Issue } from "./codes.ts";
import { formatError } from "./codes.ts";
import type { Computed, FmeaDocument, Lint } from "./types.ts";
import type { PriorityTable } from "./table.ts";
import { checkSchema } from "./schema.ts";
import { checkInvariants, checkPriorities } from "./invariants.ts";
import type { MachineRule } from "./lints.ts";
import { MACHINE_RULES, runLints, tablePropertyLints } from "./lints.ts";
import { qualityScore } from "./quality.ts";

export interface ValidateResult { ok: boolean; errors: Issue[]; lints: Lint[]; quality_score: number }

/** Schema, then the invariants and the priority recomputation, then the lints: the document's
 *  machine rules followed by one warning per property of §7 the loaded table breaks. */
export function validateDocument(raw: unknown, table: PriorityTable, rules: MachineRule[] = MACHINE_RULES): ValidateResult {
  const schemaIssues = checkSchema(raw);
  if (schemaIssues.length > 0) return { ok: false, errors: schemaIssues, lints: [], quality_score: 0 };
  const doc = raw as FmeaDocument;
  const errors: Issue[] = [...checkInvariants(doc), ...checkPriorities(doc, table)];
  const lints = [...runLints(doc, rules), ...tablePropertyLints(table)];
  return { ok: errors.length === 0, errors, lints, quality_score: qualityScore(doc.chains.length, lints) };
}

/** One coded line on stderr per issue, as validate.ts, track.ts and render.ts print them. */
export function writeIssues(issues: Issue[]): void {
  for (const e of issues) process.stderr.write(formatError(e.code, `${e.rule}: ${e.message}`, e.pointer) + "\n");
}

/** Prints a result as validate.ts does, the JSON on stdout and a coded line per error on stderr,
 *  and returns the exit status: 2 when the document is invalid, else 0. track.ts prints the same. */
export function reportValidation(result: ValidateResult): number {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.ok) {
    writeIssues(result.errors);
    return 2;
  }
  return 0;
}

const RERUN = "run validate.ts --write, then render.ts again";

const findings = (n: number): string => (n === 1 ? "1 finding" : `${n} findings`);

/** The stored computed block against a fresh result for the same document: one COMPUTED_STALE issue
 *  for a quality score that differs and one for a lint list that differs, compared in order with
 *  every field of every finding, and none when both agree. `validated_at` and `validator_version`
 *  are not compared. The lines do not say why the two differ: an edit to the document and a plugin
 *  upgrade that rewords a lint give the same difference, and the same cure.
 *  Not part of validateDocument: validate.ts --write must be able to replace a stale block. */
export function staleComputed(stored: Computed, fresh: ValidateResult): Issue[] {
  const out: Issue[] = [];
  if (stored.quality_score !== fresh.quality_score) {
    out.push({ code: "COMPUTED_STALE", rule: "computed-stale", pointer: "/computed/quality_score",
      message: `computed.quality_score is ${stored.quality_score} but validate.ts now gives ${fresh.quality_score}; ${RERUN}` });
  }
  const lints = staleLints(stored, fresh.lints);
  if (lints) out.push(lints);
  return out;
}

function staleLints(stored: Computed, fresh: Lint[]): Issue | null {
  const kept = stored.lints;
  const i = firstLintDifference(kept, fresh);
  if (i === null) return null;
  const head = `computed.lints, written by validator ${stored.validator_version},`;
  const issue = (pointer: string, says: string): Issue =>
    ({ code: "COMPUTED_STALE", rule: "computed-stale", pointer, message: `${head} ${says}; ${RERUN}` });
  if (i === kept.length) return issue("/computed/lints", `holds ${findings(fresh.length - kept.length)} fewer than validate.ts now finds`);
  if (i === fresh.length) return issue(`/computed/lints/${i}`, `holds ${findings(kept.length - fresh.length)} more than validate.ts now finds`);
  const a = kept[i];
  const b = fresh[i];
  const same = a.rule === b.rule && a.pointer === b.pointer ? " with another severity or message" : "";
  return issue(`/computed/lints/${i}`,
    `first differs at finding ${i}: stored ${a.rule} at ${a.pointer}, validate.ts now finds ${b.rule} at ${b.pointer}${same}`);
}

/** The first index at which the two lists differ in any field, or in length; null when they are equal. */
function firstLintDifference(stored: Lint[], fresh: Lint[]): number | null {
  const n = Math.max(stored.length, fresh.length);
  for (let i = 0; i < n; i++) {
    const a = stored[i];
    const b = fresh[i];
    if (a === undefined || b === undefined || a.rule !== b.rule || a.severity !== b.severity || a.pointer !== b.pointer || a.message !== b.message) return i;
  }
  return null;
}
