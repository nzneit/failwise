import { join } from "node:path";
import { ScriptError } from "./lib/codes.ts";
import type { FmeaDocument } from "./lib/types.ts";
import { loadTable } from "./lib/table.ts";
import { reportValidation, validateDocument } from "./lib/validation.ts";
import { parseArgs } from "./lib/args.ts";
import { assertExtension, readJsonFile, stringifyDocument, writeFileAtomic } from "./lib/io.ts";
import { nowIso } from "./lib/dates.ts";
import { isEntry, run } from "./lib/cli.ts";

const MANIFEST_PATH = join(import.meta.dirname, "..", "..", "..", ".claude-plugin", "plugin.json");

export function validatorVersion(): string {
  const manifest = readJsonFile(MANIFEST_PATH) as { version?: unknown };
  if (typeof manifest.version !== "string" || manifest.version === "") {
    throw new ScriptError("IO_READ", `plugin manifest at ${MANIFEST_PATH} has no version`);
  }
  return manifest.version;
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
