// The screenshots of the report's parts, one test per width: the whole page, then each section but
// the chains, the key, the index and each row section, under build/shots/<engine>/<width>/. A part
// taller than MAX_PART_HEIGHT is cut into consecutive pieces, so an image reader never shrinks one
// past legibility. A part the report does not have is not written and fails nothing here:
// tools/shots.ts reads the report and knows which files are owed.

import { join } from "node:path";
import { test, type Locator, type Page } from "@playwright/test";
import { SHOTS_DIR } from "./config.ts";
import { MAX_PART_HEIGHT, rowFileStem, SECTION_PARTS, WIDTHS } from "./matrix.ts";
import { openReport } from "./report.ts";

/** Writes `locator`'s element as `<stem>.png`, or as `<stem>-p1.png`, `<stem>-p2.png` ... when it is
 *  taller than MAX_PART_HEIGHT. Writes nothing when the locator matches nothing. */
async function writePart(page: Page, locator: Locator, dir: string, stem: string): Promise<void> {
  if ((await locator.count()) === 0) return;
  // Page coordinates, whatever the scroll position, rounded out to whole pixels.
  const box = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, right: rect.right + window.scrollX, bottom: rect.bottom + window.scrollY };
  });
  const x = Math.floor(box.x);
  const top = Math.floor(box.y);
  const width = Math.ceil(box.right) - x;
  const height = Math.ceil(box.bottom) - top;
  const pieces = Math.ceil(height / MAX_PART_HEIGHT);
  for (let piece = 0; piece < pieces; piece += 1) {
    const y = top + piece * MAX_PART_HEIGHT;
    const clip = { x, y, width, height: Math.min(MAX_PART_HEIGHT, top + height - y) };
    const name = pieces === 1 ? `${stem}.png` : `${stem}-p${piece + 1}.png`;
    await page.screenshot({ path: join(dir, name), fullPage: true, clip });
  }
}

for (const width of WIDTHS) {
  test(`${width}px: the report's parts`, async ({ page }, testInfo) => {
    await openReport(page, width);
    const dir = join(SHOTS_DIR, testInfo.project.name, String(width));
    await page.screenshot({ path: join(dir, "page.png"), fullPage: true });
    for (const id of SECTION_PARTS) await writePart(page, page.locator(`#${id}`), dir, id);
    await writePart(page, page.locator(".key"), dir, "key");
    await writePart(page, page.locator("table.index"), dir, "index");
    const rows = page.locator("article.row");
    const ids = await rows.evaluateAll((elements) => elements.map((element) => element.id));
    for (const [i, id] of ids.entries()) await writePart(page, rows.nth(i), dir, rowFileStem(i + 1, id));
  });
}
