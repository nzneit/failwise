// The entry check every tool ends with.
import process from "node:process";

/** Whether the module that passes its `import.meta` is the process's entry point. On a runtime
 *  without `import.meta.main` it prints one `NODE` line and exits 1, so the tool fails closed
 *  rather than exiting 0 unrun. */
export function isEntry(meta: ImportMeta): boolean {
  if (typeof meta.main !== "boolean") {
    process.stderr.write(`error NODE: Node ${process.versions.node} lacks import.meta.main; run under Node 24.2 or later\n`);
    process.exitCode = 1;
    return false;
  }
  return meta.main;
}
