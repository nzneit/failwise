// The OpenCode entrypoint. `opencode plugin add` looks for a server export in the
// package manifest, so package.json points both "." and "./server" here. This module
// registers the Claude Code skill with OpenCode and holds no dependency of its own.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ID = "fmea-software";
const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", SKILL_ID);
const CLAUDE_DIR = "${CLAUDE_SKILL_DIR}";

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  path: string;
  content: string;
}

interface SkillEditor {
  add(skill: SkillInfo): void;
}

interface PluginContext {
  skill?: {
    transform: (callback: (editor: SkillEditor) => void) => Promise<unknown>;
  };
}

interface Frontmatter {
  name: string;
  description: string;
  body: string;
}

/** Reads the two frontmatter fields OpenCode needs and returns the Markdown body without the block.
 *  Handles LF and CRLF, quoted values, and indented continuation lines, as a Windows checkout or a
 *  wrapped description can produce. */
function parseFrontmatter(markdown: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(markdown);
  if (!match) throw new Error("SKILL.md has no frontmatter block");
  const fields = new Map<string, string>();
  let lastKey: string | undefined;
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.replace(/\r$/u, "");
    const at = line.indexOf(":");
    if (at > 0 && !/^\s/u.test(line)) {
      const key = line.slice(0, at).trim();
      const value = line.slice(at + 1).trim();
      fields.set(key, /^(>[+-]?|\|[+-]?)$/u.test(value) ? "" : value);
      lastKey = key;
    } else if (lastKey !== undefined && line.trim() !== "") {
      fields.set(lastKey, `${fields.get(lastKey) ?? ""} ${line.trim()}`.trim());
    }
  }
  for (const [key, value] of fields) {
    fields.set(key, value.replace(/^(["'])([\s\S]*)\1$/u, "$2"));
  }
  const name = fields.get("name");
  const description = fields.get("description");
  if (!name) throw new Error("SKILL.md frontmatter has no name");
  if (!description) throw new Error("SKILL.md frontmatter has no description");
  return { name, description, body: match[2].replace(/^\r?\n/u, "") };
}

/** The skill as OpenCode stores it. Claude Code supplies ${CLAUDE_SKILL_DIR}; OpenCode does not,
 *  so the installed directory is written into the script commands, shell-quoted. */
async function loadSkill(skillDir: string = SKILL_DIR): Promise<SkillInfo> {
  const path = join(skillDir, "SKILL.md");
  const { name, description, body } = parseFrontmatter(await readFile(path, "utf8"));
  const content = body.replaceAll(CLAUDE_DIR, JSON.stringify(skillDir));
  return { id: SKILL_ID, name, description, path, content };
}

export default {
  id: "failwise",
  async setup(ctx: PluginContext): Promise<void> {
    const skillDomain = ctx.skill;
    if (!skillDomain || typeof skillDomain.transform !== "function") return;

    let skill: SkillInfo;
    try {
      skill = await loadSkill();
    } catch (error) {
      console.error("[failwise] skill could not be read:", error);
      return;
    }

    try {
      await skillDomain.transform((editor) => {
        try {
          editor.add(skill);
        } catch (error) {
          console.error("[failwise] skill rejected by OpenCode:", error);
        }
      });
    } catch (error) {
      console.error("[failwise] skill registration failed:", error);
    }
  },
};
