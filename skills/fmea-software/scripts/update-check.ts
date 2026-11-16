// update-check.ts <stored copy> <draft> [--check]
// Reads the copy of the analysis an update set aside before its first change, and the draft it is
// writing, and prints the structural diff: the edge, element and flow changes, the chains re-pointed
// to another flow, the flows removed, each with the rows that still name it and the flows they could
// name instead, the rows a rule reaches with each row's rule, the rows left unmarked by rule, the
// links into removed chains, the outside elements left with no consumer and the order to re-rate in.
// With --check it also prints the consumer causes whose linked chain changed, and refuses with
// UPDATE_MISMATCH a draft whose stale flags, ratings outside the stale set, links into removed
// chains or removed flows still named disagree, in which a row names a flow with no source whose
// kind is not catalog, or in which a rating's rationale changes under the rescored or authored
// review it kept. A copy that is not the draft's baseline is UPDATE_BASELINE on either run. It
// runs the legacy gate and the schema on both documents, never the invariants or the priorities,
// and writes nothing. The draft's schema check exempts a missing priority on a chain the copy
// lacks, since priority.ts writes that block only after the --check run.
// Its edges, elements, flows, chains re-pointed, flows removed and stale sections and its last line
// are the summary the update copies into meta.history.
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
import { ptr } from "./lib/pointer.ts";

/** Prints every issue of a stage and reports whether there was any. */
function stage(issues: Issue[]): boolean {
  writeIssues(issues);
  return issues.length > 0;
}

function prefixed(issues: Issue[], prefix: string): Issue[] {
  return issues.map((i) => ({ ...i, message: `${prefix}${i.message}` }));
}

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** The schema's message for a chain with no priority block, in lib/schema.ts's form. */
const MISSING_PRIORITY = `missing required property ${JSON.stringify("priority")}`;

/** Each entry's id in a document's chains[], by index, or undefined where the entry or its id is not
 *  what the schema asks; it reads the document before the schema has passed. */
function chainIds(doc: unknown): (string | undefined)[] {
  const chains: unknown[] = isObject(doc) && Array.isArray(doc.chains) ? doc.chains : [];
  return chains.map((c) => (isObject(c) && typeof c.id === "string" ? c.id : undefined));
}

/** The schema issues of the draft, less a missing priority on each chain whose id the stored copy
 *  lacks: priority.ts writes that block after the --check run, so a new chain's draft has none yet. */
function draftSchemaIssues(copy: unknown, draft: unknown): Issue[] {
  const held = new Set(chainIds(copy));
  const fresh = new Set(chainIds(draft).flatMap((id, n) => (id !== undefined && !held.has(id) ? [ptr("chains", n)] : [])));
  return checkSchema(draft).filter((i) => i.message !== MISSING_PRIORITY || !fresh.has(i.pointer));
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
  if (stage([...prefixed(checkSchema(rawCopy), "the stored copy: "), ...prefixed(draftSchemaIssues(rawCopy, rawDraft), "the draft: ")])) return 2;
  const copy = rawCopy as FmeaDocument;
  const draft = rawDraft as FmeaDocument;
  if (stage(baselineIssues(copy, draft, check))) return 2;
  const diff = diffUpdate(copy, draft);
  process.stdout.write(diffLines(diff, check).join("\n") + "\n");
  if (check && stage(mismatchIssues(copy, draft, diff))) return 2;
  return 0;
}

if (isEntry(import.meta)) run(main);
