// The accessibility check: at each width of WIDTHS axe-core reports no violation of WCAG A or AA.
// A known failure is declared in matrix.ts. The report is loaded and axe run before a test is
// marked as an expected failure, so a report that did not load or an axe run that throws fails at
// every width, and only the `expect` can be the expected failure.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectedFailure, WIDTHS } from "./matrix.ts";
import { openReport } from "./report.ts";

for (const width of WIDTHS) {
  test(`${width}px: axe reports no WCAG A or AA violation`, async ({ page }) => {
    await openReport(page, width);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const known = expectedFailure("axe", width);
    test.fail(known !== undefined, known?.reason);
    expect(violations.map((violation) => `${violation.id}: ${violation.nodes.length} node(s), first ${String(violation.nodes[0]?.target)}`)).toEqual([]);
  });
}
