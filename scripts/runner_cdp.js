#!/usr/bin/env node
"use strict";
// runner_cdp.js —— CDP 后端运行器：把页面操作片段跑在「用户自己开着的浏览器」上。
//
// 用法: node scripts/runner_cdp.js <fragment.js> <cfg.json> [port]
//
// 片段契约与 Tabbit 后端完全一致：内容被包进 async 函数体执行（可顶层 await / return），
// 并能拿到注入的 page。因此 scripts/generate.js 与 scripts/wait_download.js 原样复用。
//
// 登录态从哪来：不是这里"生成"的，是用户浏览器里本来就有的——attach 而不是新开浏览器。

const fs = require("fs");

// 本运行器只跟「本机调试端口 + 国内 CDN」对话，但环境里的 http_proxy/https_proxy
// 会把 127.0.0.1 也一起劫持（2026-09-26 实测：connectOverCDP 返回 502 Unexpected status）。
// 所以默认摘掉代理环境变量；浏览器自身的代理设置不受影响。
// 需要代理才能访问 CDN 的网络环境，设 QWEN_IMAGEGEN_CDP_KEEP_PROXY=1 保留原样。
if (process.env.QWEN_IMAGEGEN_CDP_KEEP_PROXY !== "1") {
  for (const k of ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]) {
    delete process.env[k];
  }
  process.env.NO_PROXY = process.env.no_proxy = "127.0.0.1,localhost";
}

const out = (obj) =>
  new Promise((res) => {
    process.stdout.write((typeof obj === "string" ? obj : JSON.stringify(obj)) + "\n", res);
  });

(async () => {
  const [fragPath, cfgPath, portArg] = process.argv.slice(2);
  const port = portArg || process.env.QWEN_IMAGEGEN_CDP_PORT || "9222";

  if (!fragPath || !cfgPath) {
    await out({ error: "cdp-bad-args", hint: "用法: node runner_cdp.js <fragment.js> <cfg.json> [port]" });
    process.exit(1);
  }

  let chromium;
  try {
    ({ chromium } = require("playwright-core"));
  } catch (e) {
    await out({
      error: "cdp-need-playwright-core",
      hint: "CDP 后端需要依赖：在技能目录执行 npm install playwright-core（只需一次）",
    });
    process.exit(1);
  }

  // 1) 接管用户已经开着的浏览器（绝不自己 new browser）
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 8000 });
  } catch (e) {
    await out({
      error: "cdp-port-closed",
      detail: String((e && e.message) || e).slice(0, 200),
      hint:
        `浏览器没开调试端口（127.0.0.1:${port}）。用 --remote-debugging-port=${port} 启动浏览器；` +
        "必须复用原来的用户配置目录，登录态才不会丢。",
    });
    process.exit(3);
  }

  const contexts = browser.contexts();
  const ctx = contexts[0] || (await browser.newContext());

  // 2) 选页优先级：generate.js 写回的 convUrl（本次对话）→ 千问页面 → 最后打开的页 → 新建
  let preferUrl = "";
  try {
    preferUrl = JSON.parse(fs.readFileSync(cfgPath, "utf8")).convUrl || "";
  } catch (e) {
    /* 配置读不到就退化为按域名选页 */
  }
  const pages = ctx.pages();
  // 排除浏览器内部页（edge://、chrome://、devtools://、扩展页）——
  // 2026-09-26 踩坑：pages[last] 抓到 edge://sync-confirmation/，导航必失败。
  const internal = (u) => /^(edge|chrome|devtools|extension|chrome-extension|brave|opera):/i.test(u);
  const usable = pages.filter((p) => !internal(p.url()));
  let page =
    (preferUrl && pages.find((p) => p.url() === preferUrl || p.url().startsWith(preferUrl))) ||
    [...usable].reverse().find((p) => /chat\.qwen\.ai/.test(p.url())) ||
    usable[usable.length - 1];
  if (!page) page = await ctx.newPage();

  // 关键：必须把页面提到前台。Chromium 会节流后台标签（定时器降频、渲染暂停），
  // 而千问的生成进度靠前端轮询 + 渲染 —— 后台标签下会表现为"永远等不到图"。
  // 2026-09-26 实测：不 bringToFront 时两次都等到 timeout（合计约 7 分钟无产出）。
  try {
    await page.bringToFront();
  } catch (e) {
    /* 某些环境下无窗口可激活，忽略 */
  }

  // 3) 跑片段。用 AsyncFunction 复刻 Tabbit 的注入契约：
  //    Tabbit 会同时注入 page 和 context（wait_download.js 用 context.request 下载原图），
  //    2026-09-26 实测：只注入 page 会报 "context is not defined"。
  const src = fs.readFileSync(fragPath, "utf8");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let result;
  try {
    const fn = new AsyncFunction("page", "context", "require", src);
    result = await fn(page, page.context(), require);
  } catch (e) {
    await out({
      error: "cdp-fragment-error",
      detail: String((e && e.message) || e).slice(0, 300),
      url: page.url(),
    });
    process.exit(1);
  }

  await out(result);
  // 4) 关键：绝不 browser.close() —— 那是用户的浏览器。直接退出进程断开连接即可。
  process.exit(0);
})().catch(async (e) => {
  await out({ error: "cdp-runner-crash", detail: String((e && e.message) || e).slice(0, 300) });
  process.exit(1);
});
