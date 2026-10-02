import { join } from "node:path";
import type { Issue } from "./lib/codes.ts";
import { formatError, ScriptError } from "./lib/codes.ts";
import type { FmeaDocument, Lint } from "./lib/types.ts";
import type { PriorityTable } from "./lib/table.ts";
import { loadTable } from "./lib/table.ts";
import { checkSchema } from "./lib/schema.ts";
import { checkInvariants, checkPriorities } from "./lib/invariants.ts";
import type { MachineRule } from "./lib/lints.ts";
import { MACHINE_RULES, runLints } from "./lib/lints.ts";
import { qualityScore } from "./lib/quality.ts";
import { parseArgs } from "./lib/args.ts";
import { assertExtension, readJsonFile, stringifyDocument, writeFileAtomic } from "./lib/io.ts";
import { nowIso } from "./lib/dates.ts";
import { isEntry, run } from "./lib/cli.ts";

export interface ValidateResult { ok: boolean; errors: Issue[]; lints: Lint[]; quality_score: number }

const MANIFEST_PATH = join(import.meta.dirname, "..", "..", "..", ".claude-plugin", "plugin.json");

export function validatorVersion(): string {
  const manifest = readJsonFile(MANIFEST_PATH) as { version?: unknown };
  if (typeof manifest.version !== "string" || manifest.version === "") {
    throw new ScriptError("IO_READ", `plugin manifest at ${MANIFEST_PATH} has no version`);
  }
  return manifest.version;
}

export function validateDocument(raw: unknown, table: PriorityTable, rules: MachineRule[] = MACHINE_RULES): ValidateResult {
  const schemaIssues = checkSchema(raw);
  if (schemaIssues.length > 0) return { ok: false, errors: schemaIssues, lints: [], quality_score: 0 };
  const doc = raw as FmeaDocument;
  const errors: Issue[] = [...checkInvariants(doc), ...checkPriorities(doc, table)];
  const lints = runLints(doc, rules);
  return { ok: errors.length === 0, errors, lints, quality_score: qualityScore(doc.chains.length, lints) };
}

/** Prints a result as validate.ts does, the JSON on stdout and a coded line per error on stderr,
 *  and returns the exit status: 2 when the document is invalid, else 0. track.ts prints the same. */
export function reportValidation(result: ValidateResult): number {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.ok) {
    for (const e of result.errors) process.stderr.write(formatError(e.code, `${e.rule}: ${e.message}`, e.pointer) + "\n");
    return 2;
  }
  return 0;
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv, { positional: 1, flags: { write: "boolean", "table-file": "string" } });
  const path = parsed.positional[0];
  assertExtension(path, ".json", "the analysis file");
  const tableFile = typeof parsed.flags["table-file"] === "string" ? parsed.flags["table-file"] : undefined;
  const raw = readJsonFile(path);
  const table = loadTable(tableFile);
  const result = validateDocument(raw, table);
  if (result.ok && parsed.flags.write === true) {
    const doc = raw as FmeaDocument;
    doc.computed = {
      quality_score: result.quality_score,
      lints: result.lints,
      validated_at: nowIso(),
      validator_version: validatorVersion(),
    };
    writeFileAtomic(path, stringifyDocument(doc));
  }
  return reportValidation(result);
}

if (isEntry(import.meta)) run(main);
