// The first key that an object of a JSON text repeats, for readJsonFile in io.ts. JSON.parse keeps
// the last of two members with one key and says nothing, so a document read and written back would
// lose the first value without a message.

import { ptr } from "./pointer.ts";

/** A repeated key, and the JSON pointer of the object that repeats it ("" for the top level). */
export interface DuplicateKey { pointer: string; key: string }

/** One open object or array: its pointer; for an object the keys read so far and the latest one,
 *  for an array the index of the current element. */
interface Frame { pointer: string; keys: Set<string> | null; member: string; index: number }

interface Scan { stack: Frame[]; expectKey: boolean }

/** Whether the character at `at` is escaped: an odd run of backslashes precedes it. */
function isEscaped(text: string, at: number): boolean {
  let slashes = 0;
  while (text[at - 1 - slashes] === "\\") slashes++;
  return slashes % 2 === 1;
}

/** The index just past the string token whose opening quote is at `start`. */
function stringEnd(text: string, start: number): number {
  let quote = text.indexOf('"', start + 1);
  while (isEscaped(text, quote)) quote = text.indexOf('"', quote + 1);
  return quote + 1;
}

function open(scan: Scan, isObject: boolean): void {
  const parent = scan.stack.at(-1);
  const pointer = parent === undefined ? "" : parent.pointer + ptr(parent.keys === null ? parent.index : parent.member);
  scan.stack.push({ pointer, keys: isObject ? new Set() : null, member: "", index: 0 });
  scan.expectKey = isObject;
}

function comma(scan: Scan): void {
  const top = scan.stack.at(-1);
  if (top === undefined) return;
  if (top.keys === null) top.index++;
  scan.expectKey = top.keys !== null;
}

/** Records the key token `token` in the innermost object, or returns it when that object already
 *  has it. */
function key(scan: Scan, token: string): DuplicateKey | null {
  const top = scan.stack.at(-1);
  scan.expectKey = false;
  if (top === undefined || top.keys === null) return null;
  const name = JSON.parse(token) as string;
  if (top.keys.has(name)) return { pointer: top.pointer, key: name };
  top.keys.add(name);
  top.member = name;
  return null;
}

/**
 * The first member, in text order, whose key an earlier member of the same object already has, or
 * null when no object repeats a key. Keys are compared as JSON.parse decodes them, so "a" and
 * "\u0061" are one key. `text` must be text JSON.parse accepts: the scan relies on that and checks
 * nothing else. It keeps its own stack, so no nesting depth overflows the call stack.
 */
export function findDuplicateKey(text: string): DuplicateKey | null {
  const scan: Scan = { stack: [], expectKey: false };
  const structural = /[{}[\],"]/g;
  for (let match = structural.exec(text); match !== null; match = structural.exec(text)) {
    const char = match[0];
    if (char === '"') {
      const end = stringEnd(text, match.index);
      structural.lastIndex = end;
      const found = scan.expectKey ? key(scan, text.slice(match.index, end)) : null;
      if (found !== null) return found;
    } else if (char === "{" || char === "[") {
      open(scan, char === "{");
    } else if (char === ",") {
      comma(scan);
    } else {
      scan.stack.pop();
      scan.expectKey = false;
    }
  }
  return null;
}
