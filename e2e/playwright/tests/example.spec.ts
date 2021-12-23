import { test, expect } from "@playwright/test";

test("basic test", async ({ page }) => {
  await page.goto("http://localhost:10000/");

  await expect(page).toHaveTitle("Deephaven");

  // Click .console-input
  await page.click(".console-input");

  // Read csv example data
  await page.type(".console-input textarea", "from deephaven import read_csv");
  await page.press(".console-input textarea", "Shift+Enter");
  await page.type(
    ".console-input textarea",
    'source = read_csv("https://media.githubusercontent.com/media/deephaven/examples/main/MetricCentury/csv/metriccentury.csv")'
  );
  await page.press(".console-input textarea", "Enter");

  // Console input should clear
  await expect(page.locator(".console-input textarea")).toHaveText("");

  // Now click on the grid that was created
  await page.click(".iris-grid-panel canvas");

  expect(
    await page.locator(".iris-grid-panel canvas").screenshot()
  ).toMatchSnapshot("iris-grid-source.png");

  // Make sure the title is correct
  await expect(
    page.locator(".lm_tab.lm_active.lm_focusin .lm_title")
  ).toHaveText("source");

  // Now create a plot
  // Click .console-input
  await page.click(".console-input");

  // Enter commands to create a plot from the previous data
  await page.type(".console-input textarea", "from deephaven import Plot");
  await page.press(".console-input textarea", "Shift+Enter");
  await page.type(
    ".console-input textarea",
    'plot_single = Plot.plot("Distance",  source.where("SpeedKPH > 0"), "Time", "DistanceMeters").show()'
  );
  await page.press(".console-input textarea", "Enter");

  // Wait for the plot lines to appear
  await page.waitForSelector(
    ".iris-chart-panel .cartesianlayer .scatterlayer .trace.scatter"
  );

  expect(
    await page.locator(".iris-chart-panel .cartesianlayer").screenshot()
  ).toMatchSnapshot("iris-chart-plot_single.png");
});
