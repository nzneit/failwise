// The layout checks: at each width of WIDTHS the report neither scrolls sideways nor puts an
// element past the viewport's right edge. A known failure is declared in matrix.ts.

import { expect, test } from "@playwright/test";
import { expectedFailure, WIDTHS } from "./matrix.ts";
import { openReport, pastRightEdge, sidewaysScroll } from "./report.ts";

for (const width of WIDTHS) {
  test(`${width}px: the page does not scroll sideways`, async ({ page }) => {
    const known = expectedFailure("scroll", width);
    test.fail(known !== undefined, known?.reason);
    await openReport(page, width);
    expect(await sidewaysScroll(page)).toBe(0);
  });

  test(`${width}px: nothing extends past the right edge`, async ({ page }) => {
    const known = expectedFailure("edge", width);
    test.fail(known !== undefined, known?.reason);
    await openReport(page, width);
    expect(await pastRightEdge(page)).toEqual([]);
  });
}
