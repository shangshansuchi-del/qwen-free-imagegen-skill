---
name: qwen-imagegen
description: 用 Tabbit 浏览器在 Qwen Studio（千问，chat.qwen.ai）生成图片并保存为本地 PNG。当用户要求"用千问 / Qwen / 通义生成图片"、"生成一张 XX 风格的图"、"Qwen-Image 生图"，或需要指定画幅（1:1 / 3:4 / 4:3 / 16:9 / 9:16）时使用本技能。
agent_created: true
---

# Qwen Studio 生图

把提示词送进Qwen Studio 的图像生成模式，取回 PNG 到本地。所有浏览器动作已封装在 `scripts/`，不要在对话里手写浏览器脚本。

## 执行

Windows 用 Git Bash 解释器（系统 `bash` 可能指向 WSL 并被拦截），且**必须用绝对路径**——当前目录通常不在 skill 目录里：

```bash
/usr/bin/bash.exe "$HOME/.workbuddy/skills/qwen-imagegen/scripts/qwen_image.sh" "<提示词>" [画幅] [输出路径]
```

**首次使用：先体检，别等报错**（不开浏览器、不耗额度、秒级返回）：

```bash
/usr/bin/bash.exe "$HOME/.workbuddy/skills/qwen-imagegen/scripts/qwen_image.sh" --doctor
```

按结果行动，**一次问清楚**——报错一次就白烧一轮 token：

| 返回 | 怎么办 |
| --- | --- |
| `"recommended_backend":"tabbit"` | 直接正常生图，无需任何配置 |
| `"recommended_backend":"cdp"` + `"playwright_core":1` | 浏览器调试端口已开，可直接用 CDP 后端 |
| `"recommended_backend":"cdp"` + `"playwright_core":0` | 缺依赖：在技能目录跑一次 `npm install playwright-core` |
| `"recommended_backend":"none"` | 两个后端都不可用 → 让用户装 Tabbit，或给 Chrome/Edge 加 `--remote-debugging-port=9222` 并**用原用户配置**重启一次（登录态不会丢） |

## 后端：Tabbit / CDP（两条路，同一套页面逻辑）

`QWEN_IMAGEGEN_BACKEND` 可强制 `tabbit` 或 `cdp`；不设则自动探测（Tabbit 优先，其次 CDP 端口）。

- **Tabbit 后端**：走 `tabbit-cli`，自带标签组复用与托盘态预检。
- **CDP 后端**：`scripts/runner_cdp.js` 用 Playwright `connectOverCDP` **attach 用户自己开着的浏览器**——
  登录态来自用户浏览器本身，脚本既不登录也不关它（`finish_task` 在 CDP 下是 no-op）。
  选页优先级：`cfg.convUrl`（本次对话）→ 千问页 → 最后一个可用页；`edge://`/`chrome://` 等内部页一律跳过。
  依赖：`npm install playwright-core`（一次即可，`node_modules/` 已 gitignore）。
  运行器会**摘掉 `http_proxy` 等环境变量**，否则本机 127.0.0.1 也会被代理劫持（实测 502）；
  需要代理才能访问 CDN 的网络环境设 `QWEN_IMAGEGEN_CDP_KEEP_PROXY=1`。
- 端口默认 9222，可用 `QWEN_IMAGEGEN_CDP_PORT` 改。

**Tabbit 浏览器没打开时**：脚本开头做预检，浏览器没起来报 `{"error":"tabbit-not-running"}` 并 exit 3，一个页面都不开。只有 `tabbit-cli-not-found` 才是浏览器没安装。

**但"只读探活"覆盖不了托盘态**（2026-09-25 实测）：Tabbit 进程活着、窗口全关收进托盘时，`tabs` 探活返回的是合法空列表（`{"tabs":[],"total":0}`、rc=0）会**放行**，而真正建页时在 4–5 毫秒内失败（`Target.createTarget: Task-scoped CDP command could not be dispatched`，`diagnose` 也照样报 `ok:true`）。现在预检是**功能性探针**：用一次性任务 `tabbit-preflight` 真建一个空白页试探 → 失败就 `Start-Process` 唤起窗口、每 3 秒重试（最多 24 秒）→ 成功后立刻最小化并打印 `{"tabbit-window-restored":"minimized"}` → 仍不行报 `{"error":"tabbit-no-window"}` exit 3（未开页面、不消耗额度）。
注意 `focusedWindowId` 在**最小化**时同样是 `null`，不能拿来判断可用性；**最小化状态可以正常出图**，别为"看得见"取消它。

**调用铁律**：跑本脚本（含 `--fetch`）必须**显式给 Bash 工具超时 ≥ 600000ms**。工具默认 120s 会在脚本内部等待完成前把整个进程 SIGTERM 杀掉 → 空输出，脚本连结构化错误都来不及打印。

- 提示词：必填，中英文皆可，含主体、造型、场景、光线、风格画质五要素，配方见 `references/prompt-recipes.md`
- 画幅：可选，默认 `3:4`；可选 `自动` `1:1` `3:4` `4:3` `16:9` `9:16`（人物用 3:4 或 9:16，风景用 16:9）
- 输出路径：可选，优先级为 **命令行第三参数 > 环境变量 `QWEN_IMAGEGEN_OUT_DIR` > 默认 `~/Pictures/qwen-imagegen/qwen-<时间戳>.png`**（用户「图片」文件夹，跨平台通用、零配置）。目录建不了会报 `output-dir-unwritable`

成功打印一行 JSON：`{"path":"...","bytes":5904848,"width":1792,"height":2400,"model":"Qwen-Image 3.0","ratio":"3:4"}`——**下载的是去掉 OSS 缩图参数的全尺寸原图**（无水印；3:4≈1792×2400、16:9≈2752×1536），width/height 是从 PNG 头读出的真实尺寸，不是页面缩略图的 450px。超时后只补跑下载：`/usr/bin/bash.exe scripts/qwen_image.sh --fetch <输出路径>`（同样显式给足超时）。

## 出错决策卡（任何 agent 照此执行，不要自由发挥）

1. **空输出 / SIGTERM** = 失败 → 立即用完整命令重跑（显式给足超时）。空输出不是"还在跑"。
2. **`provider-error` / 红色横幅**（"服务访问量较大 / There was an issue connecting"）= 生成已被服务端拒绝 → 脚本会**自动重提交一次**（间隔 20s；`QWEN_IMAGEGEN_NO_RETRY=1` 可关闭）；若自动重试仍失败，等几分钟再手动完整重跑。**禁止用 `--fetch` 去等**——它只能等"还活着的生成"，等不了已死的。
3. **`timeout`（无横幅）** = 生成大概率还在跑 → 这是唯一允许 `--fetch` 续等一次的场景；`--fetch` 也返回空 → 回到第 1 条完整重跑。
4. **永不放宽超时去"等"服务端错误**。等待救不了已死的生成，只会把模型钉在原地。

会话策略（标签组 + 对话都延续）：默认**复用上次留下的 qwen-imagegen 标签组**，并在**同一个对话里继续生图**——恒定只留一个组、一个对话，图片累积在里面，侧边栏不会一图一个对话。首次运行会自动新建两者；手动关掉标签组也没关系，下次自动重开。想"用完即关"时加 `QWEN_IMAGEGEN_DISCARD=1`。

关于上下文污染（2026-09-19 实测）：Qwen-Image 在「生成图像」模式下**每条提示词独立出图**，上一张图不会成为下一张的条件。实测在同一对话里，前一张是高饱和蓝色水下少女，紧接发"极简黑白建筑"，出图平均饱和度 0.9%、RGB (179,179,180) 纯灰，无残留。所以放心延续对话。

用 present_files 展示 PNG，并在回复里写明提示词、模型版本、画幅。一次只提交一个提示词，改风格时一次只改一个变量。

## 写提示词（每次生图前必做）

用户只给一句话（例如"来张猫""做个海报"）时，**先按模板补全再提交**，不要原样发送：

- **视觉类**（人像 / 动物 / 风景 / 产品）：主体+外貌 → 景别 → 视角或镜头 → 光线 → **一个**风格标签 → 质感；目标 120–400 字
- **信息类**（海报 / 信息图 / 分镜 / UI / 课件）：按「成品 → 画布比例 → 信息层级 → **引号写死的文案+语言** → 视觉系统 → 约束」写成简报；3.0 的文字渲染是强项，别浪费
- 网页端**没有提示词扩写、也没有反向提示词输入框** → 想避免的东西写成**正向约束句**（"背景是干净白墙"，而非"不要杂物"）
- 关键要点控制在 3–5 个；风格标签只留一个；不要堆"8K / 杰作 / 大师作品"这类空洞词

完整模板、六条反例、8 类配方与提交前自检见 `references/prompt-recipes.md`。

## 模型版本

固定选 **Qwen-Image 3.0**（第三代）。**绝不用界面默认的 2.0**，除非用户明确要求旧版——降级改 `scripts/qwen_image.sh` 的 `MODEL_DEFAULT`。下拉里找不到 3.0 即页面改版，按 `references/ui-selectors.md` 重新定位。

## 故障

| 现象                                             | 处理                                  |
| ---------------------------------------------- | ----------------------------------- |
| `login-required`                               | 请用户在 Tabbit 浏览器登录千问后重跑              |
| `model-not-found` / `version-dropdown-missing` | 页面改版，读 `references/ui-selectors.md` |
| `timeout`                                      | **无横幅时**生成多半还在跑 → `--fetch <输出路径>` 续等**一次**；`--fetch` 也空 → 完整重跑 |
| `provider-error`                               | 千问红色横幅（服务端拒绝），脚本已自动重提交 1 次；仍失败则等几分钟**完整重跑**，勿用 `--fetch` |
| `tabbit-not-running`                           | 预检发现浏览器没起来（exit 3，未开任何页面）→ 先启动 Tabbit 并登录千问再重跑 |
| `tabbit-no-window`                             | 进程在但窗口收进托盘且自动唤起失败（exit 3，未开页面、未耗额度）→ 手动开一个 Tabbit 窗口再重跑 |
| `download-failed`                              | 重跑一次，仍失败改用页面手动下载                    |
| 构图或风格不对                                        | 改提示词重跑，别反复微调同一句                     |
| `tabbit-cli-not-found`                         | 未装 Tabbit 浏览器，需用户安装                 |
| `empty-runner-output`                          | 运行器无输出，按失败处理；确认浏览器还活着再重跑            |
| `generation-failed`                            | 没拿到图片路径，重跑一次                        |
| `empty-output-file`                            | 文件为空，重跑；仍空则查输出目录所在磁盘与权限       |
| `output-dir-unwritable`                        | 输出目录建不了（磁盘不存在/无权限），传第三参数换路径 |
| **空输出（无任何 JSON）**                              | **一律视为失败**，不是"还在跑"，直接重跑             |

## 多模态

不需要视觉能力。成功判定基于 DOM 事实（图片 `naturalWidth > 200`、状态栏模型名、画幅标签）。无视觉能力时直接交付文件，由用户肉眼判断，不要强行截图。
