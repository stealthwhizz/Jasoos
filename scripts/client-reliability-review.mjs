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
  if (suites.includes("visit"))
    for (const viewport of viewports)
      for (const mode of ["transport", "http"]) {
        const { page, context, diagnostics } = await pageFor(
          viewport,
          `visit-${mode}-${viewport.width}`,
        );
        try {
          await page.route("**/api/worlds/*/visit", (route) =>
            mode === "transport"
              ? route.abort("failed")
              : route.fulfill({ status: 503, json: { error: "Deliberate visit failure" } }),
          );
          await page.goto("/world/fixture-monsoon-tiffin");
          await page
            .getByText("Visit activity could not be recorded. You can keep investigating.", {
              exact: true,
            })
            .waitFor();
          check(
            `visit ${mode} failure is visible without blocking play`,
            await page.locator("canvas").isVisible(),
            null,
            viewport.width,
          );
          await page.waitForFunction(() => document.activeElement?.tagName === "CANVAS");
          await page.locator("canvas").focus();
          await page.keyboard.press("e");
          await page.getByRole("heading", { name: "Dabba Depot", exact: true }).waitFor();
          check(
            `visit ${mode} failure keeps doors usable`,
            await page.getByRole("textbox", { name: /^Say something/ }).isVisible(),
            null,
            viewport.width,
          );
          check(
            `visit ${mode} failure has no uncaught rejection`,
            diagnostics.pageErrors.length === 0,
            diagnostics.pageErrors,
            viewport.width,
          );
          await capture(page, `visit-${mode}-recovered`, viewport.width);
        } catch (error) {
          check(`visit ${mode} completed`, false, error.message, viewport.width);
        } finally {
          await context.close();
        }
      }
  if (suites.includes("interior"))
    for (const viewport of viewports)
      for (const state of ["download", "pending", "failed"]) {
        const { page, context, diagnostics } = await pageFor(
          viewport,
          `interior-${state}-${viewport.width}`,
        );
        try {
          if (state === "download")
            await page.route("**/fixtures/interior-depot.svg", (route) => route.abort("failed"));
          else
            await page.route("**/world/fixture-monsoon-tiffin", async (route) => {
              const response = await route.fetch();
              let replacements = 0;
              const body = (await response.text()).replace(
                /<script([^>]*)>([\s\S]*?)<\/script>/g,
                (script, attributes, content) => {
                  if (!content.startsWith("self.__next_f.push(")) return script;
                  const data = JSON.parse(content.slice("self.__next_f.push(".length, -1));
                  if (typeof data[1] !== "string") return script;
                  data[1] = data[1].replace(
                    /("id":"interior-depot"[^}]*"status":")ready(")/g,
                    (_all, before, after) => {
                      replacements++;
                      return before + state + after;
                    },
                  );
                  return `<script${attributes}>self.__next_f.push(${JSON.stringify(data)})</script>`;
                },
              );
              assert(
                replacements > 0,
                "Injected fixture state must actually replace the serialized asset",
              );
              await route.fulfill({ response, body });
            });
          await page.goto("/world/fixture-monsoon-tiffin");
          await page.waitForFunction(() => document.activeElement?.tagName === "CANVAS");
          await page.locator("canvas").focus();
          await page.keyboard.press("e");
          const message =
            state === "download"
              ? "The room artwork could not be loaded."
              : state === "pending"
                ? "Still building this room"
                : "This room image could not be generated.";
          await page.getByText(message, { exact: true }).waitFor();
          check(
            `interior ${state} has a labelled playable state`,
            await page.getByRole("textbox", { name: /^Say something/ }).isVisible(),
            null,
            viewport.width,
          );
          await page
            .getByRole("textbox", { name: /^Say something/ })
            .fill("What happened tonight?");
          await page.getByRole("button", { name: "Ask", exact: true }).click();
          await page.getByRole("log").locator("p").nth(1).waitFor();
          check(`interview works during ${state} artwork state`, true, null, viewport.width);
          await capture(page, `interior-${state}`, viewport.width);
          if (state === "download") {
            await page.unroute("**/fixtures/interior-depot.svg");
            await page.getByRole("button", { name: "Retry room image" }).click();
            await page
              .getByRole("img", { name: /Racks of tiffin boxes/ })
              .evaluate((image) => image.decode());
            check(
              "artwork retry retains the interview",
              (await page.getByRole("log").locator("p").count()) === 2,
              null,
              viewport.width,
            );
            await capture(page, "interior-download-recovered", viewport.width);
          }
          check(
            `interior ${state} has no uncaught errors`,
            diagnostics.pageErrors.length === 0,
            diagnostics.pageErrors,
            viewport.width,
          );
        } catch (error) {
          check(`interior ${state} completed`, false, error.message, viewport.width);
        } finally {
          await context.close();
        }
      }
  if (suites.includes("dialogue"))
    for (const viewport of viewports) {
      const { page, context, diagnostics } = await pageFor(
        viewport,
        `dialogue-resize-${viewport.width}`,
      );
      try {
        await page.goto("/world/fixture-monsoon-tiffin");
        await page.waitForFunction(() => document.activeElement?.tagName === "CANVAS");
        await page.keyboard.press("e");
        const input = page.getByRole("textbox", { name: /^Say something/ });
        for (const message of ["What happened tonight?", "What did you notice?"]) {
          await input.fill(message);
          const response = page.waitForResponse((response) =>
            response.url().endsWith("/api/dialogue"),
          );
          await page.getByRole("button", { name: "Ask", exact: true }).click();
          await response;
          await page.waitForFunction(
            () => document.querySelector('input[id^="say-"]')?.value === "",
          );
        }
        await page.getByRole("log").evaluate((log) => {
          log.style.fontSize = `${parseFloat(getComputedStyle(log).fontSize) * 2}px`;
        });
        await page.waitForFunction(() => {
          const log = document.querySelector('[role="log"]');
          return log && Math.abs(log.scrollHeight - log.clientHeight - log.scrollTop) < 2;
        });
        check(
          "latest reply remains visible after text is enlarged",
          (await page.getByRole("log").locator("p").count()) === 4,
          null,
          viewport.width,
        );
        check(
          "dialogue resize has no uncaught errors",
          diagnostics.pageErrors.length === 0,
          diagnostics.pageErrors,
          viewport.width,
        );
        await capture(page, "dialogue-large-text", viewport.width);
      } catch (error) {
        check("dialogue resize completed", false, error.message, viewport.width);
      } finally {
        await context.close();
      }
    }
  if (suites.includes("deadline"))
    for (const viewport of viewports) {
      const { page, context, diagnostics } = await pageFor(viewport, `deadline-${viewport.width}`);
      const held = [];
      try {
        await page.route("**/api/status", (route) => {
          held.push(route);
        });
        await page.route("**/api/gallery", (route) => {
          held.push(route);
        });
        const started = Date.now();
        await page.goto("/");
        await page
          .getByRole("textbox", { name: "Your scene" })
          .fill("Keep this case draft through a timeout");
        await page
          .getByRole("button", { name: "Retry creation status" })
          .waitFor({ timeout: 35000 });
        await page.getByRole("button", { name: "Retry gallery" }).waitFor({ timeout: 35000 });
        const elapsedMs = Date.now() - started;
        check(
          "stalled reads stop at the real 30-second client deadline",
          elapsedMs >= 29000 && elapsedMs < 36000,
          { elapsedMs },
          viewport.width,
        );
        await capture(page, "request-deadline", viewport.width);
        for (const route of held) await route.abort("failed").catch(() => {});
        await page.unroute("**/api/status");
        await page.unroute("**/api/gallery");
        await page.getByRole("button", { name: "Retry creation status" }).click();
        await page.getByRole("button", { name: "Retry gallery" }).click();
        await page.getByRole("button", { name: "Verify demo session" }).waitFor();
        await page.locator(".world-card").first().waitFor();
        check(
          "timeout recovery retains the prompt",
          (await page.getByRole("textbox", { name: "Your scene" }).inputValue()) ===
            "Keep this case draft through a timeout",
          null,
          viewport.width,
        );
        check(
          "request deadlines have no uncaught errors",
          diagnostics.pageErrors.length === 0,
          diagnostics.pageErrors,
          viewport.width,
        );
        await capture(page, "request-deadline-recovered", viewport.width);
      } catch (error) {
        check("request deadline completed", false, error.message, viewport.width);
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
