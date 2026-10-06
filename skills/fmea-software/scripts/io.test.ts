import assert from "node:assert/strict";
import fs, {
  chmodSync,
  chownSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { mock, test } from "node:test";
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

/** What writeFileAtomic asked of the file system, in order: each fsyncSync, of a file or of a
 *  folder, and each renameSync with its two paths. */
interface Recorded {
  ops: string[];
  folders: number[];
  renames: [string, string][];
}

/** Runs `fn` with fsyncSync and renameSync recorded. `refuse` may return an error for a sync of a
 *  file or of a folder, which is then thrown in place of the sync, as a platform that refuses it
 *  would. io.ts imports both functions by name, so the named exports are re-synced after each
 *  patch and after the restore. */
function recordSyncs(refuse: (kind: "file" | "folder") => Error | undefined, fn: () => void): Recorded {
  const recorded: Recorded = { ops: [], folders: [], renames: [] };
  const realFsync = fs.fsyncSync;
  const realRename = fs.renameSync;
  const fsync = mock.method(fs, "fsyncSync", (fd: number) => {
    const stats = fs.fstatSync(fd);
    const kind = stats.isDirectory() ? "folder" : "file";
    recorded.ops.push(`fsync ${kind}`);
    if (kind === "folder") recorded.folders.push(stats.ino);
    const refusal = refuse(kind);
    if (refusal !== undefined) throw refusal;
    realFsync(fd);
  });
  const rename = mock.method(fs, "renameSync", (from: string, to: string) => {
    recorded.ops.push("rename");
    recorded.renames.push([from, to]);
    realRename(from, to);
  });
  syncBuiltinESMExports();
  try {
    fn();
  } finally {
    fsync.mock.restore();
    rename.mock.restore();
    syncBuiltinESMExports();
  }
  return recorded;
}

function errnoError(code: string, message: string): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

const NO_MODES = process.platform === "win32" ? "Windows keeps no permission bits beyond read-only" : false;
const NO_LINKS = process.platform === "win32" ? "a symbolic link needs a privilege on Windows" : false;

test("writeFileAtomic keeps the mode of the file it replaces and gives a new file the mode the umask gives", { skip: NO_MODES }, () => {
  withTempDir((dir) => {
    // Two modes, so that whatever the umask, a new file cannot have both by chance.
    for (const mode of [0o600, 0o640]) {
      const path = join(dir, `mode-${mode.toString(8)}.json`);
      writeFileSync(path, "old", "utf8");
      chmodSync(path, mode);
      writeFileAtomic(path, "new");
      assert.equal(readFileSync(path, "utf8"), "new");
      assert.equal((statSync(path).mode & 0o777).toString(8), mode.toString(8));
    }
    const fresh = join(dir, "fresh.json");
    const reference = join(dir, "reference.json");
    writeFileAtomic(fresh, "new");
    writeFileSync(reference, "new", "utf8");
    assert.equal((statSync(fresh).mode & 0o777).toString(8), (statSync(reference).mode & 0o777).toString(8));
  });
});

test("writeFileAtomic never holds the new content under permission bits other than those of the file it replaces", { skip: NO_MODES }, () => {
  withTempDir((dir) => {
    for (const mode of [0o600, 0o640]) {
      const path = join(dir, `mode-${mode.toString(8)}.json`);
      writeFileSync(path, "old", "utf8");
      chmodSync(path, mode);
      // The bits of the staged file at the moment the content goes into it, whatever writes it.
      const seen: string[] = [];
      const realWrite = fs.writeFileSync;
      const write = mock.method(fs, "writeFileSync", (file: number | string, data: string, encoding: BufferEncoding) => {
        realWrite(file, data, encoding);
        const stats = typeof file === "number" ? fs.fstatSync(file) : fs.statSync(file);
        seen.push((stats.mode & 0o777).toString(8));
      });
      syncBuiltinESMExports();
      try {
        writeFileAtomic(path, "new");
      } finally {
        write.mock.restore();
        syncBuiltinESMExports();
      }
      assert.deepEqual(seen, [mode.toString(8)]);
      assert.equal(readFileSync(path, "utf8"), "new");
    }
  });
});

/** A group the running user belongs to besides the one new files get, if there is one. */
const OTHER_GROUP = process.platform === "win32" ? undefined : process.getgroups?.().find((gid) => gid !== process.getegid?.());

test("writeFileAtomic keeps the group of the file it replaces", { skip: OTHER_GROUP === undefined ? "the user belongs to no second group" : false }, () => {
  withTempDir((dir) => {
    const path = join(dir, "grouped.json");
    writeFileSync(path, "old", "utf8");
    chownSync(path, statSync(path).uid, OTHER_GROUP ?? statSync(path).gid);
    chmodSync(path, 0o640);
    writeFileAtomic(path, "new");
    assert.equal(readFileSync(path, "utf8"), "new");
    assert.equal(statSync(path).gid, OTHER_GROUP);
    assert.equal((statSync(path).mode & 0o777).toString(8), "640");
  });
});

test("writeFileAtomic drops the group bits when it may not keep the group of the file it replaces", { skip: OTHER_GROUP === undefined ? "the user belongs to no second group" : false }, () => {
  withTempDir((dir) => {
    const path = join(dir, "grouped.json");
    writeFileSync(path, "old", "utf8");
    chownSync(path, statSync(path).uid, OTHER_GROUP ?? statSync(path).gid);
    chmodSync(path, 0o640);
    const chown = mock.method(fs, "fchownSync", () => {
      throw errnoError("EPERM", "operation not permitted, fchown");
    });
    syncBuiltinESMExports();
    try {
      writeFileAtomic(path, "new");
    } finally {
      chown.mock.restore();
      syncBuiltinESMExports();
    }
    assert.equal(readFileSync(path, "utf8"), "new");
    assert.equal(statSync(path).gid, process.getegid?.());
    assert.equal((statSync(path).mode & 0o777).toString(8), "600");
  });
});

test("writeFileAtomic writes through a symbolic link into the file it points to and keeps the link", { skip: NO_LINKS }, () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, "real"));
    mkdirSync(join(dir, "view"));
    const target = join(dir, "real", "doc.json");
    const link = join(dir, "view", "doc.json");
    writeFileSync(target, "old", "utf8");
    chmodSync(target, 0o600);
    symlinkSync(join("..", "real", "doc.json"), link);
    writeFileAtomic(link, "new");
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.equal(readlinkSync(link), join("..", "real", "doc.json"));
    assert.equal(readFileSync(target, "utf8"), "new");
    assert.equal((statSync(target).mode & 0o777).toString(8), "600");
    assert.deepEqual(readdirSync(join(dir, "real")), ["doc.json"]);
    assert.deepEqual(readdirSync(join(dir, "view")), ["doc.json"]);
  });
});

test("writeFileAtomic syncs the staged file before the rename and the folder after it", () => {
  withTempDir((dir) => {
    const path = join(dir, "out.json");
    writeFileSync(path, "old", "utf8");
    const recorded = recordSyncs(() => undefined, () => writeFileAtomic(path, "new"));
    assert.deepEqual(recorded.ops, ["fsync file", "rename", "fsync folder"]);
    assert.deepEqual(recorded.folders, [statSync(dir).ino]);
    assert.equal(readFileSync(path, "utf8"), "new");
  });
});

test("writeFileAtomic stages, renames and syncs in the folder of the file a symbolic link points to", { skip: NO_LINKS }, () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, "real"));
    mkdirSync(join(dir, "view"));
    writeFileSync(join(dir, "real", "doc.json"), "old", "utf8");
    const link = join(dir, "view", "doc.json");
    symlinkSync(join("..", "real", "doc.json"), link);
    const target = realpathSync(join(dir, "real", "doc.json"));
    const recorded = recordSyncs(() => undefined, () => writeFileAtomic(link, "new"));
    assert.deepEqual(recorded.renames, [[`${target}.tmp-${process.pid}`, target]]);
    assert.deepEqual(recorded.folders, [statSync(join(dir, "real")).ino]);
  });
});

test("writeFileAtomic goes on when the platform refuses to sync the folder after the rename", () => {
  withTempDir((dir) => {
    const path = join(dir, "out.json");
    writeFileSync(path, "old", "utf8");
    const refuse = (kind: "file" | "folder"): Error | undefined => (kind === "folder" ? errnoError("EINVAL", "invalid argument, fsync") : undefined);
    const recorded = recordSyncs(refuse, () => writeFileAtomic(path, "new"));
    assert.deepEqual(recorded.ops, ["fsync file", "rename", "fsync folder"]);
    assert.equal(readFileSync(path, "utf8"), "new");
    assert.deepEqual(readdirSync(dir), ["out.json"]);
  });
});

test("writeFileAtomic leaves the old file whole and removes the staged file when the staged file cannot be synced", () => {
  withTempDir((dir) => {
    const path = join(dir, "out.json");
    writeFileSync(path, "old", "utf8");
    const refuse = (kind: "file" | "folder"): Error | undefined => (kind === "file" ? errnoError("EIO", "i/o error, fsync") : undefined);
    assert.throws(() => recordSyncs(refuse, () => writeFileAtomic(path, "new")), (err: unknown) => {
      assert.ok(err instanceof ScriptError);
      assert.equal(err.code, "IO_WRITE");
      assert.equal(err.message, `cannot write ${path}: EIO: i/o error, fsync`);
      return true;
    });
    assert.equal(readFileSync(path, "utf8"), "old");
    assert.deepEqual(readdirSync(dir), ["out.json"]);
  });
});

test("writeFileAtomic does not write through a symbolic link left at its temporary path", { skip: NO_LINKS }, () => {
  withTempDir((dir) => {
    const path = join(dir, "out.json");
    const elsewhere = join(dir, "elsewhere.txt");
    writeFileSync(path, "old", "utf8");
    writeFileSync(elsewhere, "untouched", "utf8");
    symlinkSync(elsewhere, `${path}.tmp-${process.pid}`);
    writeFileAtomic(path, "new");
    assert.equal(readFileSync(elsewhere, "utf8"), "untouched");
    assert.equal(lstatSync(path).isSymbolicLink(), false);
    assert.equal(readFileSync(path, "utf8"), "new");
    assert.deepEqual(readdirSync(dir).sort(), ["elsewhere.txt", "out.json"]);
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
