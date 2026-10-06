import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArgSpec } from "./lib/args.ts";
import { parseArgs } from "./lib/args.ts";
import { ScriptError } from "./lib/codes.ts";

/** The spec `validate.ts` uses: one positional file, a boolean --write, a string --table-file. */
function spec(): ArgSpec {
  return { positional: 1, flags: { write: "boolean", "table-file": "string" } };
}

test("one positional and no flags", () => {
  assert.deepEqual(parseArgs(["a.json"], spec()), { positional: ["a.json"], flags: { write: false } });
});

test("a boolean flag is true when given", () => {
  assert.deepEqual(parseArgs(["a.json", "--write"], spec()), { positional: ["a.json"], flags: { write: true } });
});

test("a string flag takes the next argument as its value", () => {
  assert.deepEqual(parseArgs(["a.json", "--table-file", "t.json"], spec()), {
    positional: ["a.json"],
    flags: { write: false, "table-file": "t.json" },
  });
});

test("flags may come before the positionals", () => {
  assert.deepEqual(parseArgs(["--table-file", "t.json", "--write", "a.json"], spec()), {
    positional: ["a.json"],
    flags: { write: true, "table-file": "t.json" },
  });
});

test("an unknown flag is a usage failure", () => {
  assert.throws(() => parseArgs(["a.json", "--nope"], spec()), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "USAGE");
    assert.equal(err.message, "unknown flag: --nope");
    return true;
  });
});

test("a string flag without a value is a usage failure", () => {
  assert.throws(() => parseArgs(["a.json", "--table-file"], spec()), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "USAGE");
    assert.equal(err.message, "flag --table-file needs a value");
    return true;
  });
});

test("too many positionals is a usage failure", () => {
  assert.throws(() => parseArgs(["a.json", "b.json"], spec()), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "USAGE");
    assert.equal(err.message, "expected 1 positional argument(s), got 2");
    return true;
  });
});

test("too few positionals is a usage failure", () => {
  assert.throws(() => parseArgs(["--write"], spec()), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "USAGE");
    assert.equal(err.message, "expected 1 positional argument(s), got 0");
    return true;
  });
});

test("a bare -- is not special and is rejected as an unknown flag", () => {
  assert.throws(() => parseArgs(["a.json", "--", "b"], spec()), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "USAGE");
    assert.equal(err.message, "unknown flag: --");
    return true;
  });
});

test("--name=value is not supported and is reported as an unknown flag", () => {
  assert.throws(() => parseArgs(["a.json", "--table-file=t.json"], spec()), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "USAGE");
    assert.equal(err.message, "unknown flag: --table-file=t.json");
    return true;
  });
});

test("a flag-shaped token in a string flag's value position is taken as the value", () => {
  assert.deepEqual(parseArgs(["a.json", "--table-file", "--write"], spec()), {
    positional: ["a.json"],
    flags: { write: false, "table-file": "--write" },
  });
});

test("declared boolean flags default to false and absent string flags are absent", () => {
  const parsed = parseArgs(["a.json"], spec());
  assert.equal(parsed.flags.write, false);
  assert.equal("table-file" in parsed.flags, false);
});

test("a flag named after an Object prototype member is still an unknown flag", () => {
  for (const token of ["--constructor", "--toString"]) {
    assert.throws(() => parseArgs(["a.json", token, "x"], spec()), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "USAGE");
      assert.equal(err.message, `unknown flag: ${token}`);
      return true;
    });
  }
});

test("a string flag given twice is a usage failure naming the flag, whatever its values", () => {
  const cases = [
    ["a.json", "--table-file", "t1.json", "--table-file", "t2.json"],
    ["--table-file", "t.json", "--table-file", "t.json", "a.json"],
    ["--table-file", "t1.json", "a.json", "--table-file", "t2.json"],
  ];
  for (const argv of cases) {
    assert.throws(() => parseArgs(argv, spec()), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "USAGE");
      assert.equal(err.message, "flag --table-file is given more than once");
      return true;
    }, argv.join(" "));
  }
});

test("a string flag given a second time without a value is refused as given more than once", () => {
  assert.throws(() => parseArgs(["a.json", "--table-file", "t.json", "--table-file"], spec()), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "USAGE");
    assert.equal(err.message, "flag --table-file is given more than once");
    return true;
  });
});

test("a boolean flag given twice is a usage failure naming the flag; a string flag's flag-shaped value does not count", () => {
  assert.deepEqual(parseArgs(["a.json", "--table-file", "--write", "--write"], spec()), {
    positional: ["a.json"],
    flags: { write: true, "table-file": "--write" },
  });
  for (const argv of [["a.json", "--write", "--write"], ["--write", "a.json", "--write"]]) {
    assert.throws(() => parseArgs(argv, spec()), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "USAGE");
      assert.equal(err.message, "flag --write is given more than once");
      return true;
    }, argv.join(" "));
  }
});
