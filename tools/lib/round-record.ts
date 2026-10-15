// The record of how an eval round was run: tools/run-round.ts writes it as
// round.json in the round's folder, beside the run folders and the results file,
// and tools/eval-report.ts prints one line from it under the Harness table
// (prose design 2026-10-14, §11.5 ruling 10). A round run by the sequential
// script has no round.json, and the report then prints no such line.

import { readFileSync } from "node:fs";

/**
 * One cell of a round: `p<prompt>:<capability>:<run>`, when its runner started
 * and ended, the runner's exit status (null when it ended on a signal or never
 * started) and its summary line (null when it printed none).
 */
export interface RoundCell { cell: string; started: string; ended: string; exit: number | null; summary: string | null }

/** round.json: the method, the cells run at once, the canary cell or null, the round's times, the CLI version and each cell. */
export interface RoundRecord {
  method: "parallel";
  concurrency: number;
  canary: string | null;
  started: string;
  ended: string;
  cli_version: string;
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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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
    isNullable(v.exit, "number") && isNullable(v.summary, "string");
}

function isRoundRecord(v: unknown): v is RoundRecord {
  return isObject(v) && v.method === "parallel" && Number.isInteger(v.concurrency) && isNullable(v.canary, "string") &&
    isTime(v.started) && isTime(v.ended) && typeof v.cli_version === "string" &&
    Array.isArray(v.cells) && v.cells.every(isRoundCell);
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

/** A cell id `p1:high:1` in the report's words, `p1 high run1`; any other text as it is. */
function cellWords(id: string): string {
  const m = /^p(\d+):(\w+):(\d+)$/.exec(id);
  return m === null ? id : `p${m[1]} ${m[2]} run${m[3]}`;
}

/**
 * The line the report prints under the Harness table: the method, the
 * concurrency, the canary and the round's elapsed time; a line naming the file
 * when it could not be read; null when the round has no round.json. `label` is
 * how the line names an unreadable file.
 */
export function roundMethodLine(read: RoundRead, label: string): string | null {
  if (read === "missing") return null;
  if (read === "unreadable") return `Round method: round.json unreadable at ${label}`;
  const canary = read.canary === null ? "no canary" : `canary ${cellWords(read.canary)}`;
  return `Round method: ${read.method}, concurrency ${read.concurrency}, ${canary}, ${elapsedText(Date.parse(read.ended) - Date.parse(read.started))}`;
}
