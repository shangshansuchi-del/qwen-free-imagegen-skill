const fs = await import("node:fs/promises");
const cfg = JSON.parse(await fs.readFile("__CONFIG__", "utf8"));

const scan = () => page.locator("main img.ant-image-img").evaluateAll(els =>
  els.map(el => ({src: el.currentSrc || el.src, w: el.naturalWidth, h: el.naturalHeight}))
     .filter(x => x.src && x.src.includes("cdn.qwenlm.ai") && x.w > 200));

// 复用对话时里面已有历史图片，必须先记住基线，只等"新增的那张"，否则会下载到旧图
const baseline = new Set((await scan()).map(x => x.src));
// 修复：基线为空时（对话旧图尚未渲染进 DOM / 页面刚复用），等一轮让旧图渲染，再补一次基线。
// 否则旧图在本轮轮询时刚出现会被误判为"本次新生成"，导致下载到上一张图。
if (baseline.size === 0) {
  await page.waitForTimeout(11000);
  (await scan()).forEach(x => baseline.add(x.src));
}

// 千问服务端报错（"访问量较大"等）也要记基线：复用对话里可能残留历史报错气泡，
// 只有"报错数量比开局多"才算本次真的失败，避免误判
const errCount = () => page.evaluate(() => {
  const m = (document.body.innerText || "").match(
    /There was an issue connecting|目前服务访问量较大|服务暂时不可用|请求失败|生成失败/g);
  return m ? m.length : 0;
});
// 基线优先用 generate.js 提交前写回的 errBase（修复窗口期漏判）；缺省时才现场采样
const errBase = Number.isFinite(cfg.errBase) ? cfg.errBase : await errCount();

let target = null;
for (let i = 0; i < 10; i++) { // 10×11s=110s + 基线补采 11s，须小于 sh 传入的 CLI 超时（140000ms）
  await page.waitForTimeout(11000);
  const n = await errCount();
  if (n > errBase) {
    return {error: "provider-error", hint: "千问服务端瞬时故障，稍后重跑即可；本次未产生图片"};
  }
  const fresh = (await scan()).filter(x => !baseline.has(x.src));
  if (fresh.length) { target = fresh[fresh.length - 1]; break; }
}

if (!target) {
  return {error: "timeout", hint: "重跑 bash scripts/qwen_image.sh --fetch <输出路径> 继续等待"};
}

// 关键修复：页面 <img> 的 src 带阿里云 OSS 缩图参数（&x-oss-process=image/resize,m_mfit,w_450,h_450），
// 直接下载只会拿到 450px 缩略图（且常带水印）。剥掉该参数即得 Qwen 原生全尺寸原图
// （实测 2752×1536、无水印）——这正是网页"下载"按钮走的地址。
const fullSrc = target.src.replace(/&x-oss-process=image\/resize.*$/, "");
const resp = await context.request.get(fullSrc, {timeout: 45000});
if (!resp.ok()) return {error: "download-failed", status: resp.status()};

const body = await resp.body();
await fs.writeFile(cfg.out, body);

// 从 PNG 头读真实尺寸（原图不再固定 450px），如实回报 width/height
const realDims = (body.length >= 24 && body.slice(0, 8).toString("hex") === "89504e470d0a1a0a")
  ? {w: body.readUInt32BE(16), h: body.readUInt32BE(20)} : {w: target.w, h: target.h};

const now = await page.locator(".qwen-chat-v2-dropdown-menu-select-label")
  .evaluateAll(els => els.map(e => e.textContent.trim()));

return {
  path: cfg.out,
  bytes: body.length,
  width: realDims.w,
  height: realDims.h,
  model: now[0] || cfg.model,
  ratio: now[1] || cfg.ratio,
  baselineSkipped: baseline.size,
};
