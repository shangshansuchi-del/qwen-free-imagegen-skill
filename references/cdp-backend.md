# CDP 后端：接管你自己的 Chrome / Edge

> 只在**没有 Tabbit**（或你就想用自己的浏览器）时才需要读这份。日常用 Tabbit 的话，本文件可以完全忽略。

## 两步配置（一次性）

1. **给浏览器开调试端口**（必须先完全退出浏览器，调试端口无法对已运行的实例事后补开）：
   - Windows · Edge：`Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--remote-debugging-port=9222"`
   - Windows · Chrome：同上，换成 chrome.exe 路径
   - macOS：`/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222`
   - 验证：浏览器里打开 `http://127.0.0.1:9222/json/version`，能看到 JSON 即成功
2. **装依赖**（只 CDP 需要）：在技能目录执行 `npm install playwright-core`（约 14 MB，纯库，不含浏览器）

登录态来自**你自己的浏览器**：脚本只 attach，不登录、不关窗口。端口只开在本机，用完关掉窗口即关门。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `QWEN_IMAGEGEN_BACKEND=cdp` | 强制走 CDP（不设则自动探测：有 Tabbit 优先 Tabbit，其次 CDP 端口） |
| `QWEN_IMAGEGEN_CDP_PORT` | 调试端口，默认 9222 |
| `QWEN_IMAGEGEN_CDP_KEEP_PROXY=1` | 保留系统代理（默认会摘掉，否则本机 127.0.0.1 也会被代理劫持，实测 502） |

## 实现要点（改 `scripts/runner_cdp.js` 前必读）

- **attach 而非启动**：`chromium.connectOverCDP('http://127.0.0.1:<port>')`。绝不 `browser.close()`——那是用户的浏览器，直接退出进程断连即可。
- **注入契约与 Tabbit 一致**：`new AsyncFunction("page", "context", "require", src)`，片段照旧可顶层 `await` / `return`。
  - ⚠️ **`context` 必须注入**：`wait_download.js` 用 `context.request.get()` 下载原图，只注入 `page` 会报 `context is not defined`（2026-09-26 踩过）。
- **必须 `page.bringToFront()`**：Chromium 会节流后台标签（定时器降频、渲染暂停），而千问生成进度靠前端轮询 + 渲染 → 不提前台的表现是"永远等不到图"（实测两次 timeout 合计约 7 分钟零产出）。
- **选页优先级**：`cfg.convUrl`（本次对话）→ 千问页 → 最后一个可用页；`edge://` / `chrome://` / 扩展页一律跳过（抓错内部页会导航失败）。
- **摘代理**：运行器启动时删掉 `http_proxy` 等环境变量并设 `NO_PROXY=127.0.0.1,localhost`。

## ⚠️ 已知风险：可能触发人机验证

Qwen Studio 识别到自动化操作时可能弹**安全验证**（用户实测，CDP 路线触发过）。表现为图一直不出来。
命中时脚本返回 `{"error":"verification-required"}` —— **人工在弹出的页面里过一次验证**，然后重跑即可。

**Tabbit 专用通道没有这个风险**（它本来就是给 Agent 用的浏览器）。

## 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| `cdp-port-closed` | 浏览器没带 `--remote-debugging-port` 启动，或端口号不对 |
| `cdp-need-playwright-core` | 没装依赖 → `npm install playwright-core` |
| `cdp-fragment-error`（`context is not defined`） | 运行器漏注入 `context` |
| 图永远不来 + `verification-required` | 过一下人机验证再重跑 |
| 图永远不来 + `timeout` | 可能页面在后台被节流 → 确认运行器有 `bringToFront()` |
