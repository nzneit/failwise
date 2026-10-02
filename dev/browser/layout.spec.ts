// The layout checks: at each width of WIDTHS the report neither scrolls sideways nor puts an
// element past the viewport's right edge. A known failure, and a check measured but not asserted,
// are declared in matrix.ts. The report is loaded and measured first; a check not asserted at this
// width is then recorded as an annotation and the test ends; otherwise the test is marked as an
// expected failure where one is known and compared. So a report that did not load or a measurement
// that throws fails at every width, and only the `expect` can be the expected failure.

import { expect, test } from "@playwright/test";
import { expectedFailure, WIDTHS } from "./matrix.ts";
import { openReport, pastRightEdge, recordNotAsserted, sidewaysScroll } from "./report.ts";

for (const width of WIDTHS) {
  test(`${width}px: the page does not scroll sideways`, async ({ page }) => {
    await openReport(page, width);
    const scroll = await sidewaysScroll(page);
    if (recordNotAsserted("scroll", width, scroll)) return;
    const known = expectedFailure("scroll", width);
    test.fail(known !== undefined, known?.reason);
    expect(scroll).toBe(0);
  });

  test(`${width}px: nothing extends past the right edge`, async ({ page }) => {
    await openReport(page, width);
    const past = await pastRightEdge(page);
    if (recordNotAsserted("edge", width, past)) return;
    const known = expectedFailure("edge", width);
    test.fail(known !== undefined, known?.reason);
    expect(past).toEqual([]);
  });
}
