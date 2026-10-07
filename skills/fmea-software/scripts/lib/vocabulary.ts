// The element vocabulary: the five roles, the three boundary values and the security flag, each with
// the test that decides it, and the tie-breaks between roles (spec §4). One data file holds it,
// read here for the report's Vocabulary block and by the generator of the reference file's table,
// so the shape check is strict: a file that cannot be read, or whose shape is wrong, is a
// VOCABULARY_READ failure (an I/O failure, exit 3, §6.4), never a report with a gap in it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ScriptError } from "./codes.ts";
import { escapeHtml } from "./escape.ts";
import type { ElementBoundary, ElementKind } from "./types.ts";

export interface VocabularyEntry { id: string; label: string; test: string; basis?: string; tags: string[] }
export interface VocabularyFlag { label: string; test: string; basis?: string; tags: string[] }
export interface Vocabulary {
  version: 1;
  roles: VocabularyEntry[];
  boundaries: VocabularyEntry[];
  security: VocabularyFlag;
  tie_breaks: { text: string; tags: string[] }[];
}

export const VOCABULARY_PATH: string = join(import.meta.dirname, "..", "..", "data", "element-vocabulary-v1.json");

// The enum orders of the schema: the file lists the roles and the boundary values in these orders.
const ROLE_IDS: readonly ElementKind[] = ["service", "datastore", "event_stream", "interface", "component"];
const BOUNDARY_IDS: readonly ElementBoundary[] = ["in_scope", "owned_outside", "third_party"];

// A full provenance tag, never a bare record id.
const TAG = /^(?:(?:sourced|paraphrased|adapted-from|cites):C[0-9]{3}|skill-authored)$/;

type Raw = Record<string, unknown>;

function malformed(path: string, what: string): ScriptError {
  return new ScriptError("VOCABULARY_READ", `${path}: vocabulary is malformed: ${what}`);
}

function checkObject(path: string, where: string, raw: unknown): Raw {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw malformed(path, `${where} must be an object`);
  return raw as Raw;
}

function checkText(path: string, where: string, raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) throw malformed(path, `${where} must be a non-empty string`);
  return raw;
}

function checkTags(path: string, where: string, raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) throw malformed(path, `${where}.tags must be a non-empty array`);
  raw.forEach((tag, i) => {
    if (typeof tag !== "string" || !TAG.test(tag)) throw malformed(path, `${where}.tags[${i}] ${JSON.stringify(tag)} is not a full provenance tag`);
  });
  return raw as string[];
}

// The fields a role, a boundary value and the flag share: label, test, the optional basis, tags.
function checkFlag(path: string, where: string, raw: unknown): VocabularyFlag {
  const o = checkObject(path, where, raw);
  const flag: VocabularyFlag = { label: checkText(path, `${where}.label`, o.label), test: checkText(path, `${where}.test`, o.test), tags: checkTags(path, where, o.tags) };
  if (o.basis !== undefined) flag.basis = checkText(path, `${where}.basis`, o.basis);
  return flag;
}

// A list of entries whose ids are exactly `ids`, in that order.
function checkEntries(path: string, name: string, raw: unknown, ids: readonly string[]): VocabularyEntry[] {
  if (!Array.isArray(raw)) throw malformed(path, `${name} must be an array`);
  const found = raw.map((entry: unknown) => (typeof entry === "object" && entry !== null ? (entry as Raw).id : undefined));
  if (found.length !== ids.length || found.some((id, i) => id !== ids[i])) throw malformed(path, `${name} must list the ids ${ids.join(", ")}, in that order`);
  return raw.map((entry: unknown, i) => ({ id: ids[i], ...checkFlag(path, `${name}[${i}]`, entry) }));
}

function checkTieBreaks(path: string, raw: unknown): Vocabulary["tie_breaks"] {
  if (!Array.isArray(raw)) throw malformed(path, "tie_breaks must be an array");
  return raw.map((entry: unknown, i) => {
    const where = `tie_breaks[${i}]`;
    const o = checkObject(path, where, entry);
    return { text: checkText(path, `${where}.text`, o.text), tags: checkTags(path, where, o.tags) };
  });
}

/** Reads and shape-checks the vocabulary at `path`, the shipped file when none is given. */
export function loadVocabulary(path: string = VOCABULARY_PATH): Vocabulary {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ScriptError("VOCABULARY_READ", `${path}: cannot read or parse vocabulary: ${(err as Error).message}`);
  }
  const o = checkObject(path, "the vocabulary", raw);
  if (o.version !== 1) throw malformed(path, `version must be 1, not ${JSON.stringify(o.version)}`);
  return {
    version: 1,
    roles: checkEntries(path, "roles", o.roles, ROLE_IDS),
    boundaries: checkEntries(path, "boundaries", o.boundaries, BOUNDARY_IDS),
    security: checkFlag(path, "security", o.security),
    tie_breaks: checkTieBreaks(path, o.tie_breaks),
  };
}

/** The report's Vocabulary block: one term per role, per boundary value and for the flag, in that
 *  order, each its label and its test. */
export function vocabularyHtml(v: Vocabulary): string {
  const terms = [...v.roles, ...v.boundaries, v.security].map((x) => `<dt>${escapeHtml(x.label)}</dt><dd>${escapeHtml(x.test)}</dd>`);
  return `<section class="vocabulary"><dl>${terms.join("")}</dl></section>`;
}
