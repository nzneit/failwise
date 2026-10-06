import {
  closeSync,
  existsSync,
  fchmodSync,
  fchownSync,
  fstatSync,
  fsyncSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import { ScriptError } from "./codes.ts";
import { findDuplicateKey } from "./duplicate-keys.ts";

export function readTextFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new ScriptError("IO_READ", `cannot read ${path}: ${(err as Error).message}`);
  }
}

/** The parsed JSON at `path`. A text JSON.parse refuses, and a text in which an object carries one
 *  key twice, are IO_READ, the second at the pointer of that object: JSON.parse would keep the last
 *  of the values without a word, and the next --write would drop the first from the file. */
export function readJsonFile(path: string): unknown {
  return parseJsonText(path, readTextFile(path));
}

/** The value of the JSON text read from `path`: IO_READ when JSON.parse refuses it, and IO_READ at
 *  the object's pointer when an object in it carries one key twice. Every function of this module
 *  that parses a file's text calls it, so no second reader here can skip the check. */
function parseJsonText(path: string, text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ScriptError("IO_READ", `cannot parse ${path} as JSON: ${(err as Error).message}`);
  }
  const repeat = findDuplicateKey(text);
  if (repeat !== null) {
    const where = repeat.pointer === "" ? "the top-level object" : "the object";
    throw new ScriptError("IO_READ", `cannot read ${path}: the key ${JSON.stringify(repeat.key)} appears more than once in ${where}`, repeat.pointer);
  }
  return parsed;
}

/** Write through a temporary file beside the file the path names and rename it into place, so
 *  neither a crash nor a power loss leaves a half-written analysis document behind. A symbolic
 *  link to an existing file is followed: the file it points to is replaced and the link stays. A
 *  replaced file's group and permission bits are kept, except that a group the writer may not give
 *  is left as the writer's own with the group bits dropped; a new file gets the writer's group and
 *  the umask's bits. The temporary file is synced to disk before the rename, and the folder after
 *  it where the platform allows a folder to be synced. */
export function writeFileAtomic(path: string, content: string): void {
  const target = resolveTarget(path);
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    stageFile(tmp, content, statSync(target, { throwIfNoEntry: false }));
    renameSync(tmp, target);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // the write already failed; the removal is best effort
    }
    throw new ScriptError("IO_WRITE", `cannot write ${path}: ${(err as Error).message}`);
  }
  syncFolder(dirname(target));
}

/** The file the path names with every symbolic link resolved, or the path itself when nothing
 *  exists there yet. */
function resolveTarget(path: string): string {
  try {
    return realpathSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return path;
    throw new ScriptError("IO_WRITE", `cannot write ${path}: ${(err as Error).message}`);
  }
}

/** Creates the temporary file afresh (anything left at its path is removed first, and the exclusive
 *  flag never follows a link there). When it replaces a file it starts with the owner's bits only
 *  and is given the replaced file's group and permission bits (as far as keepAccess may give them)
 *  before any content goes in, so no one the replaced file shuts out can open it. Then the content
 *  is written and synced to disk. */
function stageFile(tmp: string, content: string, replaced: Stats | undefined): void {
  rmSync(tmp, { force: true });
  const fd = openSync(tmp, "wx", replaced === undefined ? 0o666 : replaced.mode & 0o700);
  try {
    if (replaced !== undefined) keepAccess(fd, replaced);
    writeFileSync(fd, content, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Gives the staged file the replaced file's group and permission bits, each only when it differs,
 *  so a file system that gives every file the same group and bits is never asked to change them. A
 *  group the writer may not give is left as the writer's own and the group bits are dropped, so no
 *  group gains access the replaced file did not give it; a refused change of the bits fails the write. */
function keepAccess(fd: number, replaced: Stats): void {
  const staged = fstatSync(fd);
  const sameGroup = staged.gid === replaced.gid || keepGroup(fd, staged.uid, replaced.gid);
  const mode = replaced.mode & (sameGroup ? 0o777 : 0o707);
  if ((staged.mode & 0o777) !== mode) fchmodSync(fd, mode);
}

/** True when the staged file now has the group, false when the writer may not give it that group.
 *  The owner is passed as it is, not as -1, which Bun refuses. */
function keepGroup(fd: number, uid: number, gid: number): boolean {
  try {
    fchownSync(fd, uid, gid);
    return true;
  } catch {
    return false;
  }
}

/** Syncs the folder after the rename, best effort: the document is already in place, and a
 *  platform that refuses to open or sync a folder loses only the guarantee that the rename
 *  itself survives a power loss. */
function syncFolder(folder: string): void {
  try {
    const fd = openSync(folder, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // the document is in place; only the durability of the rename is lost
  }
}

export function assertExtension(path: string, ext: ".json" | ".html", what: string): void {
  if (!path.endsWith(ext)) {
    throw new ScriptError("USAGE", `${what} must end in ${ext}`);
  }
}

export function assertWritable(path: string, force: boolean): void {
  if (!force && existsSync(path)) {
    throw new ScriptError("IO_EXISTS", `${path} exists; pass --force to overwrite`);
  }
}

export function stringifyDocument(doc: unknown): string {
  return JSON.stringify(doc, null, 2) + "\n";
}
