// A document in which one object repeats a key is refused on reading: JSON.parse keeps the last
// of the two values and says nothing, so the first would be invisible to every check and gone
// after the next --write. The scan itself is in lib/duplicate-keys.ts; these tests reach it
// through readJsonFile and the four scripts, the way a document does.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ScriptError } from "./lib/codes.ts";
import { readJsonFile, stringifyDocument } from "./lib/io.ts";
import { minimalDoc, runCli, withTempDir } from "./test-helpers.ts";

/** The ScriptError readJsonFile throws for `text`, which the test expects to be refused. */
function refusal(text: string): { path: string; err: ScriptError } {
  return withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    writeFileSync(path, text, "utf8");
    try {
      readJsonFile(path);
    } catch (err) {
      assert.ok(err instanceof ScriptError, String(err));
      return { path, err };
    }
    assert.fail("readJsonFile accepted a document that repeats a key");
  });
}

test("readJsonFile names the top-level object when the top level repeats a key", () => {
  const { path, err } = refusal('{"id": "first", "elements": [], "id": "second"}');
  assert.equal(err.code, "IO_READ");
  assert.equal(err.pointer, "");
  assert.equal(err.message, `cannot read ${path}: the key "id" appears more than once in the top-level object`);
});

test("readJsonFile reports the first repeat in text order, with a pointer through arrays", () => {
  const { err } = refusal(
    '{"chains": [{"id": "a"}, {"id": "b", "causes": [{"text": "x"}, {"text": "y", "text": "z"}]}], "meta": {"name": "m", "name": "n"}}',
  );
  assert.equal(err.pointer, "/chains/1/causes/1");
  assert.match(err.message, /the key "text" appears more than once in the object$/);
});

test("readJsonFile compares keys as JSON.parse decodes them, so an escaped spelling is the same key", () => {
  const { err } = refusal('{"meta": {"name": "first", "n\\u0061me": "second"}}');
  assert.equal(err.pointer, "/meta");
  assert.match(err.message, /the key "name" appears more than once/);
});

test("readJsonFile escapes the pointer's segments and quotes the key as a JSON string", () => {
  const { err } = refusal('{"a/b~c": {"say \\"hi\\"": 1, "say \\"hi\\"": 2}}');
  assert.equal(err.pointer, "/a~1b~0c");
  assert.match(err.message, /the key "say \\"hi\\"" appears more than once in the object$/);
});

test("readJsonFile is not misled by braces, quotes and commas inside strings, by a value that spells a later key, nor by one key in sibling or nested objects", () => {
  const { err } = refusal(
    '{"s": "{\\"x\\": 1, \\"x\\": 2}", "t": "ends in a backslash \\\\", "v": "o", "k": {"k": {"k": 1}}, "list": [{"k": 1}, {"k": 2}], "o": {"k": 3, "k": 4}}',
  );
  assert.equal(err.pointer, "/o");
  assert.match(err.message, /the key "k" appears more than once in the object$/);
});

test("readJsonFile finds a repeat nested 20000 objects deep without overflowing the stack", () => {
  const depth = 20000;
  const { err } = refusal('{"a": '.repeat(depth) + '{"b": 1, "b": 2}' + "}".repeat(depth));
  assert.equal(err.code, "IO_READ");
  assert.equal(err.pointer, "/a".repeat(depth));
});

test("every script refuses a document that repeats a key with one IO_READ line, exit 3, and leaves it byte for byte unchanged", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    const text = stringifyDocument(minimalDoc()).replace('"name": "Minimal",', '"name": "First",\n    "name": "Minimal",');
    assert.notEqual(text, stringifyDocument(minimalDoc()));
    writeFileSync(path, text, "utf8");
    const report = join(dir, "report.html");
    const line = `error IO_READ: cannot read ${path}: the key "name" appears more than once in the object at /meta\n`;
    for (const [script, ...args] of [
      ["validate.ts", path, "--write"],
      ["priority.ts", path, "--write"],
      ["render.ts", path, "--out", report],
      ["track.ts", "plan", path],
    ]) {
      const result = runCli(script, args);
      assert.equal(result.status, 3, `${script}: ${result.stderr}`);
      assert.equal(result.stderr, line, script);
      assert.equal(result.stdout, "", script);
      assert.equal(readFileSync(path, "utf8"), text, script);
    }
    assert.equal(existsSync(report), false);
  });
});
