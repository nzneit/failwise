// JSON answers read as objects, shared by the GitHub and Jira adapters (s1). Pure data.

import { ScriptError } from "../codes.ts";

export type Json = Record<string, unknown>;

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function recordOf(value: unknown, what: string): Json {
  if (!isRecord(value)) throw new ScriptError("TRACKER_REJECTED", `${what} is not the JSON object expected`);
  return value;
}
