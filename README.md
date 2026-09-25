# qwen-imagegen

**中文**：让 AI 替你去千问网页上画图，画完直接存成图片文件，放在你自己的电脑里。

**English**: Let your AI assistant draw pictures on the Qwen website for you — and save the finished image straight to your own computer.

不需要 API Key，不按张收费，也不用注册任何第三方服务。

No API key. No per-image billing. No signing up for anything.

---

## 它到底干嘛的 / What it actually does

你已经有一个登录着的千问网页了，对吧？

这个项目做的事很简单：让 AI 替你去那个网页上**点鼠标**——输入你想要的画面描述、选好尺寸、等它画完、把图存下来。

跟你自己手动干的**一模一样**，只是你不用守在旁边。

That's it. It clicks the mouse for you. Everything it does, you could do by hand — you just don't have to sit there watching.

**它不是 API**，不会去找什么接口。所以你在网页上能用什么模型，它就能用什么模型；网页给你多大尺寸的图，它就存多大的图。

It's **not an API**. Whatever model you can use on the website, it uses. Whatever size image the site gives you, that's what you get.

---

## ⚠️ 最重要的一件事：你得先自己登录 / You must be logged in first

**它不会帮你登录，也永远不会碰你的账号和密码。**

它用的，是你浏览器里**已经登录着的那个千问**。

所以第一次用之前，请你自己先在浏览器里打开 [chat.qwen.ai](https://chat.qwen.ai) 并登录好。登录这件事，**它替不了你，也不该替你**。

It never touches your password. It simply uses the Qwen session **you are already logged into**. So before the first run, open chat.qwen.ai in your browser and sign in yourself.

> 如果它报"未登录"，意思就是：你的浏览器里现在没有登录着的千问，去登录一下再跑。
>
> If it says "login required", it just means: your browser isn't logged into Qwen right now. Go log in and run it again.

---

## 开始之前要准备什么 / What you need

1. 一个千问账号，并且**已经在浏览器里登录着**（见上一节）
2. **Tabbit 浏览器** —— 目前只能用它来操作网页
   （后面打算支持"连你自己已有的 Chrome / Edge"，那样就不用额外装东西了）
3. Windows 用户请用 **Git Bash** 来运行命令

1. A Qwen account, **already logged in** in your browser
2. **Tabbit browser** — the only browser it can drive for now
   (support for connecting to your own Chrome / Edge is planned, which would mean nothing extra to install)
3. On Windows, run it through **Git Bash**

---

## 怎么用 / How to use

```bash
/usr/bin/bash.exe "<技能目录>/scripts/qwen_image.sh" "一只白色柴犬站在雨夜的霓虹街头"
```

就这一句。画完之后，它会告诉你图片存在哪个位置。

That's the whole thing. When it's done, it tells you where the picture was saved.

想指定尺寸就加一个参数：

```bash
/usr/bin/bash.exe "<技能目录>/scripts/qwen_image.sh" "一只白色柴犬在雨夜街头" 16:9
```

> ⏱ **一个小提醒**：跑的时候，请给你的命令行工具**至少 10 分钟的超时时间**。
> 画图本身要几十秒到几分钟。如果工具提前把它掐掉，你只会看到一片空白——那不是成功，是失败了。
>
> Give your terminal **at least 10 minutes** timeout. If it gets killed early, you'll see nothing at all — that's a failure, not a slow run.

---

## 图片存到哪去了 / Where do the images go

默认会存到脚本里写的一个文件夹。**但那个文件夹是作者自己电脑上的盘符，你的电脑上多半不存在**，所以要改成你自己的：

- **最简单的办法**：命令后面加一个你想存的位置
  ```bash
  /usr/bin/bash.exe "<技能目录>/scripts/qwen_image.sh" "一只柴犬" 3:4 "D:/我的图片/柴犬.png"
  ```
- **或者一劳永逸**：打开 `scripts/qwen_image.sh`，把第 10 行改成你自己的文件夹

The default folder is the author's own drive, which probably doesn't exist on your machine.
Either pass your own path as the third argument, or edit line 10 of `scripts/qwen_image.sh`.

---

## 出问题了怎么办 / When something goes wrong

**如果什么都没显示（一片空白），那就是失败了，直接再跑一次。**
这不是"还在画"，是失败了。

**If it prints nothing at all, that's a failure — just run it again.** It is not "still working".

| 你看到的 | 是什么意思 |
| --- | --- |
| 什么都没显示 | 失败了，重跑 |
| 提示"未登录" | 浏览器里没登录千问，去登录 |
| 出现"服务访问量较大"之类的红色提示 | 千问那边临时拒绝了，脚本会自动再试一次；还是不行就等几分钟 |
| 提示浏览器没开 / 没有窗口 | 浏览器没启动，或者窗口缩到托盘里了，手动打开一下 |

---

---

# 🔧 以下是技术细节 / Technical details below

> 这一区是给想改代码、想做适配、想排错的人看的。只想用它的话，看到这里就够了。
>
> Everything below is for people who want to modify or debug it. If you just want to use it, you can stop here.

## 它为什么不用 API / Why not an API

| | 本技能（浏览器代驾） | 免费生图 API 聚合站 |
| --- | --- | --- |
| 模型 | 网页上是什么就是什么（现为 Qwen-Image 3.0） | 常被静默换成廉价 / 旧模型 |
| 画质 | 全尺寸原图（3:4 ≈ 1792×2400） | 多为降档缩图 |
| 费用 | 用你自己的账号额度 | 有隐性限额，或拿质量换免费 |
| 风险 | 登录态在你自己浏览器里 | 第三方代持你的请求 |

## 关于登录态 / About login state

本技能**不持有任何凭证**：没有 cookie、没有 token、没有账号密码。
它只是驱动一个**已经登录好的浏览器**。因此：

- 登录必须由用户自己完成；脚本检测到未登录会直接退出（不消耗额度）
- 仓库敏感信息扫描结果：**无**个人路径 / cookie / token / 邮箱

## 两种浏览器后端 / Browser backends

| 后端 | 状态 | 说明 |
| --- | --- | --- |
| Tabbit | ✅ 可用 | 当前默认 |
| CDP（连用户自己的 Chrome / Edge） | 🚧 规划中 | 连 `--remote-debugging-port`，**复用已有登录态**，用户无需重新登录，也无需额外安装浏览器 |

JS 层（`generate.js` + `wait_download.js`，148 行）是**纯 Playwright API**
（`page.goto` / `getByRole` / `locator` / `evaluateAll`），只依赖外部注入的 `page`。
换后端不需要动页面逻辑，只需适配 4 个动作：

| 动作 | Tabbit CLI | CDP / Playwright 等价 |
| --- | --- | --- |
| 列出标签页 | `tabs` | `context.pages()` |
| 页面内执行脚本 | `nodejs` | `page.evaluate()` / 跑 node 脚本 |
| 关闭 / 废弃任务 | `finish [--discard]` | `page.close()` / `context.close()` |
| 复用会话 | `resume --group` | 固定 `userDataDir` 的持久化 context |

## 输出 / Output

stdout 打印一行 JSON：

```json
{"path":"...","bytes":5904848,"width":1792,"height":2400,"model":"Qwen-Image 3.0","ratio":"3:4"}
```

`width` / `height` 是从 PNG 头读出的真实尺寸，不是页面缩略图的 450px。下载为去掉 OSS 缩图参数的**全尺寸原图**。

## 错误码 / Error codes

**空输出 = 失败**，直接重跑。

| error | 处置 |
| --- | --- |
| `login-required` | 浏览器未登录千问 |
| `provider-error` | 服务端拒绝；脚本自动重提交一次（间隔 20s，`QWEN_IMAGEGEN_NO_RETRY=1` 可关闭）；仍失败则等几分钟完整重跑，**不要用 `--fetch` 去等** |
| `timeout`（无横幅） | 多半还在跑 → 唯一可用 `--fetch <输出路径>` 续等**一次**的场景；也空则完整重跑 |
| `tabbit-not-running` / `tabbit-no-window` | 浏览器未启动 / 窗口在托盘且唤起失败（未开页面、不耗额度） |
| `model-not-found` / `version-dropdown-missing` | 页面改版，见 `references/ui-selectors.md` |
| `output-dir-unwritable` | 输出目录不可写，换第三参数或改脚本第 10 行 |

完整契约见 `SKILL.md`。

## 环境变量 / Environment variables

| 变量 | 作用 |
| --- | --- |
| `QWEN_IMAGEGEN_DISCARD=1` | 用完即关标签组（默认复用会话） |
| `QWEN_IMAGEGEN_NO_RETRY=1` | 关闭 `provider-error` 自动重提交 |

## 目录结构 / Layout

```
qwen-imagegen/
├── SKILL.md                      # 技能入口 + 完整错误码契约
├── scripts/
│   ├── qwen_image.sh             # 主流程：浏览器调度、重试、输出 JSON
│   ├── generate.js               # 页面操作：选模式 / 选模型 / 填提示词 / 提交
│   └── wait_download.js          # 等出图完成 + 抓全尺寸原图
└── references/
    ├── prompt-recipes.md         # 提示词写法（与浏览器后端无关的资产）
    └── ui-selectors.md           # 页面结构、选择器、接口抓包
```

## 免责声明 / Disclaimer

- 仅供编程学习、浏览器自动化研究与个人使用，与阿里云 / 通义千问官方无关。
- 请遵守千问平台的用户服务协议与内容规范。
- 请勿用于非法、侵权、恶意刷量或商业牟利。
- 因使用本项目导致的账号封禁、功能受限或其他损失由使用者承担，作者不承担责任。

## License

MIT
