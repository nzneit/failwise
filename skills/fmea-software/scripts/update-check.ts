// update-check.ts <stored copy> <draft> [--check]
// Reads the copy of the analysis an update set aside before its first change, and the draft it is
// writing, and prints the structural diff: the edge and element changes, the rows an element-changed
// rule reaches with each row's rule, the rows left unmarked by rule, the links into removed chains,
// the outside elements left with no consumer and the order to re-rate in. With --check it also prints
// the consumer causes whose linked chain changed, and refuses with UPDATE_MISMATCH a draft whose
// stale flags, ratings outside the stale set or links into removed chains disagree. A copy that is
// not the draft's baseline is UPDATE_BASELINE on either run. It runs the legacy gate and the schema on
// both documents, never the invariants or the priorities, and writes nothing.
// Its edges, elements and stale sections and its last line are the summary the update copies into meta.history.
import process from "node:process";
import type { Issue } from "./lib/codes.ts";
import type { FmeaDocument } from "./lib/types.ts";
import { legacyIssues } from "./lib/legacy.ts";
import { checkSchema } from "./lib/schema.ts";
import { writeIssues } from "./lib/validation.ts";
import { baselineIssues, diffLines, diffUpdate, mismatchIssues } from "./lib/update-diff.ts";
import { parseArgs } from "./lib/args.ts";
import { assertExtension, readJsonFile } from "./lib/io.ts";
import { isEntry, run } from "./lib/cli.ts";

/** Prints every issue of a stage and reports whether there was any. */
function stage(issues: Issue[]): boolean {
  writeIssues(issues);
  return issues.length > 0;
}

function prefixed(issues: Issue[], prefix: string): Issue[] {
  return issues.map((i) => ({ ...i, message: `${prefix}${i.message}` }));
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv, { positional: 2, flags: { check: "boolean" } });
  const [copyPath, draftPath] = parsed.positional;
  const check = parsed.flags.check === true;
  assertExtension(copyPath, ".json", "the stored copy");
  assertExtension(draftPath, ".json", "the draft");
  const rawCopy = readJsonFile(copyPath);
  const rawDraft = readJsonFile(draftPath);
  const legacy: Issue[] = [
    ...legacyIssues(rawCopy).map((i): Issue => ({ code: "UPDATE_BASELINE", rule: "update-baseline", message: `the stored copy is not a v3 document: ${i.message}`, pointer: i.pointer })),
    ...prefixed(legacyIssues(rawDraft), "the draft: "),
  ];
  if (stage(legacy)) return 2;
  if (stage([...prefixed(checkSchema(rawCopy), "the stored copy: "), ...prefixed(checkSchema(rawDraft), "the draft: ")])) return 2;
  const copy = rawCopy as FmeaDocument;
  const draft = rawDraft as FmeaDocument;
  if (stage(baselineIssues(copy, draft, check))) return 2;
  const diff = diffUpdate(copy, draft);
  process.stdout.write(diffLines(diff, check).join("\n") + "\n");
  if (check && stage(mismatchIssues(copy, draft, diff))) return 2;
  return 0;
}

if (isEntry(import.meta)) run(main);
