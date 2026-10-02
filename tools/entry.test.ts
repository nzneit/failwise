import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { isEntry } from "./lib/entry.ts";

/** Calls `isEntry` with a stand-in `import.meta` and a clear exit status, capturing what it writes
 *  to stderr and the exit status it sets, then puts both back so the test process itself does not
 *  fail. */
function callIsEntry(meta: object): { entry: boolean; stderr: string; exitCode: typeof process.exitCode } {
  const chunks: string[] = [];
  const savedExitCode = process.exitCode;
  const write = mock.method(process.stderr, "write", (chunk: string | Uint8Array): boolean => {
    chunks.push(String(chunk));
    return true;
  });
  process.exitCode = undefined;
  try {
    const entry = isEntry(meta as ImportMeta);
    return { entry, stderr: chunks.join(""), exitCode: process.exitCode };
  } finally {
    write.mock.restore();
    process.exitCode = savedExitCode;
  }
}

test("isEntry passes import.meta.main through when the runtime has it, and prints nothing", () => {
  assert.deepEqual(callIsEntry({ main: true }), { entry: true, stderr: "", exitCode: undefined });
  assert.deepEqual(callIsEntry({ main: false }), { entry: false, stderr: "", exitCode: undefined });
});

test("isEntry fails closed on a runtime without import.meta.main: the NODE line, exit status 1, false", () => {
  assert.deepEqual(callIsEntry({}), {
    entry: false,
    stderr: `error NODE: Node ${process.versions.node} lacks import.meta.main; run under Node 24.2 or later\n`,
    exitCode: 1,
  });
});
