import { ScriptError } from "./codes.ts";

export interface ArgSpec { positional: number; flags: Record<string, "boolean" | "string"> }
export interface ParsedArgs { positional: string[]; flags: Record<string, string | boolean> }

// Records the flag at argv[i] in `flags` and in `given`, and returns the index of the last token
// it consumed: i for a boolean flag, i + 1 for a string flag and its value. A flag already in
// `given` is refused, so a command line that names a flag twice stops instead of running with
// its last value.
function readFlag(argv: string[], i: number, spec: ArgSpec, flags: Record<string, string | boolean>, given: Set<string>): number {
  const token = argv[i];
  const name = token.slice(2);
  const kind = Object.hasOwn(spec.flags, name) ? spec.flags[name] : undefined;
  if (kind === undefined) throw new ScriptError("USAGE", `unknown flag: ${token}`);
  if (given.has(name)) throw new ScriptError("USAGE", `flag ${token} is given more than once`);
  given.add(name);
  if (kind === "boolean") {
    flags[name] = true;
    return i;
  }
  const value = argv[i + 1];
  if (value === undefined) throw new ScriptError("USAGE", `flag ${token} needs a value`);
  flags[name] = value;
  return i + 1;
}

/** Parse `argv` against a spec. Flags are `--name` (boolean) or `--name value` (string) and may
 *  appear before or after the positionals; `--` is not special and is rejected as an unknown flag;
 *  `--name=value` is not supported. A flag given more than once is rejected, whether its values
 *  differ or not. Declared boolean flags default to false; a string flag that was not given is
 *  absent from `flags`. Every rejection is a USAGE failure (exit 1). */
export function parseArgs(argv: string[], spec: ArgSpec): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const given = new Set<string>();
  for (const [name, kind] of Object.entries(spec.flags)) {
    if (kind === "boolean") flags[name] = false;
  }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      i = readFlag(argv, i, spec, flags, given);
    } else {
      positional.push(token);
    }
  }
  if (positional.length !== spec.positional) {
    throw new ScriptError("USAGE", `expected ${spec.positional} positional argument(s), got ${positional.length}`);
  }
  return { positional, flags };
}
