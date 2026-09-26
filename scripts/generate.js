const fs = await import("node:fs/promises");
const cfgPath = "__CONFIG__"; // sh 渲染时被替换为真实配置路径
const cfg = JSON.parse(await fs.readFile(cfgPath, "utf8"));
const log = [];

// 1. 已在某个对话页（URL 含 /c/）就直接沿用该对话；否则回首页，由首次发送自动建对话
const onChat = /\/c\//.test(page.url());
if (!onChat) {
  await page.goto("https://chat.qwen.ai/", {waitUntil: "domcontentloaded", timeout: 60000});
}

// 登录态判定：必须轮询，不能定长等待。
// 2026-09-26 实测：复用标签页停在首页（非 /c/）时会触发整页重载，千问 SPA 水合 +
// 拉取用户信息要 7–10s；原来固定等 3.5s 就检查，把"已登录"误判成 login-required
// （脚本 4.5s 就返回、页面其实已有 user-menu-btn "kasumi"）。
// 复用对话时页面本就水合，第一轮即命中，不会拖慢正常路径。
const userMenuBtn = () => page.locator('[class*="user-menu-btn"], [class*="user-menu"]');
let profile = 0;
for (let i = 0; i < 20; i++) {
  profile =
    (await page.getByRole("button", {name: /User profile/}).count()) ||
    (await userMenuBtn().count());
  if (profile) break;
  await page.waitForTimeout(1000);
}
if (!profile) {
  return {
    error: "login-required",
    hint: "在浏览器里登录千问账号后重跑（Tabbit 或你自己的 Chrome/Edge 都行）",
    waitedMs: 20000,
  };
}

// 1b. 登录态出现 ≠ 页面就绪。
// 2026-09-26 实测事故：复用对话时历史图是异步渲染的，旧版直接在下游 wait_download
// 里采样基线，采到的是"还没有图"的空集 → 旧图稍后渲染出来就被判成本次新生成，
// 于是把会话里上一张「樱花和服少女」当成本次结果下载了（尺寸 3:4 也对不上请求的 16:9）。
// 判据改成：连续两轮扫描图片集合不再变化，才算渲染稳定，此时采样基线才可信。
const imgSrcs = () =>
  page
    .locator("main img.ant-image-img")
    .evaluateAll((els) =>
      els
        .map((el) => el.currentSrc || el.src)
        .filter((s) => s && s.includes("cdn.qwenlm.ai"))
    );
let prevImgs = null;
for (let i = 0; i < 15; i++) {
  const cur = await imgSrcs();
  if (
    prevImgs &&
    cur.length === prevImgs.length &&
    cur.every((s, k) => s === prevImgs[k])
  ) {
    break;
  }
  prevImgs = cur;
  await page.waitForTimeout(1000);
}
const baseline = prevImgs || [];

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

// 3. 模型版本与画幅：选了必须复查。
// 2026-09-26 事故复盘：旧版只读一次 labels 就决定要不要 pick，而且 pick 完不复查。
// 但 goto 整页重载时，SPA 会先把"上一个对话的残留标签值"渲染出来（例如旧值 16:9），
// 随后初始化再把它重置（例如回落到 自动），造成两个后果：
//   ① cur[1] 已是残留的 16:9 → pick 被跳过 → 实出 3:4（请求 16:9）且 log 为空，静默出错；
//   ② 提交撞上"半初始化"，消息被服务端丢弃，对话只剩一个空的 New chat。
// 因此改为：读 → 不符则选 → 再读 → 不符再选（最多 3 轮）→ 仍不符显式失败。
const readLabels = () =>
  labels().evaluateAll((els) => els.map((e) => e.textContent.trim()));
const ratioWanted = !!(cfg.ratio && cfg.ratio !== "自动");
for (let attempt = 0; attempt < 3; attempt++) {
  const cur = await readLabels();
  const needModel = cur[0] !== cfg.model;
  const needRatio = ratioWanted && cur[1] !== cfg.ratio;
  if (!needModel && !needRatio) break;
  if (needModel) await pick(0, cfg.model, "model");
  if (needRatio) await pick(1, cfg.ratio, "ratio");
  await page.waitForTimeout(1000);
}
const settled = await readLabels();
if (settled[0] !== cfg.model || (ratioWanted && settled[1] !== cfg.ratio)) {
  return {
    error: "control-not-applied",
    hint: "模型或画幅选择被页面初始化重置、未能生效；重跑一次即可（不会产出尺寸错误的图）",
    want: [cfg.model, cfg.ratio],
    got: [settled[0], settled[1]],
    url: page.url(),
    log,
  };
}

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
// baseline 一并写回：下游 wait_download 用"提交前已存在"的图集合做真基线，
// 不再自己晚采样（晚采样正是 09-26 事故的成因）
await fs.writeFile(
  cfgPath,
  JSON.stringify({...cfg, errBase: preErr, baseline})
);

await input.press("Enter");
await page.waitForTimeout(2500);

// 服务端秒拒（横幅立刻弹出）时快速失败，不用进 wait 轮询干等
if ((await errCount()) > preErr) {
  return {error: "provider-error", hint: "千问服务端拒绝（红色横幅），脚本将自动重提交一次", preErr};
}

// 提交校验：Enter 可能因焦点丢失或页面水合中重渲染而没发出去。
// 此时页面里不会有我们的提示词 → 必须显式报错。
// 旧版没有这道校验，导致"没提交成功"被静默吞掉，下游转而把会话里的旧图当本次结果下载（09-26 事故）。
const probe = cfg.prompt.slice(0, 8);
const hasPrompt = () =>
  page.evaluate((t) => (document.body.innerText || "").includes(t), probe);
let submitted = await hasPrompt();
if (!submitted) {
  // 自愈第一手：用"输入框是否还留着提示词"判别真假——
  // 发送成功时千问会清空输入框；若文本还在，说明 Enter 没生效，原地再按一次即可。
  const stillThere = await input
    .inputValue()
    .then((v) => (v || "").trim().length > 0)
    .catch(() => false);
  if (stillThere) {
    await input.press("Enter");
  }
  await page.waitForTimeout(2500);
  submitted = await hasPrompt();
}
if (!submitted) {
  return {
    error: "submit-failed",
    hint: "提示词未进入对话框（焦点丢失或页面仍在加载），重跑一次即可",
    probe,
    url: page.url(),
    log,
  };
}

// 4. 把"提交后的对话 URL"写回配置，供下游 wait_download 精确定位。
// 2026-09-26 事故：generate 在 A 对话提交，wait_download 却钻进另一个标签页停在 B 对话，
// 结果要么把 B 里的旧图当成结果下载，要么永远等不到新图。
// 新对话 URL 由 SPA 在提交后才写入，这里等它稳定再取。
let convUrl = page.url();
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(700);
  const u = page.url();
  if (u === convUrl && /\/c\//.test(u)) break;
  convUrl = u;
}
await fs.writeFile(
  cfgPath,
  JSON.stringify({...cfg, errBase: preErr, baseline, convUrl})
);

const now = await readLabels();
return {
  ok: true,
  reusedConversation: onChat,
  log,
  model: now[0] || cfg.model,
  ratio: now[1] || cfg.ratio,
  url: convUrl,
};
