# Qwen Studio（千问）页面定位速查

仅在 `scripts/qwen_image.sh` 报 `model-not-found`、`version-dropdown-missing` 或页面改版时阅读。

## 当前有效的定位方式（2026-09 实测）

| 目标 | 定位方式 |
| --- | --- |
| 首页 | `page.goto("https://chat.qwen.ai/")` |
| 登录态判断 | `getByRole("button", {name: /User profile/})` 存在即已登录 |
| 新建对话 | `getByRole("button", {name: "新建对话"})` |
| 模式菜单入口 | `getByRole("button", {name: "选择模式"})`（输入框左侧的加号） |
| 生成图像模式 | `getByRole("menuitem", {name: "生成图像"})` |
| 版本与画幅下拉 | `.qwen-chat-v2-dropdown-menu-select-label`，第 0 个是模型版本，第 1 个是画幅 |
| 下拉选项 | `.qwen-chat-v2-dropdown-menu-popup [class*="item-content"]` |
| 提示词输入框 | `getByRole("textbox", {name: "询问 Qwen"})` |
| 生成的图片 | `main img.ant-image-img`，`src` 含 `cdn.qwenlm.ai` 且 `naturalWidth > 200` |

## 已知坑

- **默认版本是 2.0，不是最新。** 下拉里同时存在 3.0 与 2.0，必须显式点选 3.0。
- **画幅选项**：`自动`、`1:1`、`3:4`、`4:3`、`16:9`、`9:16`。
- **`aria-ref` 每次渲染都会变**，不能跨提交缓存；用语义定位或上面的稳定 class。
- **`locator.normalize()` 返回值不是 Locator**，不要对它调 `.click()`。
- **图片有淡入动画**，刚出现时截图可能拿到渐变占位图；判定以 `naturalWidth` 为准，不要靠截图。
- **复用对话后必须做基线对比**（`wait_download.js` 的核心逻辑）：对话里已有历史图片，轮询时若不先记录基线 src 集合、只判"有图就下载"，会立刻把上一张旧图当新图下载（表现为：秒回、字节数与上一张完全相同、尺寸不符）。正确做法是"等一张不在基线里的新 src"。
- **判断是否在对话页看 URL**：含 `/c/` 即对话页，直接沿用；否则回首页，首次发送会自动建对话。
- **单次提交最长 180 秒**，轮询等待要留余量（脚本用 11 次 × 11 秒）。
- **不要缓存跨会话的标签页**：任务 `finish` 后标签组才保留为可恢复状态。
- **标签复用（当前脚本的默认行为）**：`tabs --task qwen-imagegen` 返回的每个 tab 带 `group` 对象，字段名是 **`groupId`**（不是 `id`），组标题为 `qwen-imagegen`；拿到它后用 `resume --task qwen-imagegen --group <groupId>` 挂上旧标签，再提交 JS 即在同一标签内工作。解析错字段名会导致复用静默失效、每次都新开标签。

## 改版时的兜底策略

1. 先 `page.ariaSnapshot({mode: "ai", depth: 12})` 看当前无障碍树，按语义重新定位。
2. 用 `page.evaluate()` 全文搜索关键文本（如 `/Qwen-Image/i`）反查承载元素的 class。
3. 找到新的稳定 class 后，更新 `scripts/generate.js` 里的 `labels()` 与 `items()` 两个函数即可，其余逻辑不变。
