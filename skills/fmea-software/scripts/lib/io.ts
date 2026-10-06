import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

/** Write through a sibling temporary path and rename into place, so a crash mid-write never
 *  leaves a half-written analysis document behind. */
export function writeFileAtomic(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, content, "utf8");
    renameSync(tmp, path);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // the write already failed; the removal is best effort
    }
    throw new ScriptError("IO_WRITE", `cannot write ${path}: ${(err as Error).message}`);
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
