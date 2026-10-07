// JSON answers read as objects, and the two failures of a tracker request, shared by the GitHub and
// Jira adapters (s1). Pure data.

import { ScriptError } from "../codes.ts";

export const unavailable = (message: string): ScriptError => new ScriptError("TRACKER_UNAVAILABLE", message);
export const rejected = (message: string): ScriptError => new ScriptError("TRACKER_REJECTED", message);

export type Json = Record<string, unknown>;

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function recordOf(value: unknown, what: string): Json {
  if (!isRecord(value)) throw rejected(`${what} is not the JSON object expected`);
  return value;
}
