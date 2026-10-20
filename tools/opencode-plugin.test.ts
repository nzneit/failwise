import { mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dirname, "..");
const ENTRY = join(ROOT, "opencode", "index.ts");
const SKILL_DIR = join(ROOT, "skills", "fmea-software");

interface Skill {
  id: string;
  name: string;
  description: string;
  path: string;
  content: string;
}

interface Context {
  skill: {
    transform: (callback: (editor: { add: (skill: Skill) => void }) => void) => Promise<unknown>;
  };
}

interface Plugin {
  id: string;
  setup: (ctx: Context) => Promise<unknown>;
}

async function loadPlugin(): Promise<Plugin> {
  const module = (await import(pathToFileURL(ENTRY).href)) as { default: Plugin };
  return module.default;
}

test("the root manifest points OpenCode at the plugin entrypoint", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    exports?: Record<string, string>;
  };
  assert.equal(manifest.exports?.["."], "./opencode/index.ts");
  assert.equal(manifest.exports?.["./server"], "./opencode/index.ts");
  assert.equal(existsSync(join(ROOT, manifest.exports["."])), true);
});

test("the plugin registers fmea-software with the installed skill directory", async () => {
  const plugin = await loadPlugin();
  assert.equal(plugin.id, "failwise");

  const added: Skill[] = [];
  await plugin.setup({
    skill: {
      transform: async (callback) => {
        callback({ add: (skill) => added.push(skill) });
      },
    },
  });

  assert.equal(added.length, 1);
  const skill = added[0];
  assert.equal(skill.id, "fmea-software");
  assert.equal(skill.name, "fmea-software");
  assert.match(skill.description, /design-side Failure Mode and Effects Analysis/);
  assert.equal(skill.path, join(SKILL_DIR, "SKILL.md"));
  assert.ok(skill.content.startsWith("# Software FMEA, design side"));
  assert.ok(!skill.content.includes("${CLAUDE_SKILL_DIR}"));
  assert.ok(skill.content.includes(SKILL_DIR));
  assert.match(skill.content, /node "[^"]+"\/scripts\/priority\.ts/u);
  assert.equal(existsSync(join(SKILL_DIR, "scripts", "priority.ts")), true);
});

test("the plugin reads CRLF and quoted multi-line frontmatter", async () => {
  const root = mkdtempSync(join(tmpdir(), "failwise-opencode-"));
  try {
    mkdirSync(join(root, "opencode"), { recursive: true });
    copyFileSync(ENTRY, join(root, "opencode", "index.ts"));
    const skillDir = join(root, "skills", "fmea-software");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: fmea-software",
        'description: "Runs a design-side',
        '  FMEA for software"',
        "---",
        "",
        "# Fixture",
        "",
        "Body.",
        "",
      ].join("\r\n"),
    );

    const module = (await import(pathToFileURL(join(root, "opencode", "index.ts")).href)) as { default: Plugin };
    const added: Skill[] = [];
    await module.default.setup({
      skill: {
        transform: async (callback) => {
          callback({ add: (skill) => added.push(skill) });
        },
      },
    });

    assert.equal(added.length, 1);
    assert.equal(added[0].description, "Runs a design-side FMEA for software");
    assert.ok(added[0].content.startsWith("# Fixture"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a host rejection during skill registration is logged, not thrown", async () => {
  const plugin = await loadPlugin();
  const logged: unknown[][] = [];
  const error = mock.method(console, "error", (...args: unknown[]) => {
    logged.push(args);
  });
  try {
    await assert.doesNotReject(
      plugin.setup({
        skill: {
          transform: async (callback) => {
            callback({
              add: () => {
                throw new Error("Skill.Info decode failure");
              },
            });
          },
        },
      }),
    );
    assert.equal(logged.length, 1);
  } finally {
    error.mock.restore();
  }
});

test("a V1-shaped context without a skill domain is ignored", async () => {
  const plugin = await loadPlugin();
  await assert.doesNotReject(plugin.setup({} as Context));
});
