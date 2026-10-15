// The record of how an eval round was run: tools/run-round.ts writes it as
// round.json in the round's folder, beside the run folders and the results file,
// and tools/eval-report.ts prints one line from it under the Harness table
// (prose design 2026-10-14, §11.5 ruling 10). A round run by the sequential
// script has no round.json, and the report then prints no such line. From round
// 1c (§11.6, carried items) the record also names the CLAUDE* variables the
// launcher kept from its children; a round.json written before then lacks the
// field and still reads.

import { readFileSync } from "node:fs";
import { isObject } from "./is-object.ts";

/**
 * One cell of a round: `p<prompt>:<capability>:<run>`, when its runner started
 * and ended, the runner's exit status (null when it ended on a signal or never
 * started) and its summary line (null when it printed none). `error` is present
 * only when the launcher itself could not run the cell, and says why.
 */
export interface RoundCell { cell: string; started: string; ended: string; exit: number | null; summary: string | null; error?: string }

/**
 * round.json: the method, the cells run at once, the canary cell or null, the round's times, the CLI version, the
 * names of the inherited CLAUDE* variables the launcher dropped from its children, sorted (absent from a round.json
 * written before 2026-10-15's round 1c), and each cell.
 */
export interface RoundRecord {
  method: "parallel";
  concurrency: number;
  canary: string | null;
  started: string;
  ended: string;
  cli_version: string;
  env_stripped?: string[];
  cells: RoundCell[];
}

/** A round.json as read: the record, `missing` when there is no file, or `unreadable`. */
export type RoundRead = RoundRecord | "missing" | "unreadable";

/** The round.json at `path`, read and checked in code. */
export function readRoundRecord(path: string): RoundRead {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    return isObject(err) && err.code === "ENOENT" ? "missing" : "unreadable";
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isRoundRecord(parsed) ? parsed : "unreadable";
  } catch {
    return "unreadable";
  }
}

/** A string Date.parse reads as a time. */
function isTime(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

function isNullable(v: unknown, type: "number" | "string"): boolean {
  return v === null || typeof v === type;
}

function isRoundCell(v: unknown): v is RoundCell {
  return isObject(v) && typeof v.cell === "string" && isTime(v.started) && isTime(v.ended) &&
    isNullable(v.exit, "number") && isNullable(v.summary, "string") && (v.error === undefined || typeof v.error === "string");
}

/** env_stripped as a round.json may hold it: a list of names, or absent from a file written before the field. */
function isStrippedNames(v: unknown): boolean {
  return v === undefined || (Array.isArray(v) && v.every((name) => typeof name === "string"));
}

function isRoundRecord(v: unknown): v is RoundRecord {
  return isObject(v) && v.method === "parallel" && Number.isInteger(v.concurrency) && isNullable(v.canary, "string") &&
    isTime(v.started) && isTime(v.ended) && typeof v.cli_version === "string" &&
    isStrippedNames(v.env_stripped) && Array.isArray(v.cells) && v.cells.every(isRoundCell);
}

/** A duration as `21m 04s`, or `1h 02m 05s` from an hour, rounded to the second. */
export function elapsedText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const two = (n: number): string => String(n).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = two(total % 60);
  return hours > 0 ? `${hours}h ${two(minutes)}m ${seconds}s` : `${minutes}m ${seconds}s`;
}

/**
 * A cell id `p1:high:1` in the words the summary lines and the report use,
 * `p1 high run1`; any other text as it is.
 */
export function cellWords(id: string): string {
  const m = /^p(\d+):(\w+):(\d+)$/.exec(id);
  return m === null ? id : `p${m[1]} ${m[2]} run${m[3]}`;
}

/** `<n> CLAUDE* variables stripped`, singular for one: the launch-time line and the report's clause. */
export function strippedText(n: number): string {
  return `${n} CLAUDE* ${n === 1 ? "variable" : "variables"} stripped`;
}

/**
 * The line the report prints under the Harness table: the method, the
 * concurrency, the canary and the round's elapsed time, then how many CLAUDE*
 * variables the launcher stripped when the record names them; a line naming
 * the file when it could not be read; null when the round has no round.json.
 * `label` is how the line names an unreadable file.
 */
export function roundMethodLine(read: RoundRead, label: string): string | null {
  if (read === "missing") return null;
  if (read === "unreadable") return `Round method: round.json unreadable at ${label}`;
  const canary = read.canary === null ? "no canary" : `canary ${cellWords(read.canary)}`;
  const stripped = read.env_stripped === undefined ? "" : `, ${strippedText(read.env_stripped.length)}`;
  return `Round method: ${read.method}, concurrency ${read.concurrency}, ${canary}, ${elapsedText(Date.parse(read.ended) - Date.parse(read.started))}${stripped}`;
}
