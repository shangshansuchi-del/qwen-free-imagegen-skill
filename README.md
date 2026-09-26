# qwen-imagegen

[![CI](https://github.com/shangshansuchi-del/qwen-free-imagegen-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/shangshansuchi-del/qwen-free-imagegen-skill/actions/workflows/ci.yml) ![v0.1.0](https://img.shields.io/badge/v0.1.0-orange) ![license](https://img.shields.io/badge/license-MIT-blue)

[English](README.en.md) · 简体中文

一个给 AI Agent 用的生图技能。装好之后，你用平时说话的方式告诉你的 Agent，它就会替你打开 Qwen Studio（千问，chat.qwen.ai），把你要的画面填进去，等画完，把**全尺寸原图**存到你电脑的「图片」文件夹里。

不需要 API Key，不按张收费，不用注册任何第三方服务。

---

## 这是个什么东西

装好之后，跟你的 Agent（Claude Code、Codex、WorkBuddy……都行）说人话就行：

```text
用千问帮我画一张：樱花树下的和服少女，二次元插画，3:4
```

剩下的——打开网页、选模型、填提示词、等出图、存原图——全是它替你干。你在网页上能用什么模型，它就能用什么模型；网页给你多大尺寸的图，它就存多大的图。

---

## 里面自带的生图提示词（这才是重点）

"帮你点网页"的技能到处都是。真正决定画质好坏的，是**交给网页的那句话怎么写**。

这个技能自带一份实测过的提示词配方（`references/prompt-recipes.md`，针对 Qwen-Image 3.0）：

- **两套公式** —— 视觉类：`主体 → 景别 → 视角 → 镜头 → 光线 → 风格 → 质感`；信息类（海报 / 信息图 / 分镜 / UI）按**创意简报七段**写，别用"美图思维"
- **三档填空模板** —— 最小可用（≥120 字）/ 标准（250–400 字）/ 信息型
- **8 类现成配方，直接能抄** —— 写实人像、二次元立绘、街头时尚、风景建筑、产品商业、信息型海报、分镜多格、UI 概念图
- **六种反例及改法** —— 堆"8K / 杰作 / 大师作品"、写两个风格标签、"一个女生"就提交、描述复杂手部动作、用"不要 XX"表达排斥（网页端**没有反向提示词入口**，否定词会被忽略）……
- **提交前 5 秒自检表**

而且这条是写进技能规则的：**你只给一句话（比如"来张猫"）时，Agent 必须先按模板补全再提交**，不许原样丢给网页——"随手一句"和"能用的图"，差别就在这。

---

## 为什么不用 API

市面上"免费生图 API"一般来自聚合站，而聚合站有两个老毛病：**模型可能被悄悄换成廉价旧款**，**画质经常被降档**。

这个技能直接驱动浏览器用网页版，绕开中间商：你账号下是什么模型就是什么模型，网页出多大图就存多大图（3:4 ≈ **1792×2400 全尺寸原图**，不是缩略图）。

| | 本技能（浏览器代驾） | 免费生图 API 聚合站 |
| --- | --- | --- |
| 模型 | 网页上是什么就是什么（现为 Qwen-Image 3.0） | 常被静默换成廉价旧款 |
| 画质 | 全尺寸原图 | 多为降档缩图 |
| 费用 | 你自己账号的免费额度 | 隐性限额，或拿质量换免费 |
| 凭据 | 登录态在你自己浏览器里 | 请求经第三方转发 |

---

## 为什么是 Qwen Studio，而不是国内版千问

因为 **Qwen Studio（chat.qwen.ai）可以免费畅用 Qwen-Image 3.0**，而国内版千问不行——额度、入口都不一样。

这个技能打的就是这个网页版，所以你能免费用上最新的 3.0。

---

## 画质：出来的图有多大

存下来的是**全尺寸原图**（脚本剥掉了网页的缩略图参数），不是页面上那个小缩略图：

| 画幅 | 实际像素 | 说人话 |
| --- | --- | --- |
| 3:4（竖屏，人物常用） | 1792 × 2400 | 约 430 万像素，**是 1080P（1920×1080）的两倍多**，接近 2K 竖屏 |
| 16:9（横屏，风景常用） | 2752 × 1536 | 约 423 万像素，**超过 1080P**，接近 2K（2560×1440） |

尺寸是从 PNG 文件头里读出来的真实数值，不是估算。

---

## Token 消耗：一次生图大概烧多少

实测：**一次完整生图约 50 多万 token**（走 Agent 调用，含脚本往返）。

为什么能压在这个量级——因为这套流程**全程不看图**：

- **不截图**：判定"出图完成"靠 DOM 事实（图片元素的真实尺寸、状态栏模型名、画幅标签），而不是反复截图给模型看。图片进上下文是最贵的开销之一。
- **推理在脚本里**：怎么点、何时重试、如何抓原图，全写在脚本中；Agent 只发一条命令、收一行 JSON。
- **失败有结构化出口**：出错返回 `{"error":"..."}`，不用 Agent 反复试探页面找原因。

**和同类项目比**：其他"浏览器代驾 / Computer Use"类方案通常走「边做边截图 → 把截图和整页 DOM 回传给模型 → 模型再决策」的循环，**单次常是百万级 token**（按机制推算的量级，随步数与模型而变，不点具体项目）。本技能把这些判断前移到了脚本层，所以更省。

---

## ⚠️ 用之前必须知道：登录态

**它不会帮你登录，也永远不会碰你的账号和密码。**

它用的，是浏览器里**已经登录着的那个千问**。所以第一次用之前，先在 Tabbit 浏览器里打开 [chat.qwen.ai](https://chat.qwen.ai) 登录好。登录这件事，它替不了你，也不该替你。

---

## 它驱动哪个浏览器

这个技能最大的特点：它驱动的是**给 Agent 用的浏览器**。

这类浏览器现在还很少：Mac 上有 ego lite（[lite.ego.app](https://lite.ego.app)，目前仅 macOS），**Windows 上主要是 Tabbit**——本技能用的就是它。

| 后端 | 状态 | 说明 |
| --- | --- | --- |
| **Tabbit** | ✅ 当前支持 | 本技能目前只在 Windows 上实测过 |
| 你自己的 Chrome / Edge（CDP 直连） | 🚧 规划中 | 复用你已有的登录态，不用再装东西——**但要先给浏览器开个调试端口**，步骤见文末 |

---

## 怎么装、怎么用

都是**发给 Agent 的话**，复制粘贴就行。

**第一步 · 装**，把下面这句话复制给你的 Agent（右上角有复制键）：

```text
请把 https://github.com/shangshansuchi-del/qwen-free-imagegen-skill 下载到我的技能文件夹里，然后读一下 SKILL.md。
```

**第二步 · 用**，把下面这句复制给它（照抄就能看出效果，之后随便改成你想要的）：

```text
用 Qwen Studio 帮我生成一张：日系动画半身立绘，银灰渐变双马尾少女，琥珀色大眼，白色水手服配深蓝领结，樱花纷飞的校园走廊，午后金光穿过枝叶洒下光斑，柔和赛璐璐上色，发丝高光细腻，3:4
```

**第一次跑之前**：在 Tabbit 浏览器里登录好 chat.qwen.ai（见上面 ⚠️）。

**两个小提醒**：

- **别让它被掐断**：出图要几十秒到几分钟，而很多命令行工具默认 **2 分钟**没结果就把进程掐了——一掐就前功尽弃，你只会看到一片空白。所以跟 Agent 说一句：**「超时设成 10 分钟，别催它」**
- **先体检再开跑**：让 Agent 跑一次体检（见技术细节的 `--doctor`），一次问清楚用哪个后端、要不要配 CDP——**报错一次就是白烧一轮 token**，别等报错再返工
- 画完 Agent 会把图片的保存路径报给你

---

## 图片存在哪

**默认存在你电脑的「图片」文件夹**下的 `qwen-imagegen` 子文件夹里：

- Windows：`C:\你的用户名\Pictures\qwen-imagegen`
- Mac / Linux：`~/Pictures/qwen-imagegen`

**什么都不用配置，装好就能用。** 想换个地方存？跟 Agent 说一声就行（它支持指定路径，也有环境变量开关，见下面的技术细节）。

---

## 出问题了怎么办

**如果屏幕上什么都没显示，那就是失败了，直接再跑一次。** 这不是"还在画"。

| 你看到的 | 是什么意思 |
| --- | --- |
| 什么都没显示 | 失败了，重跑 |
| 提示"未登录" | 浏览器里没登录千问，去登录 |
| 红色"服务访问量较大"之类的提示 | 千问临时拒绝，脚本会自动再试一次；还不行就等几分钟 |
| 提示浏览器没开 / 没有窗口 | 打开一下 Tabbit（窗口收进托盘时它会自动尝试唤起） |

---

# 技术细节

## 工作原理

`scripts/qwen_image.sh` 是唯一入口：预检浏览器 → 复用上次的标签组和对话（同一对话延续，不散落）→ 驱动页面选「图像生成」模式、锁定 Qwen-Image 3.0、填提示词提交 → 轮询 DOM 等完成 → 抓**去掉 OSS 缩图参数的全尺寸原图** → 存 PNG → 打印结果。

成功时输出一行 JSON（`width`/`height` 从 PNG 头读出，是真实尺寸，不是页面 450px 缩略图）：

```json
{"path":"C:/you/Pictures/qwen-imagegen/qwen-20260926-001530.png","bytes":5904848,"width":1792,"height":2400,"model":"Qwen-Image 3.0","ratio":"3:4"}
```

## 输出路径的三级优先级

```
命令行第三参数  >  环境变量 QWEN_IMAGEGEN_OUT_DIR  >  默认 ~/Pictures/qwen-imagegen
```

## 手动运行（调试用）

平时让 Agent 干就行；排查问题时才用：

```bash
/usr/bin/bash.exe "<技能目录>/scripts/qwen_image.sh" "<提示词>" [画幅] [输出路径]
# 超时后只补跑下载（仅限一次）：
/usr/bin/bash.exe "<技能目录>/scripts/qwen_image.sh" --fetch "<输出路径>"
```

## 用自带浏览器（CDP）之前，先做一步配置

> 这条路线还在开发（🚧），先把配置写清楚，方便你提前准备。

CDP 不会自己生效——**你得先让 Chrome / Edge 把"调试门"打开**，Playwright 才能接管它：

1. **完全退出** Chrome / Edge（托盘里也要退出，否则启动参数会被忽略）
2. 带参数重新启动：
   - Windows · Edge：`"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222`
   - Windows · Chrome：`"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222`
   - macOS：`/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222`

   （调试端口**没法对已经开着的浏览器事后补开**，所以只能带参数重启一次）
3. **验证门开了没**：浏览器里打开 `http://127.0.0.1:9222/json/version`，能看到一串 JSON（里面有 `"Browser"` 字样）就成了
4. 然后正常登录 [chat.qwen.ai](https://chat.qwen.ai)——**登录态就留在你自己的浏览器里**，脚本只是接过去用

嫌自己敲麻烦？**让 Agent 帮你**：第一次用的时候它会先跑一次体检（`--doctor`，见下一节），发现两个后端都不可用时，会问你一句"现在帮你把浏览器重启一次、把调试端口开好吗？"——你点头，它就关掉浏览器再带参数拉起来。**用的是你原来的用户配置，登录态不会丢。**一次就好，别等报错再返工。

⚠️ 两个提醒：

- 这个端口只开在**本机**（127.0.0.1），别把它暴露到局域网或公网——那等于把浏览器控制权交给别人
- 用完把带参数的浏览器窗口关掉，门就关了

## 后端体检（--doctor）

```bash
/usr/bin/bash.exe "<技能目录>/scripts/qwen_image.sh" --doctor
```

不开浏览器、不消耗额度、秒级返回，只回答一个问题：**这台机器该用哪个后端？**

```json
{"tabbit":true,"cdp_port":"closed","recommended_backend":"tabbit","next":"直接按 SKILL.md 正常调用即可，无需任何配置"}
```

- `"recommended_backend":"tabbit"` → 直接用，什么都不用配
- `"cdp"` → 浏览器调试端口已开，走 CDP 后端（开发中）
- `"none"` → 两个都不可用，先配一个再来（见上一节）

探测顺序：**① 环境变量 `QWEN_IMAGEGEN_BACKEND` → ② Tabbit → ③ CDP 端口（9222 / 9223）**。

## 后端适配（给贡献者）

JS 层（`generate.js` + `wait_download.js`，共 148 行）是**纯 Playwright API**（`page.goto` / `getByRole` / `locator` / `evaluateAll`），没有任何 `require("playwright")`——`page` 由外部注入（Tabbit 的 `nodejs` 子命令把文件内容包进 async 函数体执行）。**换后端不用动页面逻辑**，只需适配 4 个动作：

| 动作 | Tabbit CLI | CDP / Playwright 等价 |
| --- | --- | --- |
| 列出标签页 | `tabs` | `context.pages()` |
| 页面内执行脚本 | `nodejs` | 注入 `page` 跑 node 脚本 / `page.evaluate()` |
| 关闭 / 废弃任务 | `finish [--discard]` | `page.close()` / `context.close()` |
| 复用会话 | `resume --group` | 固定 `userDataDir` 的持久化 context |

## 错误码

**空输出 = 失败**，直接重跑。

| error | 处置 |
| --- | --- |
| `login-required` | 浏览器未登录千问 |
| `provider-error` | 服务端拒绝；自动重提交一次（间隔 20s，`QWEN_IMAGEGEN_NO_RETRY=1` 可关）；仍失败等几分钟完整重跑，**别用 `--fetch` 等** |
| `timeout`（无横幅） | 生成多半还在跑 → 唯一可用 `--fetch` 续等一次的场景 |
| `tabbit-not-running` / `tabbit-no-window` | 浏览器没启动 / 窗口在托盘且唤起失败（未开页面、不耗额度） |
| `model-not-found` / `version-dropdown-missing` | 页面改版，见 `references/ui-selectors.md` |
| `output-dir-unwritable` | 输出目录建不了，传第三参数换个地方 |

完整契约见 `SKILL.md`。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `QWEN_IMAGEGEN_OUT_DIR` | 覆盖默认输出目录（优先级见上） |
| `QWEN_IMAGEGEN_BACKEND` | 强制指定后端：`tabbit` 或 `cdp`（默认自动探测：Tabbit → CDP） |
| `QWEN_IMAGEGEN_DISCARD=1` | 用完即关标签组（默认复用会话） |
| `QWEN_IMAGEGEN_NO_RETRY=1` | 关闭 `provider-error` 自动重提交 |

## 目录结构

```
qwen-imagegen/
├── SKILL.md                      # 技能入口 + 完整错误码契约
├── scripts/
│   ├── qwen_image.sh             # 主流程：浏览器调度、重试、输出 JSON
│   ├── generate.js               # 页面操作：选模式 / 选模型 / 填提示词 / 提交
│   └── wait_download.js          # 等出图完成 + 抓全尺寸原图
└── references/
    ├── prompt-recipes.md         # 生图提示词配方：两套公式 / 三档模板 / 8 类配方 / 六反例 / 自检表
    └── ui-selectors.md           # 页面结构、选择器、接口抓包
```

## 免责声明

- 仅供编程学习、浏览器自动化研究与个人使用，与阿里云 / 通义千问官方无关。
- 请遵守千问平台的用户服务协议与内容规范。
- 请勿用于非法、侵权、恶意刷量或商业牟利。
- 因使用本项目导致的账号封禁、功能受限或其他损失由使用者承担，作者不承担责任。

## License

MIT
