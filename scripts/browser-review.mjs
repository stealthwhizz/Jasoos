import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const tools = createRequire(resolve(process.env.BROWSER_TOOLS_PATH ?? ".", "package.json"));
const { chromium } = tools("playwright");
const axe = tools("axe-core");
const baseURL = process.env.BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname));
const phase = process.argv[2] ?? "after";
assert(/^[a-z-]+$/.test(phase));
const output = resolve("artifacts/browser/lane-b-chromium", phase);
assert(
  !existsSync(resolve(output, "report.json")),
  "Use a new phase name to preserve existing evidence",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  phase,
  date: new Date().toISOString(),
  baseURL,
  browser: browser.version(),
  playwright: tools("playwright/package.json").version,
  axe: axe.version,
  fixtureOnly: true,
  checks: [],
  accessibility: [],
  diagnostics: [],
  summary: { PASS: 0, FAIL: 0, UNVERIFIED: 0 },
};

function checkpoint() {
  report.summary = report.checks.reduce(
    (counts, result) => {
      counts[result.status] += 1;
      return counts;
    },
    { PASS: 0, FAIL: 0, UNVERIFIED: 0 },
  );
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
process.on("exit", checkpoint);

function check(name, passed, evidence, viewport) {
  report.checks.push({ name, status: passed ? "PASS" : "FAIL", viewport, evidence });
  console.log(`${passed ? "PASS" : "FAIL"} ${viewport ?? ""} ${name}`);
  checkpoint();
}

const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

async function newPage(viewport, label) {
  const context = await browser.newContext({
    baseURL,
    viewport,
    hasTouch: viewport.width < 1000,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const diagnostics = {
    label,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    externalRequests: [],
    injectedFailures: [],
  };
  report.diagnostics.push(diagnostics);
  await context.route("**/*", async (route) => {
    const address = new URL(route.request().url());
    if (address.origin !== new URL(baseURL).origin) {
      diagnostics.externalRequests.push(address.origin + address.pathname);
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
  const page = await context.newPage();
  diagnostics.completedStreams = [];
  await page.exposeFunction("__recordCompletedStream", (url) =>
    diagnostics.completedStreams.push(url),
  );
  page.setDefaultTimeout(10000);
  page.on("console", (message) => {
    if (message.type() === "error")
      diagnostics.consoleErrors.push({ text: message.text(), url: message.location().url });
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) =>
    diagnostics.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText,
    }),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      diagnostics.httpErrors.push({ url: response.url(), status: response.status() });
  });
  await page.addInitScript(() => {
    window.__completedEventStreams = [];
    window.__malformedEventStreams = [];
    const NativeEventSource = window.EventSource;
    window.EventSource = class extends NativeEventSource {
      constructor(...parameters) {
        super(...parameters);
        this.addEventListener("message", (event) => {
          try {
            const body = JSON.parse(event.data);
            if (body.type === "done" || body.type === "error") {
              window.__completedEventStreams.push(this.url);
              void window.__recordCompletedStream(this.url);
            }
          } catch {
            window.__malformedEventStreams.push(this.url);
          }
        });
      }
    };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    window.__canvasFrames = [];
    CanvasRenderingContext2D.prototype.drawImage = function (...parameters) {
      const result = drawImage.apply(this, parameters);
      if (this.canvas.isConnected && this.canvas.width === 960 && parameters.length === 9) {
        const transform = this.getTransform();
        const position = {
          x: transform.e,
          y: transform.f,
          facing: transform.a,
          now: performance.now(),
          source: parameters[0].src ?? "keyed-canvas",
          crop: parameters.slice(1, 5),
          destination: parameters.slice(5),
        };
        window.__canvasPosition = position;
        window.__canvasFrames.push(position);
        if (window.__canvasFrames.length > 600) window.__canvasFrames.shift();
      }
      return result;
    };
  });
  const status = await context.request.get("/api/status");
  assert.equal((await status.json()).fixtures, true, "Refusing to test non-fixture server");
  return { context, page, diagnostics };
}

async function injectFailure(
  page,
  diagnostics,
  pattern,
  mode,
  message = "Fixture service temporarily unavailable.",
) {
  await page.route(
    pattern,
    async (route) => {
      diagnostics.injectedFailures.push({
        url: route.request().url(),
        mode,
        reason: "Deliberate regression-test fault",
      });
      if (mode === "transport") return route.abort("failed");
      if (mode === "http")
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: message }),
        });
      if (mode === "invalid-json")
        return route.fulfill({ status: 502, contentType: "text/html", body: "Bad Gateway" });
      if (mode === "malformed-sse")
        return route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: "data: {bad-json\n\n",
        });
      if (mode === "error-sse")
        return route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: `data: ${JSON.stringify({ type: "error", message })}\n\n`,
        });
      throw new Error(`Unknown fault mode: ${mode}`);
    },
    { times: 1 },
  );
}

async function reviewDiagnostics(page, diagnostics, name, width) {
  const completedStreams = diagnostics.completedStreams;
  const expected = [];
  const unexpectedRequests = diagnostics.failedRequests.filter((request) => {
    const fault = diagnostics.injectedFailures.find((entry) => entry.url === request.url);
    if (
      fault &&
      ["transport", "malformed-sse"].includes(fault.mode) &&
      ["net::ERR_FAILED", "net::ERR_ABORTED"].includes(request.error)
    ) {
      expected.push({ ...request, reason: fault.reason, mode: fault.mode });
      return false;
    }
    if (
      request.error === "net::ERR_ABORTED" &&
      /\/api\/worlds\/[^/]+\/events$/.test(request.url) &&
      completedStreams.includes(request.url)
    ) {
      expected.push({
        ...request,
        reason: "Client closes SSE after an observed terminal done/error event",
      });
      return false;
    }
    return true;
  });
  const unexpectedHttp = diagnostics.httpErrors.filter((response) => {
    const fault = diagnostics.injectedFailures.find((entry) => entry.url === response.url);
    if (
      fault &&
      ((fault.mode === "http" && response.status === 503) ||
        (fault.mode === "invalid-json" && response.status === 502))
    ) {
      expected.push({ ...response, reason: fault.reason, mode: fault.mode });
      return false;
    }
    return true;
  });
  const unexpectedConsole = diagnostics.consoleErrors.filter((message) => {
    if (
      message.text.startsWith("Failed to load resource:") &&
      expected.some((entry) => entry.url === message.url)
    ) {
      expected.push({ ...message, reason: "Browser resource error for the classified test fault" });
      return false;
    }
    return true;
  });
  diagnostics.classification = { expected, unexpectedRequests, unexpectedHttp, unexpectedConsole };
  check(
    name,
    !unexpectedRequests.length &&
      !unexpectedHttp.length &&
      !unexpectedConsole.length &&
      !diagnostics.pageErrors.length &&
      !diagnostics.externalRequests.length,
    diagnostics,
    width,
  );
}

async function capture(page, stage, width) {
  await page.screenshot({ path: resolve(output, `${stage}-${width}.png`), fullPage: true });
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    content: document.documentElement.scrollWidth,
    height: innerHeight,
    contentHeight: document.documentElement.scrollHeight,
  }));
  check(
    `${stage}: no horizontal overflow`,
    dimensions.content <= dimensions.width,
    dimensions,
    width,
  );
  if (!(await page.evaluate(() => Boolean(window.axe))))
    await page.addScriptTag({ content: axe.source });
  const audit = await page.evaluate(async () => {
    const result = await window.axe.run(
      { exclude: ["nextjs-portal"] },
      {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      },
    );
    const summarize = (entry) => ({
      id: entry.id,
      impact: entry.impact,
      description: entry.description,
      nodes: entry.nodes.map(({ target, failureSummary, any }) => ({
        target,
        failureSummary,
        data: any.map(({ data }) => data),
      })),
    });
    return {
      violations: result.violations.map(summarize),
      incomplete: result.incomplete.map(summarize),
    };
  });
  report.accessibility.push({ stage, width, ...audit });
  check(
    `${stage}: WCAG automated audit`,
    audit.violations.length === 0,
    audit.violations.map(({ id }) => id),
    width,
  );
}

async function openWorld(page) {
  await page.goto("/world/fixture-monsoon-tiffin");
  await page.locator("canvas").waitFor();
  await page.waitForFunction(() => window.__canvasPosition?.source);
}

async function position(page) {
  return page.evaluate(() => window.__canvasPosition);
}

async function hold(page, keys, duration) {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  for (const key of keys) await page.keyboard.up(key);
  await page.waitForTimeout(50);
}

async function enterRoom(page, room, useTouch = false) {
  const target = { cafe: 180, depot: 480, pawn: 780 }[room];
  await page.locator("canvas").focus();
  const current = await position(page);
  if (Math.abs(current.x - target) > 20) {
    const key = current.x > target ? "ArrowLeft" : "ArrowRight";
    const session = useTouch ? await page.context().newCDPSession(page) : null;
    let touchPoints;
    if (session) {
      const button = page.getByRole("button", {
        name: key === "ArrowLeft" ? "Move left" : "Move right",
        exact: true,
      });
      await button.scrollIntoViewIfNeeded();
      const bounds = await button.boundingBox();
      touchPoints = [{ id: 1, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }];
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints });
    } else {
      await page.keyboard.down(key);
    }
    try {
      await page.waitForFunction(
        ({ target, left }) =>
          left ? window.__canvasPosition.x <= target : window.__canvasPosition.x >= target,
        { target, left: key === "ArrowLeft" },
      );
    } finally {
      if (session) {
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await session.detach();
      } else {
        await page.keyboard.up(key);
      }
    }
  }
  if (useTouch) await page.getByRole("button", { name: "Enter nearest door", exact: true }).tap();
  else await page.keyboard.press("e");
  await page
    .getByRole("heading", {
      name: { cafe: "Irani Cafe", depot: "Dabba Depot", pawn: "Pawn Shop" }[room],
      exact: true,
    })
    .waitFor();
}

async function touchMovement(page, context, width) {
  const session = await context.newCDPSession(page);
  const point = async (name, id) => {
    const button = page.getByRole("button", { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    const bounds = await button.boundingBox();
    check(`${name}: usable touch target`, bounds.width >= 44 && bounds.height >= 44, bounds, width);
    return { id, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  };
  try {
    const left = await point("Move left", 1);
    const before = await position(page);
    const scrollBefore = await page.evaluate(() => scrollY);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [left] });
    await page.waitForTimeout(250);
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(50);
    const released = await position(page);
    check(
      "touch hold moves the player",
      released.x < before.x - 30 && released.y === before.y,
      { before, after: released },
      width,
    );
    await page.waitForTimeout(150);
    const stopped = await position(page);
    check("touch release stops movement", released.x === stopped.x, { released, stopped }, width);
    check(
      "touch controls do not scroll the page",
      scrollBefore === (await page.evaluate(() => scrollY)),
      null,
      width,
    );
    const up = await point("Move up", 2);
    await page.evaluate(() => {
      window.__canvasFrames = [];
    });
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [left, up] });
    await page.waitForTimeout(250);
    await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    const motion = await page.evaluate(() => {
      const first = window.__canvasFrames[2];
      const last = window.__canvasFrames.at(-2);
      return {
        distance: Math.hypot(last.x - first.x, last.y - first.y),
        elapsed: last.now - first.now,
      };
    });
    const speed = (motion.distance / motion.elapsed) * 1000;
    check(
      "touch diagonal movement is normalized",
      Math.abs(speed - 240) < 8,
      { ...motion, speed },
      width,
    );
    await page.waitForTimeout(50);
    const cancelled = await position(page);
    await page.waitForTimeout(150);
    const afterCancel = await position(page);
    check(
      "touch cancellation stops every held direction",
      cancelled.x === afterCancel.x && cancelled.y === afterCancel.y,
      { cancelled, afterCancel },
      width,
    );
    await capture(page, "mobile-controls", width);
  } finally {
    await session.detach();
  }
}

async function ask(page, message) {
  const input = page.getByRole("textbox", { name: /^Say something/ });
  await input.fill(message);
  const response = page.waitForResponse((response) => response.url().endsWith("/api/dialogue"));
  await input.press("Enter");
  const reply = await response;
  assert(reply.ok(), "Expected a successful fixture dialogue reply");
  const result = await reply.json();
  await page.getByRole("log").locator("p").filter({ hasText: result.reply }).last().waitFor();
  return result;
}

async function backToStreet(page) {
  await page.getByRole("button", { name: /Back to the street/ }).click();
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(80);
}

async function collectClues(page) {
  await openWorld(page);
  for (const room of ["depot", "cafe", "pawn"]) {
    await enterRoom(page, room);
    await ask(page, "What happened tonight?");
    await ask(page, "What did you notice about the tiffin?");
    await backToStreet(page);
  }
  await page.getByRole("combobox", { name: "Culprit" }).waitFor();
}

for (const viewport of viewports) {
  const { page, context, diagnostics } = await newPage(viewport, `journey-${viewport.width}`);
  const width = viewport.width;
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Verify demo session" }).waitFor();
    await page.getByRole("textbox", { name: "Your scene" }).focus();
    await capture(page, "landing", width);
    await page.getByRole("button", { name: "Verify demo session" }).click();
    await page.waitForFunction(async () => (await (await fetch("/api/status")).json()).verified);
    if (width === 1440) {
      await page
        .getByRole("textbox", { name: "Your scene" })
        .fill("A rain-flooded night market where I carry a tiffin box someone will kill for");
      await page.getByRole("button", { name: "Create world", exact: true }).click();
      await page.getByRole("link", { name: /Walk the world/ }).waitFor({ timeout: 30000 });
      await capture(page, "ticker", width);
      check(
        "fixture creation completes through SSE",
        true,
        await page.getByRole("link", { name: /Walk the world/ }).getAttribute("href"),
        width,
      );
    }
    await openWorld(page);
    await page.locator("canvas").focus();
    await capture(page, "street", width);
    await capture(page, "keyboard-focus", width);
    check(
      "picker locked before clues",
      (await page.getByRole("combobox", { name: "Culprit" }).count()) === 0,
      null,
      width,
    );
    check(
      "touch movement controls available",
      (await page.getByRole("button", { name: "Move left", exact: true }).count()) > 0,
      null,
      width,
    );
    if (width < 1000) {
      await touchMovement(page, context, width);
      await openWorld(page);
    }
    await hold(page, ["ArrowUp"], 800);
    const boundary = await position(page);
    check(
      "walk mask blocks upper boundary",
      boundary.y >= 360 && boundary.y <= 370,
      boundary,
      width,
    );
    await enterRoom(page, "depot", width < 1000);
    const roomFocus = await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      text: document.activeElement.textContent?.slice(0, 80),
    }));
    check(
      "entering room moves focus off removed canvas",
      !["BODY", "HTML"].includes(roomFocus.tag),
      roomFocus,
      width,
    );
    await capture(page, "interior", width);
    await page.getByRole("button", { name: "What happened tonight?", exact: true }).click();
    check(
      "suggested question focuses draft without sending",
      (await page.getByRole("textbox", { name: /^Say something/ }).inputValue()) ===
        "What happened tonight?" && (await page.getByRole("log").locator("p").count()) === 0,
      null,
      width,
    );
    const first = await ask(page, "What happened here tonight?");
    check("first reply preserves clue progression", first.clueRevealed === false, first, width);
    const second = await ask(page, "What did you notice about the tiffin?");
    check("second reply reveals clue", second.clueRevealed === true, second, width);
    await page.waitForFunction(() => {
      const log = document.querySelector('[role="log"]');
      return log && Math.abs(log.scrollHeight - log.clientHeight - log.scrollTop) < 2;
    });
    check(
      "latest dialogue is scrolled into view",
      await page
        .getByRole("log")
        .evaluate((log) => Math.abs(log.scrollHeight - log.clientHeight - log.scrollTop) < 2),
      null,
      width,
    );
    await capture(page, "dialogue", width);
    const conversation = page.getByRole("log", { name: "Conversation with Sakharam" });
    check(
      "dialogue replies announced to assistive technology",
      (await conversation.count()) === 1 &&
        (await conversation.getAttribute("aria-live")) === "polite" &&
        (await conversation.getByText(second.reply, { exact: false }).count()) > 0,
      null,
      width,
    );
    const third = await ask(page, "Anything else?");
    check(
      "third reply closes dialogue",
      third.close === true && (await page.getByText(/has nothing more to say/).count()) > 0,
      third,
      width,
    );
    await backToStreet(page);
    check(
      "returning to street restores canvas focus",
      await page.locator("canvas").evaluate((canvas) => document.activeElement === canvas),
      null,
      width,
    );
    await enterRoom(page, "cafe", width < 1000);
    await ask(page, "What happened tonight?");
    await ask(page, "Who asked about the tiffin?");
    check(
      "two clues still lock accusation",
      (await page.getByRole("combobox", { name: "Culprit" }).count()) === 0,
      null,
      width,
    );
    await page.getByRole("button", { name: "Use Decoder" }).click();
    check(
      "ordinary note decoder",
      (await page.getByText("Nothing hidden.", { exact: true }).count()) > 0,
      null,
      width,
    );
    await capture(page, "decoder-ordinary", width);
    await backToStreet(page);
    await enterRoom(page, "pawn", width < 1000);
    await ask(page, "What happened tonight?");
    await ask(page, "What was pawned this afternoon?");
    await page.getByRole("button", { name: "Use Decoder" }).click();
    check(
      "hidden note decoder",
      (await page.getByText("Hidden message: KEY", { exact: true }).count()) > 0,
      null,
      width,
    );
    await capture(page, "decoder-hidden", width);
    await capture(page, "clues", width);
    const picker = page.getByRole("combobox", { name: "Culprit" });
    check("three distinct clues unlock picker", await picker.isVisible(), null, width);
    await picker.focus();
    await page.keyboard.press("m");
    check(
      "native picker keyboard selection",
      (await picker.inputValue()) === "npc-meera",
      await picker.inputValue(),
      width,
    );
    const suspectCards = page.getByRole("group", { name: "Suspect selection" });
    await suspectCards.getByRole("button", { name: /Meera/ }).click();
    check(
      "suspect card selects the same server culprit ID",
      (await picker.inputValue()) === "npc-meera" &&
        (await suspectCards.getByRole("button", { name: /Meera/ }).getAttribute("aria-pressed")) ===
          "true",
      null,
      width,
    );
    check(
      "evidence tracker reflects all three actual clues",
      (await page.locator(".evidence-slot.collected").count()) === 3,
      null,
      width,
    );
    await capture(page, "accusation", width);
    for (const malformed of [{ correct: true }, { correct: "true" }]) {
      await page.route("**/api/worlds/*/accuse", (route) => route.fulfill({ json: malformed }), {
        times: 1,
      });
      await page.getByRole("button", { name: "Submit accusation" }).click();
      await page
        .getByText(
          "The result could not be confirmed. Retrying will still respect the server's one-accusation limit.",
          { exact: true },
        )
        .waitFor();
      check(
        "malformed accusation result is uncertain rather than a wrong guess",
        (await picker.isEnabled()) &&
          (await page.getByRole("heading", { name: "The truth behind the case" }).count()) === 0,
        null,
        width,
      );
    }
    const accusation = page.waitForResponse((response) => response.url().endsWith("/accuse"));
    await page.getByRole("button", { name: "Submit accusation" }).click();
    const result = await (await accusation).json();
    await page.getByRole("heading", { name: "The truth behind the case" }).waitFor();
    await page.getByRole("img", { name: "The case finale" }).evaluate((image) => image.decode());
    check(
      "correct fixture accusation reveals finale",
      result.correct === true && typeof result.secret === "string",
      { correct: result.correct, finaleUrl: result.finaleUrl },
      width,
    );
    check("accusation locks after success", await picker.isDisabled(), null, width);
    await capture(page, "finale", width);
    const missingImageUrl = `${result.finaleUrl}?review=unavailable`;
    await injectFailure(page, diagnostics, "**/*review=unavailable", "transport");
    await page.getByRole("img", { name: "The case finale" }).evaluate((image, url) => {
      image.src = url;
    }, missingImageUrl);
    await page
      .getByText("Case solved. The finale image is unavailable.", { exact: true })
      .waitFor();
    check(
      "failed finale artwork retains solved secret",
      (await page.getByText(result.secret, { exact: true }).count()) === 1,
      null,
      width,
    );
    await capture(page, "finale-image-unavailable", width);
    await reviewDiagnostics(page, diagnostics, "journey has no unexpected browser failures", width);
  } catch (error) {
    check("journey completed", false, error.message, width);
    await page.screenshot({ path: resolve(output, `journey-error-${width}.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

for (const viewport of viewports) {
  for (const mode of viewport.width === 390
    ? ["transport", "http", "invalid-json"]
    : ["transport"]) {
    const { context, page, diagnostics } = await newPage(
      viewport,
      `dialogue-${mode}-failure-${viewport.width}`,
    );
    const width = viewport.width;
    const suffix = mode === "transport" ? "" : ` (${mode})`;
    const stage = mode === "transport" ? "dialogue-network" : `dialogue-${mode}`;
    try {
      await openWorld(page);
      await enterRoom(page, "depot");
      await injectFailure(page, diagnostics, "**/api/dialogue", mode);
      const input = page.getByRole("textbox", { name: /^Say something/ });
      await input.fill("What happened tonight?");
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      await page.locator("main").getByRole("alert").waitFor();
      check(
        `dialogue recovers from network failure${suffix}`,
        await page.getByRole("button", { name: "Ask", exact: true }).isEnabled(),
        null,
        width,
      );
      check(
        `dialogue failure keeps unsent question${suffix}`,
        (await input.inputValue()) === "What happened tonight?",
        null,
        width,
      );
      check(
        `dialogue failure is announced${suffix}`,
        await page.locator("main").getByRole("alert").isVisible(),
        null,
        width,
      );
      check(
        `dialogue failure has no uncaught exception${suffix}`,
        diagnostics.pageErrors.length === 0,
        diagnostics.pageErrors,
        width,
      );
      check(
        `failed dialogue does not add an NPC reply or clue${suffix}`,
        (await page.getByRole("log").locator("p").count()) === 0 &&
          (await page.getByText("Evidence collected: 0 / 3", { exact: true }).count()) === 1,
        null,
        width,
      );
      await capture(page, `${stage}-failure`, width);
      const retry = await ask(page, "What happened tonight?");
      check(
        `dialogue retry succeeds without skipping a turn${suffix}`,
        retry.clueRevealed === false &&
          (await input.inputValue()) === "" &&
          (await page.getByRole("log").locator("p").count()) === 2 &&
          (await page.locator("main").getByRole("alert").count()) === 0,
        retry,
        width,
      );
      await capture(page, `${stage}-recovered`, width);
      await reviewDiagnostics(
        page,
        diagnostics,
        `dialogue recovery has no unexpected browser failures${suffix}`,
        width,
      );
    } catch (error) {
      check(`dialogue failure suite completed${suffix}`, false, error.message, width);
    } finally {
      await context.close();
    }
  }
}

const movement = await newPage({ width: 1440, height: 900 }, "movement");
try {
  const { page, context } = movement;
  const measure = async (keys) => {
    await openWorld(page);
    await page.locator("canvas").focus();
    await page.evaluate(() => {
      window.__canvasFrames = [];
    });
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(350);
    for (const key of keys) await page.keyboard.up(key);
    return page.evaluate(() => {
      const frames = window.__canvasFrames;
      const first = frames[2];
      const last = frames.at(-2);
      return {
        distance: Math.hypot(last.x - first.x, last.y - first.y),
        elapsed: last.now - first.now,
      };
    });
  };
  const straight = await measure(["ArrowRight"]);
  const diagonal = await measure(["ArrowRight", "ArrowUp"]);
  const straightSpeed = (straight.distance / straight.elapsed) * 1000;
  const diagonalSpeed = (diagonal.distance / diagonal.elapsed) * 1000;
  check("cardinal speed is 240 scene pixels per second", Math.abs(straightSpeed - 240) < 8, {
    ...straight,
    speed: straightSpeed,
  });
  check("diagonal speed is normalized", Math.abs(diagonalSpeed / straightSpeed - 1) < 0.04, {
    ...diagonal,
    speed: diagonalSpeed,
    ratio: diagonalSpeed / straightSpeed,
  });
  await openWorld(page);
  await page.locator("canvas").focus();
  const beforeOpposing = await position(page);
  await hold(page, ["ArrowRight", "ArrowLeft"], 250);
  const afterOpposing = await position(page);
  check("opposing directions cancel", Math.abs(afterOpposing.x - beforeOpposing.x) < 9, {
    before: beforeOpposing,
    after: afterOpposing,
  });
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(100);
  await page.getByRole("link", { name: "Gallery", exact: true }).focus();
  await page.waitForTimeout(50);
  const focusPosition = await position(page);
  await page.waitForTimeout(180);
  const afterFocus = await position(page);
  await page.keyboard.up("ArrowRight");
  check("focus changes clear held movement", focusPosition.x === afterFocus.x, {
    before: focusPosition,
    after: afterFocus,
  });
  await page.locator("canvas").focus();
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(50);
  const blurPosition = await position(page);
  await page.waitForTimeout(150);
  const afterBlur = await position(page);
  await page.keyboard.up("ArrowLeft");
  check("window blur event clears held movement", blurPosition.x === afterBlur.x, {
    before: blurPosition,
    after: afterBlur,
    event: "synthetic window blur",
  });
  await page.locator("canvas").focus();
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(100);
  const otherTab = await context.newPage();
  await otherTab.goto("/");
  await otherTab.bringToFront();
  const browserVisibility = await page.evaluate(() => ({
    hidden: document.hidden,
    focused: document.hasFocus(),
  }));
  const backgroundPosition = await position(page);
  await page.waitForTimeout(150);
  const afterBackground = await position(page);
  await page.keyboard.up("ArrowLeft");
  if (browserVisibility.hidden || !browserVisibility.focused) {
    check("real tab blur clears held movement", backgroundPosition.x === afterBackground.x, {
      before: backgroundPosition,
      after: afterBackground,
      browserVisibility,
    });
  } else {
    report.checks.push({
      name: "real tab blur clears held movement",
      status: "UNVERIFIED",
      evidence:
        "Headless Chromium keeps both tabs visible and focused; synthetic handlers tested separately.",
    });
  }
  await otherTab.close();
  await page.bringToFront();
  await page.locator("canvas").focus();
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(80);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(50);
  const visibilityPosition = await position(page);
  await page.waitForTimeout(150);
  const afterVisibility = await position(page);
  await page.keyboard.up("ArrowLeft");
  check("visibility change clears held movement", visibilityPosition.x === afterVisibility.x, {
    before: visibilityPosition,
    after: afterVisibility,
    event: "synthetic visibilitychange",
  });
  for (const kind of [
    "input",
    "textarea",
    "select",
    "button",
    "a",
    "contenteditable",
    "plaintext-only",
    "empty-contenteditable",
    "inherited-contenteditable",
    "nested-contenteditable-false",
  ]) {
    await page.evaluate((kind) => {
      const editable = kind.includes("contenteditable") || kind === "plaintext-only";
      const control = document.createElement(editable ? "div" : kind);
      control.id = "review-control";
      if (kind === "contenteditable" || kind === "plaintext-only")
        control.contentEditable = kind === "plaintext-only" ? "plaintext-only" : "true";
      if (kind === "empty-contenteditable") control.setAttribute("contenteditable", "");
      if (kind === "inherited-contenteditable" || kind === "nested-contenteditable-false") {
        control.contentEditable = "true";
        const child = document.createElement("span");
        child.tabIndex = 0;
        if (kind === "nested-contenteditable-false") child.contentEditable = "false";
        child.textContent = "Editable ancestor test";
        control.append(child);
      }
      if (kind === "a") control.href = "#review-control";
      if (kind === "select") control.innerHTML = "<option>One</option><option>Two</option>";
      document.querySelector("main").append(control);
      (control.firstElementChild?.tagName === "SPAN" ? control.firstElementChild : control).focus();
    }, kind);
    const beforeControl = await position(page);
    await hold(page, ["ArrowRight"], 120);
    const afterControl = await position(page);
    check(`${kind} does not trigger movement`, beforeControl.x === afterControl.x, {
      before: beforeControl.x,
      after: afterControl.x,
    });
    await page.locator("#review-control").evaluate((control) => control.remove());
  }
  await page.locator("canvas").focus();
  const beforeShortcut = await position(page);
  await hold(page, ["Control", "ArrowRight"], 150);
  const afterShortcut = await position(page);
  check(
    "modified keyboard shortcuts do not move the player",
    beforeShortcut.x === afterShortcut.x,
    { before: beforeShortcut, after: afterShortcut },
  );
  await page.getByRole("button", { name: "Move left", exact: true }).focus();
  const beforeButton = await position(page);
  await hold(page, ["Space"], 200);
  const afterButton = await position(page);
  check("direction buttons support keyboard hold", afterButton.x < beforeButton.x - 30, {
    before: beforeButton,
    after: afterButton,
  });
  await page.waitForTimeout(150);
  const stoppedButton = await position(page);
  check("releasing a direction button key stops movement", stoppedButton.x === afterButton.x, {
    released: afterButton,
    stopped: stoppedButton,
  });
  await page.evaluate(() => {
    document.activeElement.blur();
    document.querySelector("main").style.minHeight = "2600px";
    window.scrollTo(0, 0);
    window.__pageArrowListener = (event) => {
      if (event.key === "ArrowDown") window.__pageArrowPrevented = event.defaultPrevented;
    };
    window.addEventListener("keydown", window.__pageArrowListener);
  });
  const beforeUnfocused = await position(page);
  await hold(page, ["ArrowDown"], 180);
  const afterUnfocused = await position(page);
  check("unfocused canvas does not hijack page arrows", beforeUnfocused.y === afterUnfocused.y, {
    before: beforeUnfocused,
    after: afterUnfocused,
  });
  const scrolling = await page.evaluate(() => ({
    scroll: scrollY,
    prevented: window.__pageArrowPrevented,
  }));
  check(
    "page arrows keep their native scrolling behavior",
    scrolling.scroll > 0 && scrolling.prevented === false,
    scrolling,
  );
  await page.evaluate(() => window.removeEventListener("keydown", window.__pageArrowListener));
  await openWorld(page);
  await page.locator("canvas").focus();
  await hold(page, ["ArrowUp"], 800);
  const upper = await position(page);
  await hold(page, ["ArrowUp", "ArrowRight"], 300);
  const settled = await position(page);
  await hold(page, ["ArrowUp", "ArrowRight"], 300);
  const slide = await position(page);
  check(
    "blocked vertical movement slides along wall",
    settled.y >= 360 && settled.y < 370 && slide.y === settled.y && slide.x > settled.x + 30,
    { initial: upper, settled, after: slide },
  );
  await hold(page, ["ArrowLeft"], 2800);
  const left = await position(page);
  await hold(page, ["ArrowDown"], 1100);
  const bottom = await position(page);
  await hold(page, ["ArrowRight"], 4500);
  const right = await position(page);
  check(
    "map boundaries constrain feet",
    left.x >= 0 &&
      left.x < 13 &&
      bottom.y < 540 &&
      bottom.y > 527 &&
      right.x < 960 &&
      right.x > 947,
    { left, bottom, right },
  );
  await page.screenshot({ path: resolve(output, "collision-boundary-1440.png"), fullPage: true });
  await reviewDiagnostics(
    page,
    movement.diagnostics,
    "movement has no unexpected browser failures",
    1440,
  );
} catch (error) {
  check("movement suite completed", false, error.message);
} finally {
  await movement.context.close();
}

for (const viewport of viewports) {
  for (const endpoint of ["status", "verify", "worlds"]) {
    for (const mode of viewport.width === 390
      ? ["transport", "http", "invalid-json"]
      : ["transport"]) {
      const { context, page, diagnostics } = await newPage(
        viewport,
        `home-${endpoint}-${mode}-failure-${viewport.width}`,
      );
      const width = viewport.width;
      const suffix = mode === "transport" ? "" : ` (${mode})`;
      const stage = mode === "transport" ? `home-${endpoint}` : `home-${endpoint}-${mode}`;
      try {
        if (endpoint === "worlds")
          await context.request.post("/api/verify", { data: { fixture: true } });
        await injectFailure(page, diagnostics, `**/api/${endpoint}`, mode);
        await page.goto("/");
        if (endpoint === "verify")
          await page.getByRole("button", { name: "Verify demo session" }).click();
        if (endpoint === "worlds") {
          await page
            .getByRole("textbox", { name: "Your scene" })
            .fill("A rain-flooded night market where I carry a tiffin box someone will kill for");
          await page.getByRole("button", { name: "Create world", exact: true }).click();
        }
        await page.locator("main").getByRole("alert").waitFor();
        check(
          `home ${endpoint} failure is announced${suffix}`,
          await page.locator("main").getByRole("alert").isVisible(),
          null,
          width,
        );
        check(
          `home ${endpoint} failure has no uncaught exception${suffix}`,
          diagnostics.pageErrors.length === 0,
          diagnostics.pageErrors,
          width,
        );
        if (endpoint === "worlds") {
          check(
            `creation recovers after network failure${suffix}`,
            await page.getByRole("button", { name: "Create world", exact: true }).isEnabled(),
            null,
            width,
          );
          check(
            `creation failure preserves the prompt${suffix}`,
            (await page.getByRole("textbox", { name: "Your scene" }).inputValue()).startsWith(
              "A rain-flooded night market",
            ),
            null,
            width,
          );
        }
        await capture(page, `${stage}-failure`, width);
        if (endpoint === "status") {
          await page.getByRole("button", { name: "Retry creation status", exact: true }).click();
          await page.getByRole("button", { name: "Verify demo session" }).waitFor();
        } else if (endpoint === "verify") {
          await page.getByRole("button", { name: "Verify demo session" }).click();
          await page
            .getByRole("button", { name: "Verify demo session" })
            .waitFor({ state: "detached" });
        } else {
          await page.getByRole("button", { name: "Create world", exact: true }).click();
          await page.getByRole("link", { name: /Walk the world/ }).waitFor({ timeout: 30000 });
        }
        check(
          `home ${endpoint} retry completes${suffix}`,
          (await page.locator("main").getByRole("alert").count()) === 0,
          null,
          width,
        );
        await capture(page, `${stage}-recovered`, width);
        await reviewDiagnostics(
          page,
          diagnostics,
          `home ${endpoint} recovery has no unexpected browser failures${suffix}`,
          width,
        );
      } catch (error) {
        check(`home ${endpoint} failure suite completed${suffix}`, false, error.message, width);
      } finally {
        await context.close();
      }
    }
  }
}

for (const mode of ["transport", "malformed-sse", "error-sse"]) {
  const { context, page, diagnostics } = await newPage(
    { width: 390, height: 844 },
    `creation-progress-${mode}`,
  );
  try {
    await context.request.post("/api/verify", { data: { fixture: true } });
    await injectFailure(page, diagnostics, "**/api/worlds/*/events", mode);
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "Your scene" })
      .fill("A rain-flooded night market where I carry a tiffin box someone will kill for");
    await page.getByRole("button", { name: "Create world", exact: true }).click();
    await page.locator("main").getByRole("alert").waitFor();
    check(
      `creation ${mode} progress failure is announced`,
      await page.locator("main").getByRole("alert").isVisible(),
      null,
      390,
    );
    check(
      `creation ${mode} progress failure permits retry`,
      await page.getByRole("button", { name: "Create world", exact: true }).isEnabled(),
      null,
      390,
    );
    check(
      `creation ${mode} progress failure has no uncaught exception`,
      diagnostics.pageErrors.length === 0,
      diagnostics.pageErrors,
      390,
    );
    await capture(page, `creation-progress-${mode}-failure`, 390);
    await page.getByRole("button", { name: "Create world", exact: true }).click();
    await page.getByRole("link", { name: /Walk the world/ }).waitFor({ timeout: 30000 });
    check(
      `creation retries after ${mode} progress failure`,
      (await page.locator("main").getByRole("alert").count()) === 0,
      null,
      390,
    );
    await capture(page, `creation-progress-${mode}-recovered`, 390);
    await reviewDiagnostics(
      page,
      diagnostics,
      `creation ${mode} recovery has no unexpected browser failures`,
      390,
    );
  } catch (error) {
    check(`creation ${mode} progress suite completed`, false, error.message, 390);
  } finally {
    await context.close();
  }
}

const accusationErrors = await newPage({ width: 390, height: 844 }, "accusation-401-incorrect-403");
try {
  const { page } = accusationErrors;
  await collectClues(page);
  const picker = page.getByRole("combobox", { name: "Culprit" });
  await picker.selectOption("npc-rustom");
  await page.getByRole("button", { name: "Submit accusation" }).click();
  await page.getByText(/Your guess has not been submitted/).waitFor();
  check(
    "401 does not consume the accusation",
    await page.getByRole("button", { name: "Submit accusation" }).isEnabled(),
    null,
    390,
  );
  await capture(page, "verification-required", 390);
  for (const method of ["GET", "POST"]) {
    await page.route("**/api/verify", async (route) => {
      if (route.request().method() !== method) return route.continue();
      await route.fulfill({ json: method === "GET" ? { fixtures: false } : { verified: false } });
    });
    await page.getByRole("button", { name: "Verify to accuse", exact: true }).click();
    await page
      .getByText(
        method === "GET"
          ? "World ID configuration is unavailable. Please try again."
          : "Verification unavailable. Please try again.",
        { exact: true },
      )
      .waitFor();
    check(
      `accusation rejects malformed ${method} verification success`,
      (await picker.inputValue()) === "npc-rustom" &&
        (await page.getByText("Evidence collected: 3 / 3", { exact: true }).count()) === 1 &&
        (await page.getByRole("button", { name: "Verify to accuse", exact: true }).isEnabled()),
      null,
      390,
    );
    await page.unroute("**/api/verify");
  }
  await page.getByRole("button", { name: "Verify to accuse", exact: true }).click();
  await page
    .getByText(
      "Verification complete. Your suspect selection is saved; submit when you are ready.",
      { exact: true },
    )
    .waitFor();
  check(
    "guest verifies in place without losing clues or suspect",
    (await picker.inputValue()) === "npc-rustom" &&
      (await page.getByText("Evidence collected: 3 / 3", { exact: true }).count()) === 1,
    null,
    390,
  );
  await capture(page, "accusation-verified-in-place", 390);
  await page.getByRole("button", { name: "Submit accusation" }).click();
  await page.getByText(/That accusation was incorrect/).waitFor();
  check(
    "incorrect accusation locks and conceals secret",
    (await picker.isDisabled()) &&
      (await page.getByRole("heading", { name: "The truth behind the case" }).count()) === 0,
    null,
    390,
  );
  await capture(page, "incorrect", 390);
  await collectClues(page);
  await page.getByRole("combobox", { name: "Culprit" }).selectOption("npc-meera");
  await page.getByRole("button", { name: "Submit accusation" }).click();
  await page
    .getByText("You have already made your accusation in this case.", { exact: true })
    .waitFor();
  check(
    "403 locks repeated accusation without secret",
    (await page.getByRole("combobox", { name: "Culprit" }).isDisabled()) &&
      (await page.getByRole("heading", { name: "The truth behind the case" }).count()) === 0,
    null,
    390,
  );
  await capture(page, "repeat", 390);
} catch (error) {
  check("accusation error suite completed", false, error.message, 390);
} finally {
  await accusationErrors.context.close();
}

for (const viewport of viewports) {
  const { page, context } = await newPage(viewport, `gallery-${viewport.width}`);
  try {
    await page.goto("/gallery");
    await page.locator(".world-card").first().waitFor();
    await capture(page, "gallery", viewport.width);
    await page.route("**/api/gallery", (route) => route.fulfill({ json: [] }));
    await page.reload();
    await page.getByText("No live cases yet.").waitFor();
    await capture(page, "gallery-empty", viewport.width);
    await page.unroute("**/api/gallery");
    await page.route("**/api/gallery", (route) =>
      route.fulfill({ status: 503, json: { error: "Deliberate archive failure" } }),
    );
    await page.reload();
    await page.getByRole("button", { name: "Retry gallery" }).waitFor();
    await capture(page, "gallery-error", viewport.width);
    await page.unroute("**/api/gallery");
    await page.getByRole("button", { name: "Retry gallery" }).click();
    await page.locator(".world-card").first().waitFor();
    check("gallery recovers after retry", true, null, viewport.width);
    await page.goto("/");
    const ticker = page.getByText("Generation ticker", { exact: true });
    await ticker.click();
    check(
      "generation provenance panel collapses",
      !(await page.getByText("Model calls appear here as the world builds.").isVisible()),
      null,
      viewport.width,
    );
  } catch (error) {
    check("gallery suite completes", false, error.message, viewport.width);
  } finally {
    await context.close();
  }
}
await browser.close();
checkpoint();
await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.summary));
process.exitCode = report.summary.FAIL ? 1 : 0;
