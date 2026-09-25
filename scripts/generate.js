const fs = await import("node:fs/promises");
const cfgPath = "__CONFIG__"; // sh 渲染时被替换为真实配置路径
const cfg = JSON.parse(await fs.readFile(cfgPath, "utf8"));
const log = [];

// 1. 已在某个对话页（URL 含 /c/）就直接沿用该对话；否则回首页，由首次发送自动建对话
const onChat = /\/c\//.test(page.url());
if (!onChat) {
  await page.goto("https://chat.qwen.ai/", {waitUntil: "domcontentloaded", timeout: 60000});
  await page.waitForTimeout(3500);
}

const profile = await page.getByRole("button", {name: /User profile/}).count();
if (!profile) {
  return {error: "login-required", hint: "在 Tabbit 浏览器里登录千问账号后重跑"};
}

const items = () => page.locator('.qwen-chat-v2-dropdown-menu-popup [class*="item-content"]');
const labels = () => page.locator(".qwen-chat-v2-dropdown-menu-select-label");
const pick = async (index, value, tag) => {
  const ls = labels();
  if (await ls.count() <= index) { log.push(tag + "-dropdown-missing"); return; }
  await ls.nth(index).click();
  await page.waitForTimeout(700);
  const opt = items().filter({hasText: value}).first();
  if (await opt.count()) {
    await opt.click();
    await page.waitForTimeout(600);
  } else {
    await page.keyboard.press("Escape");
    log.push(tag + "-not-found:" + value);
  }
};

// 2. 生成图像模式没开才开（复用对话时通常已经开着）
const modeReady = (await labels().count()) >= 2;
if (!modeReady) {
  await page.getByRole("button", {name: "选择模式"}).first().click();
  await page.waitForTimeout(900);
  await page.getByRole("menuitem", {name: "生成图像"}).first().click();
  await page.waitForTimeout(1300);
}

// 3. 只在与期望值不一致时才改模型版本与画幅
const cur = await labels().evaluateAll(els => els.map(e => e.textContent.trim()));
if (cur[0] !== cfg.model) await pick(0, cfg.model, "model");
if (cfg.ratio && cfg.ratio !== "自动" && cur[1] !== cfg.ratio) await pick(1, cfg.ratio, "ratio");

const input = page.getByRole("textbox", {name: "询问 Qwen"});
await input.click();
await input.fill(cfg.prompt);
await page.waitForTimeout(400);

// 提交前采样报错横幅基线并写回配置，供 wait_download 使用。
// 修复窗口期 bug：横幅若在"Enter 之后、wait 基线采样之前"出现，会被误当历史残留漏判成 timeout。
// 正则必须与 wait_download.js 的 errCount() 保持一致。
const errCount = () => page.evaluate(() => {
  const m = (document.body.innerText || "").match(
    /There was an issue connecting|目前服务访问量较大|服务暂时不可用|请求失败|生成失败/g);
  return m ? m.length : 0;
});
const preErr = await errCount();
await fs.writeFile(cfgPath, JSON.stringify({...cfg, errBase: preErr}));

await input.press("Enter");
await page.waitForTimeout(2500);

// 服务端秒拒（横幅立刻弹出）时快速失败，不用进 wait 轮询干等
if ((await errCount()) > preErr) {
  return {error: "provider-error", hint: "千问服务端拒绝（红色横幅），脚本将自动重提交一次", preErr};
}

const now = await labels().evaluateAll(els => els.map(e => e.textContent.trim()));
return {
  ok: true,
  reusedConversation: onChat,
  log,
  model: now[0] || cfg.model,
  ratio: now[1] || cfg.ratio,
  url: page.url(),
};
