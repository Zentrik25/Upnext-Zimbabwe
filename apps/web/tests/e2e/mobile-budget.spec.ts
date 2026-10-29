import { expect, test } from "@playwright/test";

/**
 * Mobile performance budgets (P5-08), measured in Chromium on a throttled profile: slow 4G (1.6 Mbit/s down,
 * 150 ms round trip) and a 4x slower CPU, at 390 px. Run against a PRODUCTION build only (the development
 * server is much heavier). A budget is a regression guard for this machine, not a promise about a real phone:
 * real-device testing is still required (launch blocker B-10).
 */
test.skip(process.env.E2E_PERF !== "1", "needs a production build (E2E_PERF=1)");
test.use({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const BUDGETS = { lcpMs: 2500, cls: 0.1, transferKiB: 250, scriptKiB: 150 };
const PAGES = ["/", "/opportunities", "/sign-in"];
// The home page carries the owner-supplied illustration (22 KB) and the bold headline font (8 KB) of D-47, and the
// sign-in page the form-size illustration (12 KB), so these two have their own transfer allowance (the CI runner
// measures about 4% above a local machine). Every other page keeps 250 KiB; script and LCP budgets are unchanged.
const TRANSFER_KIB: Record<string, number> = { "/": 300, "/sign-in": 270 };

for (const path of [...PAGES, "DETAIL"]) {
  test(`budget on ${path}`, async ({ page, request }, info) => {
    let target = path;
    if (path === "DETAIL") {
      const list = await request.get("/api/v1/opportunities?limit=1");
      target = `/opportunities/${(await list.json()).data[0].slug}`;
    }
    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      (window as unknown as { __lcp: number; __cls: number }).__lcp = 0;
      (window as unknown as { __lcp: number; __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) (window as unknown as { __lcp: number }).__lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(target, { waitUntil: "networkidle" });
    const metrics = await page.evaluate(() => {
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return {
        lcp: (window as unknown as { __lcp: number }).__lcp,
        cls: (window as unknown as { __cls: number }).__cls,
        transfer: nav.transferSize + resources.reduce((a, r) => a + r.transferSize, 0),
        script: resources
          .filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"))
          .reduce((a, r) => a + r.transferSize, 0),
      };
    });
    const transferred = metrics.transfer / 1024;
    const scripts = metrics.script / 1024;
    info.annotations.push({
      type: "metrics",
      description: `${target}: LCP ${Math.round(metrics.lcp)} ms, CLS ${metrics.cls.toFixed(3)}, transfer ${transferred.toFixed(0)} KiB, script ${scripts.toFixed(0)} KiB`,
    });
    console.log(
      `[budget] ${target}: LCP ${Math.round(metrics.lcp)} ms, CLS ${metrics.cls.toFixed(3)}, transfer ${transferred.toFixed(0)} KiB, script ${scripts.toFixed(0)} KiB`,
    );
    expect(metrics.lcp, "LCP").toBeLessThanOrEqual(BUDGETS.lcpMs);
    expect(metrics.cls, "CLS").toBeLessThanOrEqual(BUDGETS.cls);
    expect(transferred, "transfer KiB").toBeLessThanOrEqual(TRANSFER_KIB[path] ?? BUDGETS.transferKiB);
    expect(scripts, "script KiB").toBeLessThanOrEqual(BUDGETS.scriptKiB);
  });
}
