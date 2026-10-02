import { test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { runProcess } from "./lib/tracker/spawn.ts";

// Every process these tests start is Node itself.

test("runProcess runs a command from an argument array, passes stdin and returns status, stdout and stderr", async () => {
  const script = "process.stdin.pipe(process.stdout); process.stdin.on('end', () => { process.stderr.write('done'); process.exitCode = 3; });";
  const result = await runProcess(process.execPath, ["-e", script], "line one\nline two\n");
  assert.deepEqual(result, { status: 3, stdout: "line one\nline two\n", stderr: "done", missing: false });
});

test("runProcess passes an argument holding shell characters as one argument, untouched", async () => {
  const argument = "$(echo x); `y` && z";
  const result = await runProcess(process.execPath, ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))", argument]);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), [argument]);
});

test("runProcess reports a command that does not exist as missing", async () => {
  const result = await runProcess("failwise-no-such-command-4e1c", ["api"], "{}");
  assert.equal(result.missing, true);
  assert.equal(result.status, null);
});
