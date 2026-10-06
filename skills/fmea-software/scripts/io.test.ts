import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { ScriptError } from "./lib/codes.ts";
import {
  assertExtension,
  assertWritable,
  readJsonFile,
  readTextFile,
  stringifyDocument,
  writeFileAtomic,
} from "./lib/io.ts";
import { withTempDir } from "./test-helpers.ts";

test("readJsonFile parses a JSON file", () => {
  withTempDir((dir) => {
    const path = join(dir, "a.json");
    writeFileSync(path, '{"ok": true}', "utf8");
    assert.deepEqual(readJsonFile(path), { ok: true });
  });
});

test("readJsonFile on a missing path is IO_READ and names the path", () => {
  withTempDir((dir) => {
    const path = join(dir, "missing.json");
    assert.throws(() => readJsonFile(path), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "IO_READ");
      assert.ok(err.message.includes(path));
      return true;
    });
  });
});

test("readJsonFile on unparsable content is IO_READ", () => {
  withTempDir((dir) => {
    const path = join(dir, "bad.json");
    writeFileSync(path, "{not json", "utf8");
    assert.throws(() => readJsonFile(path), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "IO_READ");
      assert.ok(err.message.includes(path));
      return true;
    });
  });
});

test("readTextFile returns the text and is IO_READ when the file is missing", () => {
  withTempDir((dir) => {
    const path = join(dir, "a.md");
    writeFileSync(path, "hello\n", "utf8");
    assert.equal(readTextFile(path), "hello\n");
    assert.throws(() => readTextFile(join(dir, "no.md")), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "IO_READ");
      return true;
    });
  });
});

test("readJsonFile reads a file that begins with a byte-order mark as the same document", () => {
  withTempDir((dir) => {
    const text = '{\n  "meta": { "id": "fmea-bom" },\n  "chains": []\n}\n';
    const plain = join(dir, "plain.json");
    const marked = join(dir, "marked.json");
    writeFileSync(plain, text, "utf8");
    writeFileSync(marked, `\uFEFF${text}`, "utf8");
    assert.deepEqual([...readFileSync(marked).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.deepEqual(readJsonFile(marked), readJsonFile(plain));
  });
});

test("readTextFile strips one leading byte-order mark and keeps any further mark", () => {
  withTempDir((dir) => {
    const path = join(dir, "marks.md");
    writeFileSync(path, "\uFEFF\uFEFFhello\uFEFF\n", "utf8");
    assert.equal(readTextFile(path), "\uFEFFhello\uFEFF\n");
    writeFileSync(path, "\uFEFF hello\n", "utf8");
    assert.equal(readTextFile(path), " hello\n");
  });
});

test("writeFileAtomic writes the content and leaves no temporary file behind", () => {
  withTempDir((dir) => {
    const path = join(dir, "out.json");
    writeFileAtomic(path, '{"a": 1}\n');
    assert.equal(readFileSync(path, "utf8"), '{"a": 1}\n');
    assert.deepEqual(readdirSync(dir), ["out.json"]);
  });
});

test("writeFileAtomic replaces an existing file", () => {
  withTempDir((dir) => {
    const path = join(dir, "out.json");
    writeFileSync(path, "old", "utf8");
    writeFileAtomic(path, "new");
    assert.equal(readFileSync(path, "utf8"), "new");
    assert.deepEqual(readdirSync(dir), ["out.json"]);
  });
});

test("writeFileAtomic stages inside the target directory, so a missing directory is IO_WRITE", () => {
  withTempDir((dir) => {
    const path = join(dir, "nosuchsub", "out.json");
    assert.throws(() => writeFileAtomic(path, "x"), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "IO_WRITE");
      return true;
    });
    assert.equal(existsSync(join(dir, "nosuchsub")), false);
  });
});

test("writeFileAtomic stages the temporary file beside the target, not in os.tmpdir()", () => {
  withTempDir((dir) => {
    const path = join(dir, "out.json");
    // Occupy the exact sibling temp path this process would use, as a directory:
    // a same-directory implementation cannot write there and fails with IO_WRITE;
    // one staging in os.tmpdir() would not touch it and would succeed.
    mkdirSync(`${path}.tmp-${process.pid}`);
    assert.throws(() => writeFileAtomic(path, "x"), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "IO_WRITE");
      return true;
    });
    assert.equal(existsSync(path), false);
  });
});

test("writeFileAtomic removes the staged temporary file when the rename fails", () => {
  withTempDir((dir) => {
    const path = join(dir, "out.json");
    // A directory at the target: staging succeeds and only renameSync fails, so the catch
    // arm's rmSync is the only thing that can remove the file this call staged.
    mkdirSync(path);
    assert.throws(() => writeFileAtomic(path, "x"), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "IO_WRITE");
      return true;
    });
    assert.deepEqual(readdirSync(dir), ["out.json"]);
  });
});

test("assertExtension accepts the right extension and is USAGE otherwise", () => {
  assertExtension("a.json", ".json", "input");
  assert.throws(() => assertExtension("a.txt", ".json", "input"), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.code, "USAGE");
    assert.equal(err.message, "input must end in .json");
    return true;
  });
});

test("assertWritable refuses an existing path without force", () => {
  withTempDir((dir) => {
    const path = join(dir, "report.html");
    writeFileSync(path, "", "utf8");
    assert.throws(() => assertWritable(path, false), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "IO_EXISTS");
      assert.ok(err.message.includes(path));
      return true;
    });
    assertWritable(path, true);
    const absent = join(dir, "other.html");
    assert.equal(existsSync(absent), false);
    assertWritable(absent, false);
  });
});

test("stringifyDocument uses two-space indentation and a trailing newline", () => {
  assert.equal(stringifyDocument({ a: 1, b: [2] }), '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}\n');
});
