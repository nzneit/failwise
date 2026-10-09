// The one closed list of failure codes shared by every script (spec section 9).
// Each code maps to exactly one process exit status: 1 usage, 2 validation, 3 I/O and INTERNAL.
// A command started under a Node too old to run it is a usage failure.

const EXIT_USAGE = 1;
const EXIT_VALIDATION = 2;
const EXIT_IO = 3;

export const CODES = {
  USAGE: EXIT_USAGE,
  NODE: EXIT_USAGE, // raised by isEntry() in cli.ts when the runtime lacks import.meta.main (Node before 24.2)
  TRACKER_PLAN: EXIT_USAGE,
  TRACKER_PUBLIC: EXIT_USAGE,
  SCHEMA: EXIT_VALIDATION,
  KIND_LEGACY: EXIT_VALIDATION, // raised by legacyIssues in legacy.ts, before the schema stage, for a v1 document
  DEPENDENCY_LEGACY: EXIT_VALIDATION, // raised by legacyIssues in legacy.ts, after the v1 check and before the schema stage, for a v2 document
  INVARIANT: EXIT_VALIDATION,
  PRIORITY_MISMATCH: EXIT_VALIDATION,
  TABLE_ID_MISMATCH: EXIT_VALIDATION,
  RATING_RANGE: EXIT_VALIDATION,
  COMPUTED_MISSING: EXIT_VALIDATION,
  COMPUTED_STALE: EXIT_VALIDATION,
  TRACKER_CONFIG: EXIT_VALIDATION,
  IO_READ: EXIT_IO,
  IO_WRITE: EXIT_IO,
  IO_EXISTS: EXIT_IO,
  IO_CHANGED: EXIT_IO, // raised by writeFileAtomic in io.ts when the file changed between a script's read and its write
  TABLE_MALFORMED: EXIT_IO,
  VOCABULARY_READ: EXIT_IO, // raised by loadVocabulary in vocabulary.ts, for a data/element-vocabulary-v1.json that cannot be read or is malformed
  TRACKER_UNAVAILABLE: EXIT_IO,
  TRACKER_REJECTED: EXIT_IO,
  INTERNAL: EXIT_IO,
} as const;

export type Code = keyof typeof CODES;

/** Every failure a script raises deliberately. `pointer` is a JSON pointer, present only when the
 *  failure is located in a document: the analysis document, or, for a repeated key, the JSON file
 *  the message names. */
export class ScriptError extends Error {
  readonly code: Code;
  readonly pointer: string | undefined;

  constructor(code: Code, message: string, pointer?: string) {
    super(message);
    this.name = "ScriptError";
    this.code = code;
    this.pointer = pointer;
  }
}

/**
 * The text with every character that could break the line or steer the terminal escaped as
 * `\uXXXX`, four lower-case hex digits: the controls of general category Cc (U+0000 to U+001F
 * and U+007F to U+009F), U+2028 and U+2029, and the bidi controls U+202A to U+202E and U+2066
 * to U+2069.
 */
export function escapeLine(text: string): string {
  // oxlint-disable-next-line no-control-regex -- the control characters are what this escapes
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

/**
 * The single stderr line shape: `error <CODE>: <message>` plus ` at <pointer>` when located.
 * One line whatever the message holds: V8's JSON.parse message quotes the source around the
 * error, newline included, so runs of whitespace collapse to a single space (§9); then every
 * remaining control or bidi character is escaped (`escapeLine`), so no text a tracker or a file
 * supplied reaches the terminal raw. The pointer cannot be collapsed the same way, a space being
 * a legal pointer character, so it is only escaped, with the same helper.
 */
export function formatError(code: Code, message: string, pointer?: string): string {
  const located = pointer ? ` at ${escapeLine(pointer)}` : "";
  return `error ${code}: ${escapeLine(message.replace(/\s+/g, " ").trim())}` + located;
}

export function exitStatus(code: Code): 1 | 2 | 3 {
  return CODES[code];
}

/** One entry of `validate.ts`'s `errors[]`. */
export interface Issue { code: Code; rule: string; message: string; pointer: string }
