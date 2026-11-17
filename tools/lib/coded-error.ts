// The coded errors of the generators in tools/: an operation throws an error that carries a code,
// and the tool's main turns it into one line `error <CODE>: <message>` and that code's exit status.
// Its behaviour is tested through each generator's CLI test.
import { readFileSync, writeFileSync } from "node:fs";

interface CodedError extends Error {
  code: string;
}

/** Throws the one error `report` turns into `error <code>: <message>`. */
export function fail(code: string, message: string): never {
  const err = new Error(message) as CodedError;
  err.code = code;
  throw err;
}

/** One line whatever the cause says: V8's JSON.parse message can carry a newline. */
export function reason(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").trim();
}

/** The UTF-8 text of the file at path; throws IO_READ when it cannot be read. */
export function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    return fail("IO_READ", `cannot read ${path}: ${reason(err)}`);
  }
}

/** Writes text to the file at path; throws IO_WRITE when it cannot. */
export function writeText(path: string, text: string): void {
  try {
    writeFileSync(path, text);
  } catch (err) {
    fail("IO_WRITE", `cannot write ${path}: ${reason(err)}`);
  }
}

/** For an error whose code `exit` names: prints `error <code>: <message>` to stderr and returns
 *  that code's exit status. Any other error is rethrown. */
export function report(err: unknown, exit: Record<string, number>): number {
  const code = (err as Partial<CodedError>).code;
  if (code === undefined || exit[code] === undefined) throw err;
  process.stderr.write(`error ${code}: ${reason(err)}\n`);
  return exit[code];
}
