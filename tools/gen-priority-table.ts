// Generates the shipped priority table from the parameters in tools/priority-params.json.
// The table is data the skill ships; this generator exists so the bands and the cell rule
// stay reviewable in one small file instead of being hand-written 125 times.
// tools/ is independent of skills/fmea-software/scripts/: nothing here imports from there.
import { readFileSync, writeFileSync } from "node:fs";
import { isEntry } from "./lib/entry.ts";

export type Factor = "S" | "O" | "D";
export type Band = [number, number];
export type Threshold = [string, number];

export interface Floor {
  factor: Factor;
  band: number;
  value: string;
}

export interface PriorityRule {
  weights: Record<Factor, number>;
  thresholds: Threshold[];
  floor: Floor;
}

export interface PriorityParams {
  id: string;
  vocabulary: string[];
  bands: Record<Factor, Band[]>;
  rule: PriorityRule;
}

export interface PriorityTable {
  id: string;
  vocabulary: string[];
  bands: Record<Factor, Band[]>;
  cells: Record<string, string>;
}

const FACTORS: Factor[] = ["S", "O", "D"];

// tools/ carries its own closed code list. It must not import the skill's scripts/lib/codes.ts —
// tools/ and skills/fmea-software/scripts/ are independent by design — but the global error
// contract still binds it: one line `error <CODE>: <message>`, exit 1 usage, 2 validation, 3 I/O.
const EXIT_USAGE = 1;
const EXIT_VALIDATION = 2;
const EXIT_IO = 3;
const USAGE = "usage: node tools/gen-priority-table.ts <params.json> <out.json>";

/** Throws the one error checkParams reports: Error("<origin>: <reason>"). */
function fail(origin: string, reason: string): never {
  throw new Error(`${origin}: ${reason}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkId(params: Record<string, unknown>, origin: string): string {
  if (typeof params.id !== "string" || params.id.length === 0) fail(origin, "id must be a non-empty string");
  return params.id;
}

function checkVocabulary(params: Record<string, unknown>, origin: string): string[] {
  if (!Array.isArray(params.vocabulary) || params.vocabulary.length === 0) {
    fail(origin, "vocabulary must be a non-empty array");
  }
  const vocabulary: string[] = [];
  for (const entry of params.vocabulary as unknown[]) {
    if (typeof entry !== "string" || entry.length === 0) fail(origin, "vocabulary entries must be non-empty strings");
    vocabulary.push(entry);
  }
  if (new Set(vocabulary).size !== vocabulary.length) fail(origin, "vocabulary entries must be distinct");
  return vocabulary;
}

/** One [lo, hi] pair of bands.<factor>, which must start at expectedLow. */
function checkBandPair(pair: unknown, factor: Factor, expectedLow: number, origin: string): Band {
  if (!Array.isArray(pair) || pair.length !== 2) fail(origin, `bands.${factor} entries must be [lo, hi] pairs`);
  const lo = (pair as unknown[])[0];
  const hi = (pair as unknown[])[1];
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) fail(origin, `bands.${factor} bounds must be integers`);
  if ((hi as number) < (lo as number)) fail(origin, `bands.${factor} bounds must satisfy lo <= hi`);
  if ((lo as number) !== expectedLow) {
    fail(origin, `bands.${factor} must start at ${expectedLow} and leave no gap or overlap`);
  }
  return [lo as number, hi as number];
}

function checkFactorBands(list: unknown, factor: Factor, origin: string): Band[] {
  if (!Array.isArray(list) || list.length === 0) fail(origin, `bands.${factor} must be a non-empty array`);
  // Bands must tile 1..10 exactly: a gap or an overlap would leave a rating with no cell.
  const factorBands: Band[] = [];
  let expectedLow = 1;
  for (const pair of list as unknown[]) {
    const band = checkBandPair(pair, factor, expectedLow, origin);
    expectedLow = band[1] + 1;
    factorBands.push(band);
  }
  if (expectedLow !== 11) fail(origin, `bands.${factor} must cover ratings 1 to 10`);
  return factorBands;
}

function checkBands(params: Record<string, unknown>, origin: string): Record<Factor, Band[]> {
  const bandsRaw = params.bands;
  if (!isObject(bandsRaw)) fail(origin, "bands must be an object");
  if (Object.keys(bandsRaw).sort().join(",") !== "D,O,S") fail(origin, "bands must have exactly the keys S, O and D");
  const bands: Record<Factor, Band[]> = { S: [], O: [], D: [] };
  for (const factor of FACTORS) bands[factor] = checkFactorBands(bandsRaw[factor], factor, origin);
  return bands;
}

function checkWeights(rule: Record<string, unknown>, origin: string): Record<Factor, number> {
  const weightsRaw = rule.weights;
  if (!isObject(weightsRaw)) fail(origin, "rule.weights must be an object");
  const weights: Record<Factor, number> = { S: 0, O: 0, D: 0 };
  for (const factor of FACTORS) {
    const weight = weightsRaw[factor];
    if (!Number.isFinite(weight)) fail(origin, `rule.weights.${factor} must be a number`);
    weights[factor] = weight as number;
  }
  return weights;
}

function checkThresholds(rule: Record<string, unknown>, vocabulary: string[], origin: string): Threshold[] {
  if (!Array.isArray(rule.thresholds)) fail(origin, "rule.thresholds must be an array");
  const thresholds: Threshold[] = [];
  for (const pair of rule.thresholds as unknown[]) {
    if (!Array.isArray(pair) || pair.length !== 2) fail(origin, "rule.thresholds entries must be [value, bound] pairs");
    const value = (pair as unknown[])[0];
    const bound = (pair as unknown[])[1];
    if (typeof value !== "string" || !vocabulary.includes(value)) {
      fail(origin, `rule.thresholds value ${JSON.stringify(value)} is not in the vocabulary`);
    }
    if (!Number.isFinite(bound)) fail(origin, "rule.thresholds bounds must be numbers");
    thresholds.push([value, bound as number]);
  }
  return thresholds;
}

function checkFloor(
  rule: Record<string, unknown>,
  vocabulary: string[],
  bands: Record<Factor, Band[]>,
  origin: string,
): Floor {
  const floorRaw = rule.floor;
  if (!isObject(floorRaw)) fail(origin, "rule.floor must be an object");
  const floorFactor = floorRaw.factor;
  if (typeof floorFactor !== "string" || !FACTORS.includes(floorFactor as Factor)) {
    fail(origin, "rule.floor.factor must be S, O or D");
  }
  const floorBand = floorRaw.band;
  if (!Number.isInteger(floorBand) || (floorBand as number) < 1
    || (floorBand as number) > bands[floorFactor as Factor].length) {
    fail(origin, "rule.floor.band must be a band index of rule.floor.factor");
  }
  const floorValue = floorRaw.value;
  if (typeof floorValue !== "string" || !vocabulary.includes(floorValue)) {
    fail(origin, `rule.floor.value ${JSON.stringify(floorValue)} is not in the vocabulary`);
  }
  return { factor: floorFactor as Factor, band: floorBand as number, value: floorValue };
}

/** Validates a parsed params file. Throws Error("<origin>: <reason>") on the first problem. */
export function checkParams(raw: unknown, origin: string): PriorityParams {
  if (!isObject(raw)) fail(origin, "params must be a JSON object");
  const id = checkId(raw, origin);
  const vocabulary = checkVocabulary(raw, origin);
  const bands = checkBands(raw, origin);
  const ruleRaw = raw.rule;
  if (!isObject(ruleRaw)) fail(origin, "rule must be an object");
  const weights = checkWeights(ruleRaw, origin);
  const thresholds = checkThresholds(ruleRaw, vocabulary, origin);
  const floor = checkFloor(ruleRaw, vocabulary, bands, origin);
  return { id, vocabulary, bands, rule: { weights, thresholds, floor } };
}

/** The cell rule, over 1-based band indices. */
export function cellValue(params: PriorityParams, s: number, o: number, d: number): string {
  const bandIndex: Record<Factor, number> = { S: s, O: o, D: d };
  const floor = params.rule.floor;
  if (bandIndex[floor.factor] === floor.band) return floor.value;
  const weights = params.rule.weights;
  const weighted = weights.S * s + weights.O * o + weights.D * d;
  for (const [value, bound] of params.rule.thresholds) {
    if (weighted >= bound) return value;
  }
  return params.vocabulary[params.vocabulary.length - 1];
}

export function cellKey(s: number, o: number, d: number): string {
  return `${s}-${o}-${d}`;
}

export function generateTable(params: PriorityParams): PriorityTable {
  const cells: Record<string, string> = {};
  for (let s = 1; s <= params.bands.S.length; s++) {
    for (let o = 1; o <= params.bands.O.length; o++) {
      for (let d = 1; d <= params.bands.D.length; d++) {
        cells[cellKey(s, o, d)] = cellValue(params, s, o, d);
      }
    }
  }
  return { id: params.id, vocabulary: params.vocabulary, bands: params.bands, cells };
}

export function serializeTable(table: PriorityTable): string {
  return `${JSON.stringify(table, null, 2)}\n`;
}

export function main(
  argv: string[],
  write: (text: string) => void = (text) => { process.stdout.write(text); },
  writeError: (text: string) => void = (text) => { process.stderr.write(text); },
): number {
  // One line whatever the cause says: V8's JSON.parse message quotes the source around the
  // error, newline included, so runs of whitespace collapse to a single space (§9).
  const reason = (err: unknown): string =>
    (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").trim();
  if (argv.length !== 2) {
    writeError(`error USAGE: ${USAGE}\n`);
    return EXIT_USAGE;
  }
  const paramsPath = argv[0];
  const outPath = argv[1];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(paramsPath, "utf8"));
  } catch (err) {
    writeError(`error IO_READ: cannot read ${paramsPath}: ${reason(err)}\n`);
    return EXIT_IO;
  }
  let params: PriorityParams;
  try {
    params = checkParams(raw, paramsPath);
  } catch (err) {
    writeError(`error PARAMS_INVALID: ${reason(err)}\n`);
    return EXIT_VALIDATION;
  }
  const table = generateTable(params);
  try {
    writeFileSync(outPath, serializeTable(table));
  } catch (err) {
    writeError(`error IO_WRITE: cannot write ${outPath}: ${reason(err)}\n`);
    return EXIT_IO;
  }
  write(`${outPath}: ${Object.keys(table.cells).length} cells\n`);
  return 0;
}

if (isEntry(import.meta)) process.exit(main(process.argv.slice(2)));
