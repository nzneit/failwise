// priority.ts <analysis.json> --write [--table-file path] [--change-table]
// Writes every chain's priority from its three ratings and the loaded table. A document that
// records no table yet gets the loaded table's id in meta.scales.priority_table. A document that
// records another table is refused with TABLE_ID_MISMATCH and left untouched, unless
// --change-table is given: then the loaded table is recorded and every priority recomputed with
// it. --change-table on a document that records no table, or already records the loaded one, is a
// USAGE failure. A loaded table that breaks one of the priority properties of §7 is used all the
// same: after the write, one `warning priority-table-property:` line per broken property goes to
// stderr, naming the cells, and the exit status stays 0. A pure function from ratings and a
// table; it knows nothing about rationale or evidence and writes no history (§9). --write is
// required because the only effect of this script is the rewrite of the input file.

import { parseArgs } from "./lib/args.ts";
import { isEntry, run } from "./lib/cli.ts";
import { ScriptError } from "./lib/codes.ts";
import { assertExtension, readJsonWithBytes, stringifyDocument, writeFileAtomic } from "./lib/io.ts";
import { ptr } from "./lib/pointer.ts";
import { formatLintLine, tablePropertyLints } from "./lib/lints.ts";
import { computePriority, loadTable } from "./lib/table.ts";
import type { PriorityTable } from "./lib/table.ts";
import type { Factor, FmeaDocument } from "./lib/types.ts";

const FACTORS: readonly Factor[] = ["S", "O", "D"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// The minimum shape this script needs before it can apply the table: meta.scales is an
// object, chains is an array, and each chain has ratings.S, ratings.O, ratings.D with a
// value — and the same of post_ratings where the chain has one. Anything less is a SCHEMA failure at the first missing location (exit 2). The full
// schema check is validate.ts's job; this script only refuses what it cannot rewrite safely.
export function assertPriorityInput(raw: unknown): FmeaDocument {
  if (!isPlainObject(raw)) throw new ScriptError("SCHEMA", "document must be a JSON object", ptr());
  if (!isPlainObject(raw.meta)) throw new ScriptError("SCHEMA", "meta must be an object", ptr("meta"));
  if (!isPlainObject(raw.meta.scales)) throw new ScriptError("SCHEMA", "meta.scales must be an object", ptr("meta", "scales"));
  if (!Array.isArray(raw.chains)) throw new ScriptError("SCHEMA", "chains must be an array", ptr("chains"));
  raw.chains.forEach((chain, i) => {
    if (!isPlainObject(chain)) throw new ScriptError("SCHEMA", "chain must be an object", ptr("chains", i));
    for (const key of ["ratings", "post_ratings"] as const) {
      if (key === "post_ratings" && chain.post_ratings === undefined) continue;
      const ratings = chain[key];
      if (!isPlainObject(ratings)) throw new ScriptError("SCHEMA", `${key} must be an object`, ptr("chains", i, key));
      for (const f of FACTORS) {
        const r = ratings[f];
        if (!isPlainObject(r)) throw new ScriptError("SCHEMA", `${key}.${f} must be an object`, ptr("chains", i, key, f));
        if (r.value === undefined) throw new ScriptError("SCHEMA", `${key}.${f}.value is missing`, ptr("chains", i, key, f, "value"));
      }
    }
  });
  return raw as unknown as FmeaDocument;
}

const USAGE_LINE = "priority.ts <analysis.json> --write [--table-file path] [--change-table]";

// Refuses a run that would change the table the document records, unless changeTable is set, and
// refuses changeTable on a run that changes nothing. A recorded value that is present and is not
// the loaded table's id is a mismatch, whatever its type. The mismatch line is validate.ts's for
// the same rule, with the two ways out added.
function assertTableChange(recorded: unknown, table: PriorityTable, changeTable: boolean): void {
  const differs = recorded !== undefined && recorded !== table.id;
  if (differs && !changeTable) {
    throw new ScriptError(
      "TABLE_ID_MISMATCH",
      `priority-table-mismatch: meta.scales.priority_table is ${typeof recorded === "string" ? recorded : JSON.stringify(recorded)} but the loaded table id is ${table.id}; pass the --table-file of the recorded table, or pass --change-table to record the loaded one`,
      ptr("meta", "scales", "priority_table"),
    );
  }
  if (!differs && changeTable) {
    const state = recorded === undefined ? "records none" : `already records the loaded table ${table.id}`;
    throw new ScriptError("USAGE", `--change-table changes the table a document records, and this document ${state}`);
  }
}

// Sets meta.scales.priority_table, every chains[i].priority, and every chains[i].post_priority
// in place and returns doc. The table guard (assertTableChange) runs first, so a refusal leaves
// doc as it was. A row's post_priority is the same lookup over its post_ratings and is removed
// when the row has none (§6). A rating outside 1..10, pre- or post-action, is a validation
// failure at the value's pointer (§9), checked here before the table lookup so the error carries
// the document location.
export function applyPriorities(doc: FmeaDocument, table: PriorityTable, options: { changeTable?: boolean } = {}): FmeaDocument {
  assertTableChange((doc.meta.scales as { priority_table?: unknown }).priority_table, table, options.changeTable === true);
  doc.chains.forEach((chain, i) => {
    for (const key of ["ratings", "post_ratings"] as const) {
      const ratings = chain[key];
      if (ratings === undefined) continue;
      for (const f of FACTORS) {
        const value = ratings[f].value;
        if (!Number.isInteger(value) || value < 1 || value > 10) {
          throw new ScriptError("RATING_RANGE", `rating ${f} must be an integer from 1 to 10, got ${JSON.stringify(value)}`, ptr("chains", i, key, f, "value"));
        }
      }
    }
  });
  doc.meta.scales.priority_table = table.id;
  doc.chains.forEach((chain) => {
    chain.priority = computePriority(table, chain.ratings);
    if (chain.post_ratings === undefined) delete chain.post_priority;
    else chain.post_priority = computePriority(table, chain.post_ratings);
  });
  return doc;
}

function main(argv: string[]): number {
  const args = parseArgs(argv, { positional: 1, flags: { write: "boolean", "table-file": "string", "change-table": "boolean" } });
  if (args.flags.write !== true) {
    throw new ScriptError("USAGE", `--write is required: ${USAGE_LINE}`);
  }
  const input = args.positional[0];
  assertExtension(input, ".json", "analysis file");
  const tableFile = typeof args.flags["table-file"] === "string" ? args.flags["table-file"] : undefined;
  const table = loadTable(tableFile);
  const changeTable = args.flags["change-table"] === true;
  const read = readJsonWithBytes(input);
  const doc = assertPriorityInput(read.value);
  const recorded: unknown = (doc.meta.scales as { priority_table?: unknown }).priority_table;
  applyPriorities(doc, table, { changeTable });
  // Refused with IO_CHANGED, the file left as it is, when another writer saved it after the read.
  writeFileAtomic(input, stringifyDocument(doc), read.bytes);
  const changedFrom = changeTable ? `, "changed_from": ${JSON.stringify(recorded)}` : "";
  process.stdout.write(`{"table": ${JSON.stringify(table.id)}, "rows": ${doc.chains.length}${changedFrom}}\n`);
  for (const finding of tablePropertyLints(table)) process.stderr.write(formatLintLine(finding) + "\n");
  return 0;
}

if (isEntry(import.meta)) run(main);
