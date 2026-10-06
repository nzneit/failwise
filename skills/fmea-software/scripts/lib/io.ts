import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import { ScriptError } from "./codes.ts";

const BYTE_ORDER_MARK = "\uFEFF";

/** The text less one leading byte-order mark (U+FEFF): some editors begin a UTF-8 file with one,
 *  Node and Bun keep it when they decode the file, and JSON.parse refuses it. */
function withoutByteOrderMark(text: string): string {
  return text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
}

/** The file's text, decoded as UTF-8, less one leading byte-order mark. */
export function readTextFile(path: string): string {
  try {
    return withoutByteOrderMark(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ScriptError("IO_READ", `cannot read ${path}: ${(err as Error).message}`);
  }
}

export function readJsonFile(path: string): unknown {
  const text = readTextFile(path);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ScriptError("IO_READ", `cannot parse ${path} as JSON: ${(err as Error).message}`);
  }
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
