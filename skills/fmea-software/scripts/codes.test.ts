import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import { isEntry } from "./lib/cli.ts";
import { CODES, ScriptError, exitStatus, formatError } from "./lib/codes.ts";
import { SKILL_ROOT, clone, minimalDoc, rating, runCli, withTempDir } from "./test-helpers.ts";

/** The fixture CLI that `run()` is tested through, written to a temporary directory instead of
 *  into `scripts/lib/`: the skill ships no file that is not a real command, and the plan's
 *  ownership manifest stays the list of shipped files. Everything else about the invocation is
 *  exactly a shipped command's — Node spawns the `.ts` file as its entry point, `import.meta.main`
 *  is true, it ends with the shipped commands' `if (isEntry(import.meta)) run(main);`, and
 *  `run(main)` alone decides the exit status and what reaches stderr. `meta` replaces the
 *  `import.meta` that line passes, so one test can stand in for a runtime without
 *  `import.meta.main`. The imports are `file:` URLs because the temporary directory sits outside
 *  the repository, and the sibling `package.json` pins the module system Node would otherwise have
 *  to infer. */
function demoCliSource(meta = "import.meta"): string {
  const lib = (name: string): string =>
    JSON.stringify(pathToFileURL(join(SKILL_ROOT, "scripts", "lib", name)).href);
  return [
    `import { ScriptError } from ${lib("codes.ts")};`,
    `import { isEntry, run } from ${lib("cli.ts")};`,
    ``,
    `export function main(argv: string[]): number | Promise<number> {`,
    `  if (argv[0] === "async-two") return (async () => 2)();`,
    `  if (argv[0] === "async-err") return (async () => { throw new ScriptError("SCHEMA", "boom", "/meta/name"); })();`,
    `  if (argv[0] === "async-internal") return (async () => { throw new Error("kaboom"); })();`,
    `  if (argv[0] === "async-big") return (async () => { console.log("x".repeat(300000)); return 0; })();`,
    `  if (argv[0] === "err") throw new ScriptError("SCHEMA", "boom", "/meta/name");`,
    `  if (argv[0] === "internal") throw new Error("kaboom");`,
    `  if (argv[0] === "two") return 2;`,
    `  if (argv[0] === "big") {`,
    `    console.log("x".repeat(300000));`,
    `    return 0;`,
    `  }`,
    `  return 0;`,
    `}`,
    ``,
    `if (isEntry(${meta})) run(main);`,
    ``,
  ].join("\n");
}

function runDemoCli(args: string[], meta?: string): { status: number; stdout: string; stderr: string } {
  return withTempDir((dir) => {
    writeFileSync(join(dir, "package.json"), `{"type": "module"}\n`);
    const script = join(dir, "cli-demo.ts");
    writeFileSync(script, demoCliSource(meta));
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  });
}

test("formatError without a pointer prints code and message", () => {
  assert.equal(formatError("SCHEMA", "meta.name is required"), "error SCHEMA: meta.name is required");
});

test("formatError appends the pointer when the failure is located", () => {
  assert.equal(
    formatError("SCHEMA", "meta.name is required", "/meta/name"),
    "error SCHEMA: meta.name is required at /meta/name",
  );
});

test("formatError keeps a multi-line message on one line", () => {
  assert.equal(
    formatError("IO_READ", "cannot read x.json: Unexpected token 'H',\n  \"bands\"... is not valid JSON"),
    "error IO_READ: cannot read x.json: Unexpected token 'H', \"bands\"... is not valid JSON",
  );
});

test("formatError keeps a pointer carrying a control character on one line", () => {
  const line = formatError("SCHEMA", "unexpected property", "/meta/a\nb");
  assert.ok(!line.includes("\n"), `pointer split the line: ${JSON.stringify(line)}`);
  assert.equal(line, "error SCHEMA: unexpected property at /meta/a\\u000ab");
});

test("formatError escapes a line separator in the pointer, the class the message half collapses", () => {
  const line = formatError("SCHEMA", "unexpected property", "/meta/a\u2028b\u2029c");
  assert.ok(!/[\u2028\u2029]/.test(line), `a line separator survived in the pointer: ${JSON.stringify(line)}`);
  assert.equal(line, "error SCHEMA: unexpected property at /meta/a\\u2028b\\u2029c");
});

test("CODES holds exactly the twenty codes of the closed list", () => {
  assert.deepEqual(Object.keys(CODES), [
    "USAGE",
    "NODE",
    "TRACKER_PLAN",
    "TRACKER_PUBLIC",
    "SCHEMA",
    "INVARIANT",
    "PRIORITY_MISMATCH",
    "TABLE_ID_MISMATCH",
    "RATING_RANGE",
    "COMPUTED_MISSING",
    "COMPUTED_STALE",
    "TRACKER_CONFIG",
    "IO_READ",
    "IO_WRITE",
    "IO_EXISTS",
    "IO_CHANGED",
    "TABLE_MALFORMED",
    "TRACKER_UNAVAILABLE",
    "TRACKER_REJECTED",
    "INTERNAL",
  ]);
});

test("exitStatus maps every code to 1 usage, 2 validation, or 3 I/O", () => {
  assert.equal(exitStatus("USAGE"), 1);
  assert.equal(exitStatus("NODE"), 1);
  assert.equal(exitStatus("SCHEMA"), 2);
  assert.equal(exitStatus("INVARIANT"), 2);
  assert.equal(exitStatus("PRIORITY_MISMATCH"), 2);
  assert.equal(exitStatus("TABLE_ID_MISMATCH"), 2);
  assert.equal(exitStatus("RATING_RANGE"), 2);
  assert.equal(exitStatus("COMPUTED_MISSING"), 2);
  assert.equal(exitStatus("COMPUTED_STALE"), 2);
  assert.equal(exitStatus("IO_READ"), 3);
  assert.equal(exitStatus("IO_WRITE"), 3);
  assert.equal(exitStatus("IO_EXISTS"), 3);
  assert.equal(exitStatus("IO_CHANGED"), 3);
  assert.equal(exitStatus("TABLE_MALFORMED"), 3);
  assert.equal(exitStatus("INTERNAL"), 3);
  assert.equal(exitStatus("TRACKER_PLAN"), 1);
  assert.equal(exitStatus("TRACKER_PUBLIC"), 1);
  assert.equal(exitStatus("TRACKER_CONFIG"), 2);
  assert.equal(exitStatus("TRACKER_UNAVAILABLE"), 3);
  assert.equal(exitStatus("TRACKER_REJECTED"), 3);
});

test("NODE, the too-old-runtime code, is a usage failure: exit status 1", () => {
  assert.equal(CODES.NODE, 1);
  assert.equal(exitStatus("NODE"), 1);
});

test("ScriptError carries code, message, and pointer", () => {
  const err = new ScriptError("INVARIANT", "chain id repeated", "/chains/2/id");
  assert.ok(err instanceof Error);
  assert.equal(err.name, "ScriptError");
  assert.equal(err.code, "INVARIANT");
  assert.equal(err.message, "chain id repeated");
  assert.equal(err.pointer, "/chains/2/id");
});

test("ScriptError without a pointer has an undefined pointer", () => {
  const err = new ScriptError("IO_READ", "cannot read a.json");
  assert.equal(err.pointer, undefined);
});

test("rating fills rationale, evidence kind, and a reviewed review block", () => {
  assert.deepEqual(rating(8), {
    value: 8,
    rationale: "test rationale",
    evidence_kind: "estimate",
    review: { status: "rescored", by: "T. Tester", date: "2026-09-03" },
  });
});

test("a provisional rating carries no by or date", () => {
  assert.deepEqual(rating(3, "provisional").review, { status: "provisional" });
  assert.deepEqual(rating(3, "authored", "observed_incident").review, {
    status: "authored",
    by: "T. Tester",
    date: "2026-09-03",
  });
});

test("minimalDoc is one element, one function, one chain priced M with rpn 96", () => {
  const doc = minimalDoc();
  assert.equal(doc.elements.length, 1);
  assert.equal(doc.functions.length, 1);
  assert.equal(doc.chains.length, 1);
  assert.deepEqual(doc.chains[0].priority, { value: "M", table: "priority-fmea-software-v1", rpn: 96 });
  assert.equal(doc.chains[0].ratings.S.value * doc.chains[0].ratings.O.value * doc.chains[0].ratings.D.value, 96);
  assert.equal(doc.meta.scales.priority_table, "priority-fmea-software-v1");
});

test("clone is a deep copy", () => {
  const doc = minimalDoc();
  const copy = clone(doc);
  copy.chains[0].ratings.S.value = 1;
  assert.equal(doc.chains[0].ratings.S.value, 8);
});

test("withTempDir gives a directory that exists inside and is gone after", () => {
  const dir = withTempDir((d) => {
    assert.ok(existsSync(d));
    return d;
  });
  assert.equal(existsSync(dir), false);
});

test("minimalDoc's priority is the one the shipped table actually yields", () => {
  const table = JSON.parse(
    readFileSync(join(SKILL_ROOT, "data", "priority-fmea-software-v1.json"), "utf8"),
  ) as { id: string; bands: Record<string, [number, number][]>; cells: Record<string, string> };
  const band = (factor: string, value: number): number =>
    table.bands[factor].findIndex(([lo, hi]) => value >= lo && value <= hi) + 1;
  const chain = minimalDoc().chains[0];
  const key = `${band("S", 8)}-${band("O", 3)}-${band("D", 4)}`;
  assert.equal(table.cells[key], chain.priority.value);
  assert.equal(8 * 3 * 4, chain.priority.rpn);
  assert.equal(table.id, minimalDoc().meta.scales.priority_table);
});

test("run() prints one coded line to stderr and exits 2 on a ScriptError", () => {
  const result = runDemoCli(["err"]);
  assert.equal(result.status, 2);
  assert.equal(result.stderr.trim(), "error SCHEMA: boom at /meta/name");
  assert.equal(result.stdout, "");
});

test("run() reports any other exception as INTERNAL and exits 3", () => {
  const result = runDemoCli(["internal"]);
  assert.equal(result.status, 3);
  assert.equal(result.stderr.trim(), "error INTERNAL: Error: kaboom");
});

test("run() exits with main's return value and prints nothing on success", () => {
  const result = runDemoCli([]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});

test("run() exits with main's non-zero return value and prints nothing", () => {
  const result = runDemoCli(["two"]);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "");
});

test("run() flushes a large stdout payload instead of truncating it", () => {
  const result = runDemoCli(["big"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.length, 300001);
});

test("run() exits with the value an async main resolves to", () => {
  const result = runDemoCli(["async-two"]);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "");
});

test("run() prints the coded line when an async main rejects with a ScriptError", () => {
  const result = runDemoCli(["async-err"]);
  assert.equal(result.status, 2);
  assert.equal(result.stderr.trim(), "error SCHEMA: boom at /meta/name");
  assert.equal(result.stdout, "");
});

test("run() reports any other rejection as INTERNAL and exits 3", () => {
  const result = runDemoCli(["async-internal"]);
  assert.equal(result.status, 3);
  assert.equal(result.stderr.trim(), "error INTERNAL: Error: kaboom");
});

test("run() flushes a large stdout payload from an async main", () => {
  const result = runDemoCli(["async-big"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.length, 300001);
});

/** Calls `isEntry` with a stand-in `import.meta`, capturing what it writes to stderr and the
 *  exit status it sets, then puts both back so the test process itself does not fail. */
function callIsEntry(meta: object): { entry: boolean; stderr: string; exitCode: typeof process.exitCode } {
  const chunks: string[] = [];
  const write = mock.method(process.stderr, "write", (chunk: string | Uint8Array): boolean => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    const entry = isEntry(meta as ImportMeta);
    return { entry, stderr: chunks.join(""), exitCode: process.exitCode };
  } finally {
    write.mock.restore();
    process.exitCode = undefined;
  }
}

test("isEntry passes import.meta.main through when the runtime has it", () => {
  assert.deepEqual(callIsEntry({ main: true }), { entry: true, stderr: "", exitCode: undefined });
  assert.deepEqual(callIsEntry({ main: false }), { entry: false, stderr: "", exitCode: undefined });
});

test("isEntry fails closed on a runtime without import.meta.main: one NODE line, exit status 1", () => {
  const result = callIsEntry({});
  assert.equal(result.entry, false);
  assert.equal(result.exitCode, 1);
  assert.ok(result.stderr.endsWith("\n"), `no trailing newline: ${JSON.stringify(result.stderr)}`);
  const lines = result.stderr.slice(0, -1).split("\n");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^error NODE: Node \S+ lacks import\.meta\.main; run under Node 24\.2 or later$/);
});

test("a CLI on a runtime without import.meta.main exits 1 with the NODE line and never runs main", () => {
  const result = runDemoCli(["big"], "{} as ImportMeta");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^error NODE: Node \S+ lacks import\.meta\.main; run under Node 24\.2 or later\n$/);
});

test("every shipped CLI ends with the isEntry guard, never a bare import.meta.main check", () => {
  for (const name of ["validate.ts", "priority.ts", "render.ts", "track.ts"]) {
    const src = readFileSync(join(SKILL_ROOT, "scripts", name), "utf8");
    assert.ok(src.endsWith("\nif (isEntry(import.meta)) run(main);\n"), `${name} must end with the isEntry guard`);
    assert.ok(!src.includes("if (import.meta.main)"), `${name} reads import.meta.main without the guard`);
  }
});

/** Every specifier of a sibling file a source imports: `from "./x.ts"`, a side-effect
 *  `import "./x.ts"` and a dynamic `import("./x.ts")`, in double or single quotes. */
function siblingImports(src: string): string[] {
  return [...src.matchAll(/\b(?:from|import)\s*\(?\s*(["'])\.\/([^"'/]+)\1/g)].map((m) => m[2]);
}

test("the import scan sees a from clause, a side-effect import and a dynamic import, in either quote", () => {
  assert.deepEqual(siblingImports([
    `import { a } from "./validate.ts";`,
    `import { b } from './render.ts';`,
    `import "./track.ts";`,
    `import './priority.ts';`,
    `const m = await import("./validate.ts");`,
    `const n = await import( './render.ts' );`,
    `import { c } from "./lib/validation.ts";`,
  ].join("\n")), ["validate.ts", "render.ts", "track.ts", "priority.ts", "validate.ts", "render.ts"]);
});

test("no shipped CLI imports another, so a command on a runtime without import.meta.main prints one NODE line, not two", () => {
  const clis = ["validate.ts", "priority.ts", "render.ts", "track.ts"];
  for (const name of clis) {
    const src = readFileSync(join(SKILL_ROOT, "scripts", name), "utf8");
    assert.deepEqual(siblingImports(src).filter((spec) => clis.includes(spec)), [], `${name} imports another CLI, whose isEntry guard then runs too`);
  }
});

test("runCli resolves its script under scripts/ and reports the child's status and stderr", () => {
  const result = runCli("lib/nope.ts", []);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(`Cannot find module '${join(SKILL_ROOT, "scripts", "lib", "nope.ts")}'`));
  assert.equal(result.stdout, "");
});

const TYPE_NAMES = [
  "ElementKind", "SourceKind", "ControlKind", "ControlStatus", "ControlEvidenceKind",
  "RatingEvidenceKind", "ReviewStatus", "ActionStatus", "CauseOrigin", "StaleReason",
  "AssumptionStatus", "Strength", "Factor", "Severity", "HistoryEntry", "Assumption",
  "Review", "Boundary", "Scales", "Meta", "Dependency", "Source", "Element", "Fn", "Cause",
  "ControlEvidence", "Control", "RatingReview", "Rating", "Ratings", "Priority", "Action",
  "Handoff", "CatalogRef", "Stale", "Effects", "Chain", "Lint", "Computed", "FmeaDocument",
];

test("lib/types.ts loads, emits no runtime code, and declares every exported type", async () => {
  const mod = await import("./lib/types.ts");
  assert.deepEqual(Object.keys(mod), []); // types only: type stripping leaves no runtime export
  const src = readFileSync(join(SKILL_ROOT, "scripts", "lib", "types.ts"), "utf8");
  for (const name of TYPE_NAMES) {
    assert.ok(new RegExp(`export (?:type|interface) ${name}\\b`).test(src), `types.ts must export ${name}`);
  }
});
