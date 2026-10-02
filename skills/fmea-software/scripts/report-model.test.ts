import { test } from "node:test";
import assert from "node:assert/strict";
import { sortChains } from "./lib/report-model.ts";
import { sortChains as renderSortChains } from "./render.ts";
import { loadTable } from "./lib/table.ts";
import { loadFixture } from "./test-helpers.ts";
import type { FmeaDocument } from "./lib/types.ts";

const table = loadTable();
const fixture = (): FmeaDocument => loadFixture<FmeaDocument>("checkout-service.fmea.json");

test("sortChains, moved to the model, sorts the checkout fixture and is the function render.ts exports", () => {
  assert.deepEqual(sortChains(fixture(), table).map((c) => c.id), ["ch-2", "ch-1", "ch-5", "ch-7", "ch-4", "ch-8", "ch-6", "ch-3"]);
  assert.equal(renderSortChains, sortChains);
});
