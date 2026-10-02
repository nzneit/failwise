// The priority table: loading, the shape check every table passes before use, and the
// lookup from three ratings to a priority value. The shipped table lives in data/; a
// user-supplied table arrives through --table-file and is checked for shape only, so a
// licensed table with different bands or vocabulary drops in without code changes (§7, §9).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ScriptError } from "./codes.ts";
import type { Factor, Priority, Ratings } from "./types.ts";

export interface PriorityTable {
  id: string;
  // Ordered highest priority first; every comparison of two priorities uses this order.
  vocabulary: string[];
  // For each factor, [lo, hi] rating ranges in increasing order, jointly covering 1..10.
  bands: Record<Factor, [number, number][]>;
  // One value per band combination, keyed by cellKey(sBand, oBand, dBand) with 1-based band indices.
  cells: Record<string, string>;
}

const SHIPPED_TABLE_PATH: string = join(import.meta.dirname, "..", "..", "data", "priority-fmea-software-v1.json");

const FACTORS: readonly Factor[] = ["S", "O", "D"];

function malformed(origin: string, reason: string): ScriptError {
  return new ScriptError("TABLE_MALFORMED", `${origin}: ${reason}`);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Checks the band list of one factor: [lo, hi] integer pairs, lo <= hi, starting at 1,
// contiguous (no gap, no overlap), ending at 10. Returns the checked list.
function checkBands(origin: string, factor: Factor, raw: unknown): [number, number][] {
  if (!Array.isArray(raw) || raw.length === 0) throw malformed(origin, `bands.${factor} must be a non-empty array of [lo, hi] pairs`);
  const bands: [number, number][] = [];
  raw.forEach((entry, i) => {
    if (!Array.isArray(entry) || entry.length !== 2 || !Number.isInteger(entry[0]) || !Number.isInteger(entry[1]) || entry[0] > entry[1]) {
      throw malformed(origin, `bands.${factor}[${i}] must be [lo, hi] integers with lo <= hi`);
    }
    bands.push([entry[0] as number, entry[1] as number]);
  });
  if (bands[0][0] !== 1) throw malformed(origin, `bands.${factor} must start at 1`);
  for (let i = 1; i < bands.length; i++) {
    const prevHi = bands[i - 1][1];
    const lo = bands[i][0];
    if (lo > prevHi + 1) throw malformed(origin, `gap between bands.${factor}[${i - 1}] and bands.${factor}[${i}]: rating ${prevHi + 1} is uncovered`);
    if (lo <= prevHi) throw malformed(origin, `overlap between bands.${factor}[${i - 1}] and bands.${factor}[${i}] at rating ${lo}`);
  }
  if (bands[bands.length - 1][1] !== 10) throw malformed(origin, `bands.${factor} must end at 10`);
  return bands;
}

// Checks the vocabulary: a non-empty array of non-empty strings with no duplicate. Returns the
// set of its values, which the cell check looks values up in.
function checkVocabulary(origin: string, vocabulary: unknown): Set<string> {
  if (!Array.isArray(vocabulary) || vocabulary.length === 0) throw malformed(origin, "vocabulary must be a non-empty array of strings");
  const seen = new Set<string>();
  for (const v of vocabulary) {
    if (typeof v !== "string" || v.length === 0) throw malformed(origin, "vocabulary must contain only non-empty strings");
    if (seen.has(v)) throw malformed(origin, `vocabulary has a duplicate value "${v}"`);
    seen.add(v);
  }
  return seen;
}

// Checks the value of one cell: present, and a vocabulary value. Returns the value.
function checkCell(origin: string, key: string, value: unknown, seen: Set<string>): string {
  if (value === undefined) throw malformed(origin, `missing cell "${key}"`);
  if (typeof value !== "string" || !seen.has(value)) throw malformed(origin, `cell "${key}" value ${JSON.stringify(value)} is outside the vocabulary`);
  return value;
}

// Checks the cells: an object with exactly one key per band combination, in S, O, D order, each
// holding a vocabulary value. Returns the checked cells.
function checkCells(origin: string, rawCells: unknown, bands: Record<Factor, [number, number][]>, seen: Set<string>): Record<string, string> {
  if (!isPlainObject(rawCells)) throw malformed(origin, "cells must be an object keyed by band combination");
  const cells: Record<string, string> = {};
  const expected = new Set<string>();
  for (let s = 1; s <= bands.S.length; s++) {
    for (let o = 1; o <= bands.O.length; o++) {
      for (let d = 1; d <= bands.D.length; d++) {
        const key = cellKey(s, o, d);
        expected.add(key);
        cells[key] = checkCell(origin, key, rawCells[key], seen);
      }
    }
  }
  for (const key of Object.keys(rawCells)) {
    if (!expected.has(key)) throw malformed(origin, `unexpected cell key "${key}"`);
  }
  return cells;
}

// Validates an arbitrary JSON value as a priority table and returns it with exactly the four
// fields. `origin` names the file for messages. Throws TABLE_MALFORMED (an I/O failure, §9).
export function checkTableShape(raw: unknown, origin: string): PriorityTable {
  if (!isPlainObject(raw)) throw malformed(origin, "table must be a JSON object");
  const id = raw.id;
  if (typeof id !== "string" || id.length === 0) throw malformed(origin, "id must be a non-empty string");

  const vocabulary = raw.vocabulary;
  const seen = checkVocabulary(origin, vocabulary);

  const rawBands = raw.bands;
  if (!isPlainObject(rawBands) || Object.keys(rawBands).length !== 3 || !FACTORS.every((f) => f in rawBands)) {
    throw malformed(origin, "bands must have exactly the keys S, O, D");
  }
  const bands: Record<Factor, [number, number][]> = {
    S: checkBands(origin, "S", rawBands.S),
    O: checkBands(origin, "O", rawBands.O),
    D: checkBands(origin, "D", rawBands.D),
  };

  const cells = checkCells(origin, raw.cells, bands, seen);

  return { id, vocabulary: vocabulary as string[], bands, cells };
}

// Loads and shape-checks the table at tableFile, or the shipped table when none is given.
// Read and parse failures are TABLE_MALFORMED rather than IO_READ because the table is a
// configuration input, not the analysis document (§9 puts both under I/O).
export function loadTable(tableFile?: string): PriorityTable {
  const path = tableFile ?? SHIPPED_TABLE_PATH;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ScriptError("TABLE_MALFORMED", `${path}: cannot read or parse table: ${(err as Error).message}`);
  }
  return checkTableShape(raw, path);
}

// The key of the cell for band indices s, o, d (1-based).
export function cellKey(s: number, o: number, d: number): string {
  return `${s}-${o}-${d}`;
}

// The 1-based band index of a rating value for one factor. A value outside 1..10, or not an
// integer, is a validation failure (RATING_RANGE, §9) with no pointer; the caller that knows
// the document location adds one.
export function bandIndex(table: PriorityTable, factor: Factor, value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new ScriptError("RATING_RANGE", `rating ${factor} must be an integer from 1 to 10, got ${JSON.stringify(value)}`);
  }
  const bands = table.bands[factor];
  for (let i = 0; i < bands.length; i++) {
    if (value >= bands[i][0] && value <= bands[i][1]) return i + 1;
  }
  // Unreachable for a table that passed checkTableShape (bands cover 1..10).
  throw new ScriptError("INTERNAL", `no ${factor} band covers rating ${value} in table ${table.id}`);
}

// The priority value for three rating values.
export function lookupPriority(table: PriorityTable, S: number, O: number, D: number): string {
  const key = cellKey(bandIndex(table, "S", S), bandIndex(table, "O", O), bandIndex(table, "D", D));
  const value = table.cells[key];
  if (value === undefined) throw new ScriptError("INTERNAL", `table ${table.id} has no cell ${key}`);
  return value;
}

// The priority block written on a chain: the value, the table's id, and RPN for reference only
// (§7: RPN is never used to rank).
export function computePriority(table: PriorityTable, ratings: Ratings): Priority {
  return {
    value: lookupPriority(table, ratings.S.value, ratings.O.value, ratings.D.value),
    table: table.id,
    rpn: ratings.S.value * ratings.O.value * ratings.D.value,
  };
}

// Position of a value in the vocabulary (0 is the highest priority); a value the table does
// not know sorts after every known one.
export function vocabularyRank(table: PriorityTable, value: string): number {
  const i = table.vocabulary.indexOf(value);
  return i === -1 ? table.vocabulary.length : i;
}
