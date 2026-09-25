# qwen-imagegen

[![CI](https://github.com/shangshansuchi-del/qwen-imagegen/actions/workflows/ci.yml/badge.svg)](https://github.com/shangshansuchi-del/qwen-imagegen/actions/workflows/ci.yml) ![v0.1.0](https://img.shields.io/badge/v0.1.0-orange) ![license](https://img.shields.io/badge/license-MIT-blue)

English · [简体中文](README.md)

An image-generation skill for AI agents. Once installed, tell your agent what you want in plain language — it opens Qwen Studio (chat.qwen.ai) in a browser, fills in your prompt, waits for the image, and saves the **full-resolution original** to your Pictures folder.

No API key. No per-image billing. No third-party sign-up.

---

## What it does

After installing, just talk to your agent (Claude Code, Codex, WorkBuddy, …):

```text
Generate an image with Qwen for me: a white Shiba Inu on a neon-lit rainy street, 3:4
```

Everything else — opening the page, picking the model, typing the prompt, waiting for the image, saving the original — it does for you. Whatever model you can use on the website, it uses. Whatever size the site produces, that's what you get.

---

## The built-in prompt recipes (the real gem)

Plenty of skills can click a web page for you. What actually decides image quality is **how the prompt is written**.

This skill ships a battle-tested prompt guide (`references/prompt-recipes.md`, tuned for Qwen-Image 3.0):

- **Two formulas** — Visual (portrait / animal / scenery / product): `subject → shot size → angle → lens → lighting → style → texture`; Informational (posters / infographics / storyboards / UI): write it as a **7-section creative brief**, not as "make it pretty"
- **Three fill-in-the-blank templates** — minimal (≥120 chars) / standard (250–400 chars) / informational
- **8 ready-to-copy recipes** — realistic portrait, anime character, street fashion, landscape & architecture, product photography, infographic poster, storyboard grid, UI concept
- **Six anti-patterns with fixes** — stacking "8K / masterpiece / best quality", mixing two style tags, sending "a girl" and hoping, describing complex hand poses, using "no / don't" phrasing (the web UI has **no negative-prompt box**; negations get ignored)…
- **A 5-second pre-submit checklist**

And this is a hard rule inside the skill: **when you only give one line ("draw a cat"), the agent must expand it with the recipe first** — never send it raw. That's the difference between a random roll and a usable image.

---

## Why not an API

"Free image-gen APIs" usually come from aggregator sites, and aggregators have two chronic problems: **models silently swapped for cheap older ones**, and **downgraded resolution**.

This skill drives the browser and uses the web version directly, skipping the middleman: whatever model your account shows is what you get, and the image is saved at full size (3:4 ≈ **1792×2400 original**, not a thumbnail).

| | This skill (browser chauffeur) | Free image API aggregators |
| --- | --- | --- |
| Model | Whatever the website gives you (currently Qwen-Image 3.0) | Often silently swapped for cheaper ones |
| Quality | Full-resolution original | Usually downscaled |
| Cost | Your own account's free quota | Hidden limits, or quality traded for free |
| Credentials | Login state lives in your own browser | Requests relayed by a third party |

---

## ⚠️ You must be logged in first

**It never logs in for you, and it never touches your account or password.**

It uses the Qwen session **already logged into** your browser. So before the first run, open [chat.qwen.ai](https://chat.qwen.ai) in the Tabbit browser and sign in yourself. That part can't — and shouldn't — be automated.

---

## Which browser it drives

The defining trait of this skill: it drives a **browser built for agents**.

Those are still rare: macOS has ego lite ([lite.ego.app](https://lite.ego.app), macOS-only for now), and on **Windows the main option is Tabbit** — which is what this skill uses.

| Backend | Status | Notes |
| --- | --- | --- |
| **Tabbit** | ✅ Supported | This skill has only been tested on Windows so far |
| Your own Chrome / Edge (CDP connection) | 🚧 Planned | Reuses your existing login state — **but you must open a debugging port on your browser first**; see the end of this page |

---

## Install & use

Everything below is **a message you send to your agent** — copy and paste.

**Step 1 · Install** — copy this line to your agent (there's a copy button in the top-right corner):

```text
Please download https://github.com/shangshansuchi-del/qwen-imagegen into your skills folder (ask me first if you're not sure where that is), then read its SKILL.md.
```

**Step 2 · Use** — then copy lines like this (just swap in your own description):

```text
Generate an image with Qwen Studio: a white Shiba Inu on a neon-lit rainy street, cinematic, 3:4
```

**Before the first run**: sign in to chat.qwen.ai in the Tabbit browser (see ⚠️ above).

**Two reminders**:

- Image generation takes from tens of seconds to a few minutes — tell your agent "**use a timeout of at least 10 minutes**". Killing it early just shows a blank output.
- When it's done, the agent reports the saved file path to you.

---

## Where images are saved

By default, into a `qwen-imagegen` folder **inside your Pictures folder**:

- Windows: `C:\you\Pictures\qwen-imagegen`
- macOS / Linux: `~/Pictures/qwen-imagegen`

**Zero configuration.** Want a different spot? Just tell your agent (it accepts a custom path and an env-var switch — see technical details below).

---

## When something goes wrong

**If nothing is printed at all, that's a failure — run it again.** It does not mean "still drawing".

| What you see | What it means |
| --- | --- |
| Blank output | Failed — run again |
| "login required" | The browser isn't signed into Qwen — go sign in |
| A red "high traffic" style banner | Qwen temporarily refused; the script retries once automatically, otherwise wait a few minutes |
| "browser not running / no window" | Open Tabbit (it tries to auto-restore a tray-minimized window) |

---

# Technical details

## How it works

`scripts/qwen_image.sh` is the single entry point: probe the browser → reuse the previous tab group and conversation (one ongoing thread, no clutter) → drive the page into "Image generation" mode, lock Qwen-Image 3.0, submit the prompt → poll the DOM until done → fetch the **full-size original with OSS thumbnail params stripped** → save the PNG → print the result.

On success it prints one JSON line (`width`/`height` are read from the PNG header — real size, not the page's 450px thumbnail):

```json
{"path":"C:/you/Pictures/qwen-imagegen/qwen-20260926-001530.png","bytes":5904848,"width":1792,"height":2400,"model":"Qwen-Image 3.0","ratio":"3:4"}
```

## Output path precedence

```
3rd CLI argument  >  QWEN_IMAGEGEN_OUT_DIR env var  >  default ~/Pictures/qwen-imagegen
```

## Manual run (debugging)

Normally your agent handles it; use this only when debugging:

```bash
/usr/bin/bash.exe "<skill-dir>/scripts/qwen_image.sh" "<prompt>" [ratio] [output-path]
# Re-attach to a timed-out download (once only):
/usr/bin/bash.exe "<skill-dir>/scripts/qwen_image.sh" --fetch "<output-path>"
```

## Before using your own browser (CDP): one setup step

> This backend is still in development (🚧). Documenting the setup now so you can prepare in advance.

CDP doesn't switch itself on — **you have to open a "debugging door" on Chrome / Edge** before Playwright can take it over:

1. **Fully quit** Chrome / Edge (also from the tray — otherwise the startup flag is ignored)
2. Relaunch it with the flag:
   - Windows · Edge: `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222`
   - Windows · Chrome: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222`
   - macOS: `/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222`

   Tired of typing it? **Copy a shortcut** and append `--remote-debugging-port=9222` to its target — just launch from that shortcut afterwards.
3. **Verify the door is open**: open `http://127.0.0.1:9222/json/version` in the browser — if you see a chunk of JSON containing `"Browser"`, you're done
4. Then sign in to [chat.qwen.ai](https://chat.qwen.ai) as usual — **the login state stays in your own browser**; the script just borrows it

⚠️ Two warnings:

- This port is local-only (127.0.0.1). Never expose it to your LAN or the public internet — that would hand over control of your browser.
- Closing the browser window that was launched with the flag closes the door.

## Backend adaptation (for contributors)

The JS layer (`generate.js` + `wait_download.js`, 148 lines total) is **pure Playwright API** (`page.goto` / `getByRole` / `locator` / `evaluateAll`) with no `require("playwright")` anywhere — `page` is injected externally (Tabbit's `nodejs` subcommand wraps the file in an async function body and executes it). **Swapping backends requires no changes to the page logic** — only 4 verbs to adapt:

| Verb | Tabbit CLI | CDP / Playwright equivalent |
| --- | --- | --- |
| List tabs | `tabs` | `context.pages()` |
| Run script in page | `nodejs` | node script with injected `page` / `page.evaluate()` |
| Close / discard task | `finish [--discard]` | `page.close()` / `context.close()` |
| Reuse session | `resume --group` | persistent context with fixed `userDataDir` |

## Error codes

**Empty output = failure.** Run again.

| error | What to do |
| --- | --- |
| `login-required` | Browser isn't signed into Qwen |
| `provider-error` | Server refused; auto-resubmits once (20s interval; `QWEN_IMAGEGEN_NO_RETRY=1` disables); if it still fails, wait a few minutes and rerun fully — **don't use `--fetch` to wait** |
| `timeout` (no banner) | Generation is probably still running → the only case where one `--fetch` re-attach is allowed |
| `tabbit-not-running` / `tabbit-no-window` | Browser not started / window in tray and auto-restore failed (no page opened, no quota used) |
| `model-not-found` / `version-dropdown-missing` | Page changed — see `references/ui-selectors.md` |
| `output-dir-unwritable` | Output dir can't be created — pass a third argument to change it |

Full contract in `SKILL.md`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `QWEN_IMAGEGEN_OUT_DIR` | Override the default output directory (precedence above) |
| `QWEN_IMAGEGEN_DISCARD=1` | Close the tab group after each run (default: reuse the session) |
| `QWEN_IMAGEGEN_NO_RETRY=1` | Disable the automatic `provider-error` resubmit |

## Layout

```
qwen-imagegen/
├── SKILL.md                      # Skill entry + full error-code contract
├── scripts/
│   ├── qwen_image.sh             # Main flow: browser dispatch, retries, JSON output
│   ├── generate.js               # Page actions: pick mode / model / type prompt / submit
│   └── wait_download.js          # Wait for completion + fetch full-size original
└── references/
    ├── prompt-recipes.md         # Prompt recipes: 2 formulas / 3 templates / 8 recipes / 6 anti-patterns / checklist
    └── ui-selectors.md           # Page structure, selectors, network captures
```

## Disclaimer

- For programming study, browser-automation research, and personal use only. Not affiliated with Alibaba Cloud / Tongyi Qwen.
- Follow the Qwen platform's terms of service and content policies.
- Do not use for illegal, infringing, spam, or commercial exploitation purposes.
- Any account restrictions or losses caused by using this project are the user's responsibility.

## License

MIT
