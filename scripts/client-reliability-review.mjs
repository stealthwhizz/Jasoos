import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const requireTools = createRequire(resolve(process.env.BROWSER_TOOLS_PATH ?? ".", "package.json"));
const { chromium } = requireTools("playwright");
const axe = requireTools("axe-core");
const baseURL = process.env.BROWSER_BASE_URL ?? "http://127.0.0.1:3003";
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname));
const phase = process.argv[2] ?? "reliability";
assert(/^[a-z-]+$/.test(phase));
const output = resolve("artifacts/browser/integration", phase);
assert(!existsSync(resolve(output, "report.json")), "Preserve evidence: choose a fresh phase");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = {
  date: new Date().toISOString(),
  baseURL,
  fixtureOnly: true,
  browser: browser.version(),
  checks: [],
  diagnostics: [],
  accessibility: [],
};
const suites = (process.env.RELIABILITY_SUITES ?? "gallery").split(",");
const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
function check(name, passed, evidence, width) {
  report.checks.push({ name, status: passed ? "PASS" : "FAIL", width, evidence });
  console.log(`${passed ? "PASS" : "FAIL"} ${width} ${name}`);
  if (!passed) console.log(evidence);
}
async function pageFor(viewport, label) {
  const context = await browser.newContext({
    baseURL,
    viewport,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(baseURL).origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const diagnostics = { label, pageErrors: [], consoleErrors: [], failedRequests: [] };
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }),
  );
  report.diagnostics.push(diagnostics);
  const status = await context.request.get("/api/status");
  assert.equal((await status.json()).fixtures, true, "Never run against live integration mode");
  return { page, context, diagnostics };
}
async function capture(page, name, width) {
  await page.screenshot({ path: resolve(output, `${name}-${width}.png`), fullPage: true });
  check(
    `${name}: no horizontal overflow`,
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    null,
    width,
  );
  if (!(await page.evaluate(() => Boolean(window.axe))))
    await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    });
    return { violations: r.violations, incomplete: r.incomplete };
  });
  report.accessibility.push({ name, width, ...result });
  check(
    `${name}: automated accessibility`,
    result.violations.length === 0,
    result.violations.map((v) => v.id),
    width,
  );
}

try {
  if (suites.includes("gallery"))
    for (const viewport of viewports)
      for (const [name, payload] of [
        ["object", { error: "Invalid upstream response" }],
        ["null", null],
        ["records", [{}]],
      ]) {
        const { page, context, diagnostics } = await pageFor(
          viewport,
          `gallery-${name}-${viewport.width}`,
        );
        try {
          await page.route("**/api/gallery", (route) => route.fulfill({ json: payload }));
          await page.goto("/");
          const draft = "A detective follows a midnight tram";
          await page.getByRole("textbox", { name: "Your scene" }).fill(draft);
          await page.getByRole("button", { name: "Retry gallery" }).waitFor();
          check(`malformed gallery ${name} offers recovery`, true, null, viewport.width);
          await capture(page, `gallery-${name}-error`, viewport.width);
          await page.unroute("**/api/gallery");
          await page.getByRole("button", { name: "Retry gallery" }).click();
          await page.locator(".world-card").first().waitFor();
          check(
            `gallery ${name} retry preserves creation draft`,
            (await page.getByRole("textbox", { name: "Your scene" }).inputValue()) === draft,
            null,
            viewport.width,
          );
          check(
            `gallery ${name} has no uncaught errors`,
            diagnostics.pageErrors.length === 0,
            diagnostics.pageErrors,
            viewport.width,
          );
          await capture(page, `gallery-${name}-recovered`, viewport.width);
        } catch (error) {
          check(`gallery ${name} completed`, false, error.message, viewport.width);
        } finally {
          await context.close();
        }
      }
} finally {
  await browser.close();
  report.summary = report.checks.reduce((summary, check) => (summary[check.status]++, summary), {
    PASS: 0,
    FAIL: 0,
    UNVERIFIED: 0,
  });
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.summary));
  process.exitCode = report.summary.FAIL ? 1 : 0;
}
