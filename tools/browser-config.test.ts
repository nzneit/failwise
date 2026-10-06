import { test } from "node:test";
import assert from "node:assert/strict";
import { browserConfig, compareConfig } from "../dev/browser/config.ts";

/** Runs `body` with the environment variables given set (undefined: unset), then restores each as it was. */
function withEnv(values: Record<string, string | undefined>, body: () => void): void {
  const saved = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  const put = (from: Record<string, string | undefined>): void => {
    for (const [name, value] of Object.entries(from)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  put(values);
  try {
    body();
  } finally {
    put(saved);
  }
}

/** The worker setting of the gate's, the screenshots' and both comparison passes' configurations. */
function workers(): unknown[] {
  const compare = ["1", "2"].map((pass) => {
    let config = {};
    withEnv({ FAILWISE_COMPARE_PASS: pass }, () => {
      config = compareConfig();
    });
    return config;
  });
  return [browserConfig("gate", "**/*.gate.ts"), browserConfig("shots", "**/*.shots.ts"), ...compare].map((config) =>
    "workers" in config ? config.workers : "no workers key",
  );
}

test("in CI the gate uses every core of the runner, and the screenshots and both comparison passes set no workers", () => {
  withEnv({ CI: "true" }, () => {
    assert.deepEqual(workers(), ["100%", "no workers key", "no workers key", "no workers key"]);
  });
});

test("outside CI, or with CI empty, no configuration sets workers, the gate's included, so Playwright keeps its default", () => {
  for (const CI of [undefined, ""]) {
    withEnv({ CI }, () => {
      assert.deepEqual(workers(), ["no workers key", "no workers key", "no workers key", "no workers key"], String(CI));
    });
  }
});
