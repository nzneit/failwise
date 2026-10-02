import process from "node:process";
import { ScriptError, exitStatus, formatError } from "./codes.ts";

export type Main = (argv: string[]) => number;

/** The only place in the skill that decides a process exit status: every lib function is pure or
 *  throws. Each CLI ends with `if (isEntry(import.meta)) run(main);`, never a bare
 *  `if (import.meta.main)`: Node strips types by default from 23.6 but has `import.meta.main` only
 *  from 24.2, so on 23.6 to 24.1 a bare check reads `undefined`, skips `main`, and exits 0 having
 *  printed and written nothing. `isEntry` turns that runtime into a coded failure instead.
 *
 *  `process.exitCode` and a plain return, never `process.exit`: on POSIX `process.stdout` is
 *  asynchronous when it is a pipe, and `process.exit` discards whatever is still buffered, which
 *  truncates a large `validate.ts` result at about 128 KB. Setting the code and returning lets Node
 *  flush stdout and stderr and then exit with the same status. */
export function run(main: Main): void {
  try {
    process.exitCode = main(process.argv.slice(2));
    return;
  } catch (err) {
    if (err instanceof ScriptError) {
      process.stderr.write(formatError(err.code, err.message, err.pointer) + "\n");
      process.exitCode = exitStatus(err.code);
      return;
    }
    process.stderr.write(formatError("INTERNAL", String(err)) + "\n");
    process.exitCode = exitStatus("INTERNAL");
    return;
  }
}

/** Whether the module that passes its `import.meta` is the process's entry point. On a runtime
 *  without `import.meta.main` it prints one `NODE` line, sets exit status 1, and returns false, so
 *  the command fails closed rather than exiting 0 unrun. Like `run`, it sets `process.exitCode`
 *  and never calls `process.exit`. */
export function isEntry(meta: ImportMeta): boolean {
  if (typeof meta.main !== "boolean") {
    process.stderr.write(
      formatError("NODE", `Node ${process.versions.node} lacks import.meta.main; run under Node 24.2 or later`) + "\n",
    );
    process.exitCode = exitStatus("NODE");
    return false;
  }
  return meta.main;
}
