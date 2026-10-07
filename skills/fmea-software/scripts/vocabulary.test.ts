import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ScriptError } from "./lib/codes.ts";
import { VOCABULARY_PATH, loadVocabulary } from "./lib/vocabulary.ts";
import type { VocabularyEntry, VocabularyFlag } from "./lib/vocabulary.ts";
import { withTempDir } from "./test-helpers.ts";

// The shipped file with one change, written to a temporary file whose path the callback receives.
function withVocabulary(content: string, fn: (path: string) => void): void {
  withTempDir((dir) => {
    const path = join(dir, "vocabulary.json");
    writeFileSync(path, content);
    fn(path);
  });
}

function assertVocabularyRead(path: string, fragment: string): void {
  assert.throws(() => loadVocabulary(path), (err: unknown) => {
    assert.ok(err instanceof ScriptError, "the failure is not a ScriptError");
    assert.equal(err.code, "VOCABULARY_READ");
    assert.ok(err.message.startsWith(`${path}: `), `the message does not name the path: ${err.message}`);
    assert.ok(err.message.includes(fragment), `the message lacks "${fragment}": ${err.message}`);
    return true;
  });
}

test("loadVocabulary reads the shipped file: five roles in the enum order and three boundaries", () => {
  const v = loadVocabulary();
  assert.equal(v.version, 1);
  assert.deepEqual(v.roles.map((r) => r.id), ["service", "datastore", "event_stream", "interface", "component"]);
  assert.deepEqual(v.boundaries.map((b) => b.id), ["in_scope", "owned_outside", "third_party"]);
  assert.equal(v.security.label, "Security-relevant");
  assert.equal(v.tie_breaks.length, 6);
});

test("a missing vocabulary file throws VOCABULARY_READ naming the path", () => {
  withTempDir((dir) => assertVocabularyRead(join(dir, "absent.json"), "cannot read or parse vocabulary"));
});

test("a vocabulary file of another version throws VOCABULARY_READ naming the path", () => {
  withVocabulary(JSON.stringify({ version: 2 }), (path) => assertVocabularyRead(path, "vocabulary is malformed"));
});

test("a vocabulary file that is not JSON throws VOCABULARY_READ naming the path", () => {
  withVocabulary("{ not json", (path) => assertVocabularyRead(path, "cannot read or parse vocabulary"));
});

test("a bare record id as a tag is malformed: every tag is a full provenance tag", () => {
  const raw = JSON.parse(readFileSync(VOCABULARY_PATH, "utf8"));
  raw.roles[0].tags = ["C153"];
  withVocabulary(JSON.stringify(raw), (path) => assertVocabularyRead(path, "vocabulary is malformed"));
});

test("roles out of the enum order are malformed", () => {
  const raw = JSON.parse(readFileSync(VOCABULARY_PATH, "utf8"));
  raw.roles.reverse();
  withVocabulary(JSON.stringify(raw), (path) => assertVocabularyRead(path, "vocabulary is malformed"));
});

test("an empty test string is malformed", () => {
  const raw = JSON.parse(readFileSync(VOCABULARY_PATH, "utf8"));
  raw.boundaries[2].test = "";
  withVocabulary(JSON.stringify(raw), (path) => assertVocabularyRead(path, "vocabulary is malformed"));
});

test("no tag in the shipped vocabulary is a sourced: tag", () => {
  const v = loadVocabulary();
  const entries: (VocabularyEntry | VocabularyFlag)[] = [...v.roles, ...v.boundaries, v.security];
  const tags = [...entries.flatMap((x) => x.tags), ...v.tie_breaks.flatMap((t) => t.tags)];
  assert.ok(tags.length > 0);
  assert.deepEqual(tags.filter((t) => t.startsWith("sourced:")), []);
});
