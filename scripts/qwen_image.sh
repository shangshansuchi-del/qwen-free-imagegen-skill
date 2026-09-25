#!/usr/bin/env bash
# qwen_image.sh - 千问 Studio 生图唯一入口
#   用法: /usr/bin/bash.exe <skill-dir>/scripts/qwen_image.sh "<提示词>" [画幅] [输出路径]
#         /usr/bin/bash.exe <skill-dir>/scripts/qwen_image.sh --fetch [输出路径]
#         /usr/bin/bash.exe <skill-dir>/scripts/qwen_image.sh --doctor  # 首次体检：检测后端，不生图
# 失败时一定打印 {"error":"..."} 并以非零码退出，绝不静默返回空。
set -uo pipefail

MODEL_DEFAULT="Qwen-Image 3.0"
RATIO_DEFAULT="3:4"
# 默认输出目录：用户「图片」文件夹下的 qwen-imagegen（Windows/Mac/Linux 通用，无需配置）。
# 优先级：命令行第三参数 > 环境变量 QWEN_IMAGEGEN_OUT_DIR > 此默认值。
OUT_DIR_DEFAULT="$HOME/Pictures/qwen-imagegen"
TASK="qwen-imagegen"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 首次体检：装好之后第一次用之前跑一次，问清楚"用哪个后端"，别等报错再返工（报错一次=白烧一轮 token）
# 不开浏览器、不消耗额度、秒回。
if [ "${1:-}" = "--doctor" ]; then
  TABBIT_OK=0
  if [ -n "${LOCALAPPDATA:-}" ] && [ -f "${LOCALAPPDATA}/Tabbit/LocalAgent/bin/tabbit-cli.exe" ]; then
    TABBIT_OK=1
  elif [ -f "$HOME/.local/bin/tabbit-cli" ]; then
    TABBIT_OK=1
  fi

  CDP_PORT=""
  if command -v node >/dev/null 2>&1; then
    for p in 9222 9223; do
      r="$(node -e 'fetch("http://127.0.0.1:"+process.argv[1]+"/json/version",{signal:AbortSignal.timeout(1500)}).then(r=>r.ok?r.text():Promise.reject()).then(t=>console.log(t)).catch(()=>{})' "$p" 2>/dev/null)"
      if [ -n "$r" ]; then CDP_PORT="$p"; break; fi
    done
  fi

  if [ "$TABBIT_OK" = "1" ]; then
    echo "{\"tabbit\":true,\"cdp_port\":\"${CDP_PORT:-closed}\",\"recommended_backend\":\"tabbit\",\"next\":\"直接按 SKILL.md 正常调用即可，无需任何配置\"}"
  elif [ -n "$CDP_PORT" ]; then
    echo "{\"tabbit\":false,\"cdp_port\":\"$CDP_PORT\",\"recommended_backend\":\"cdp\",\"next\":\"浏览器调试端口已开，可用 CDP 后端（开发中）\"}"
  else
    echo "{\"tabbit\":false,\"cdp_port\":\"closed\",\"recommended_backend\":\"none\",\"next\":\"两个后端都不可用：装 Tabbit，或给 Chrome/Edge 加 --remote-debugging-port=9222 后重启（必须用原来的用户配置，登录态才不会丢），详见 README 的 CDP 配置章节\"}"
  fi
  exit 0
fi

if [ -n "${LOCALAPPDATA:-}" ] && [ -f "${LOCALAPPDATA}/Tabbit/LocalAgent/bin/tabbit-cli.exe" ]; then
  CLI="${LOCALAPPDATA}/Tabbit/LocalAgent/bin/tabbit-cli.exe"
elif [ -f "$HOME/.local/bin/tabbit-cli" ]; then
  CLI="$HOME/.local/bin/tabbit-cli"
else
  echo '{"error":"tabbit-cli-not-found","hint":"未找到 Tabbit CLI，确认已安装 Tabbit 浏览器"}'
  exit 1
fi

# Tabbit 预检：浏览器没起来时只报错退出、一个页面都不开（根治"连开多页 + 弹窗"）
PROBE_RC=0
PROBE_OUT="$("$CLI" tabs --task "$TASK" --limit 1 2>&1)" || PROBE_RC=$?
if [ "$PROBE_RC" -ne 0 ] || printf '%s' "$PROBE_OUT" | grep -qiE 'not running|未启动|not connected|ECONNREFUSED|target closed'; then
  echo '{"error":"tabbit-not-running","hint":"先启动 Tabbit 浏览器并登录千问，再重跑本脚本"}'
  exit 3
fi

# 零窗口预检：Tabbit 收进托盘（进程在、窗口数为 0）时，新建 tab 会在数毫秒内报
# "Task-scoped CDP command could not be dispatched"。最小化时 focusedWindowId 同样是 null 但建页正常，
# 所以只能用「真建一个页试试」的功能性探针判断；命中后用一次性任务名，以免干扰标签组复用。
tabs_usable() {
  local out
  out="$("$CLI" nodejs --task "tabbit-preflight" --request-id "pf-$$-$(date +%s)" --timeout-ms 60000 <<'JS' 2>&1 | grep -v '^TABBIT'
return 1;
JS
)"
  "$CLI" finish --task "tabbit-preflight" --discard >/dev/null 2>&1
  case "$out" in *'"status":"succeeded"'*) return 0 ;; *) return 1 ;; esac
}
launcher_browser_path() {
  local reg="${LOCALAPPDATA:-}/Tabbit/LocalAgent/bin/launcher-target.json"
  [ -f "$reg" ] || return 0
  if command -v node >/dev/null 2>&1; then
    node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).browserPath||"")}catch(e){}' "$reg"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys
try:
    print(json.load(open(sys.argv[1], encoding="utf-8")).get("browserPath", ""), end="")
except Exception:
    pass' "$reg"
  fi
}
minimize_window() {
  local ps="/tmp/qwen-imagegen-minimize-$$.ps1"
  cat > "$ps" <<'PS1'
Add-Type -Namespace TabWin -Name M -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);' | Out-Null
Get-Process | Where-Object { $_.ProcessName -like 'Tabbit*' -and $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1 | ForEach-Object { [TabWin.M]::ShowWindow($_.MainWindowHandle, 6) } | Out-Null
PS1
  local wsp; wsp="$(cygpath -w "$ps" 2>/dev/null || echo "$ps")"
  powershell -NoProfile -ExecutionPolicy Bypass -File "$wsp" >/dev/null 2>&1
  rm -f "$ps"
}
if ! tabs_usable; then
  BR="$(launcher_browser_path)"
  if [ -z "$BR" ]; then
    echo '{"error":"tabbit-no-window","hint":"Tabbit 没有可用窗口，且定位不到浏览器主程序；请手动打开一个 Tabbit 窗口后重跑"}'
    exit 3
  fi
  powershell -NoProfile -Command "Start-Process -FilePath '$BR'" >/dev/null 2>&1
  WINDOW_READY=0
  for _w in 1 2 3 4 5 6 7 8; do
    sleep 3
    if tabs_usable; then WINDOW_READY=1; break; fi
  done
  if [ "$WINDOW_READY" != "1" ]; then
    echo '{"error":"tabbit-no-window","hint":"已尝试启动 Tabbit，24 秒内仍建不出页面；请手动打开窗口并确认后重跑"}'
    exit 3
  fi
  minimize_window
  echo '{"tabbit-window-restored":"minimized"}'
fi

if [ "${1:-}" = "--fetch" ]; then
  PROMPT=""; RATIO="$RATIO_DEFAULT"; OUT="${2:-}"
else
  PROMPT="${1:-}"; RATIO="${2:-$RATIO_DEFAULT}"; OUT="${3:-}"
  if [ -z "$PROMPT" ]; then
    echo '{"error":"missing-prompt","hint":"用法: qwen_image.sh \"<提示词>\" [画幅] [输出路径]"}'
    exit 1
  fi
fi

[ -z "$OUT" ] && OUT="${QWEN_IMAGEGEN_OUT_DIR:-$OUT_DIR_DEFAULT}/qwen-$(date +%Y%m%d-%H%M%S).png"
mkdir -p "$(dirname "$OUT")" 2>/dev/null || {
  echo "{\"error\":\"output-dir-unwritable\",\"detail\":\"$(dirname "$OUT")\"}"
  exit 1
}
OUT_POSIX="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

# Git Bash 的 /c/... 形式路径 Windows 版 Node 无法识别，统一转成 C:/... 形式
to_win() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1" | sed 's#\\#/#g'; else echo "$1"; fi
}
OUT_ABS="$(to_win "$OUT_POSIX")"

CFG="$(pwd)/.qwen-imagegen-cfg-$(date +%s).json"
CFG_JS="$(to_win "$CFG")"
write_cfg() {
  if command -v node >/dev/null 2>&1; then
    node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({prompt:process.argv[2],ratio:process.argv[3],out:process.argv[4],model:process.argv[5]}))' \
      "$CFG_JS" "$PROMPT" "$RATIO" "$OUT_ABS" "$MODEL_DEFAULT"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys;open(sys.argv[1],"w",encoding="utf-8").write(json.dumps({"prompt":sys.argv[2],"ratio":sys.argv[3],"out":sys.argv[4],"model":sys.argv[5]}))' \
      "$CFG_JS" "$PROMPT" "$RATIO" "$OUT_ABS" "$MODEL_DEFAULT"
  else
    echo '{"error":"need-node-or-python3"}'; exit 1
  fi
}
write_cfg
render() { sed "s#__CONFIG__#${CFG_JS}#g" "$1"; }
cleanup() { rm -f "$CFG"; }
# SIGTERM/INT 路径也要清掉临时 cfg（09-19 被 120s 前台超时杀掉时曾留下一堆 .qwen-imagegen-cfg-*.json）
trap 'cleanup' EXIT INT TERM
run_step() {
  render "$1" | "$CLI" nodejs --task "$TASK" --request-id "$2" --timeout-ms "$3" 2>&1 \
    | grep -v '^TABBIT_PLAYWRIGHT_INSTANCE'
}
# 默认复用上次的标签组与对话；QWEN_IMAGEGEN_DISCARD=1 时用完即关
find_group() {
  local json
  json="$("$CLI" tabs --task "$TASK" --limit 50 2>/dev/null | grep -v '^TABBIT_PLAYWRIGHT_INSTANCE')"
  [ -z "$json" ] && return 0
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const t=(j.tabs||[]).find(x=>x.group&&x.group.title===process.argv[1]);const id=t&&t.group&&(t.group.groupId||t.group.id);if(id)console.log(id)}catch(e){}})' "$TASK"
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$json" | python3 -c 'import json,sys
try:
    j=json.load(sys.stdin)
    for t in j.get("tabs",[]):
        g=t.get("group")
        if isinstance(g,dict) and g.get("title")==sys.argv[1]:
            gid=g.get("groupId") or g.get("id")
            if gid:
                print(gid); break
except Exception:
    pass' "$TASK"
  fi
}
finish_task() {
  if [ "${QWEN_IMAGEGEN_DISCARD:-0}" = "1" ]; then
    "$CLI" finish --task "$TASK" --discard >/dev/null 2>&1
  else
    "$CLI" finish --task "$TASK" >/dev/null 2>&1
  fi
}
# 失败出口：结构化报错 + 释放标签 + 非零退出
die() { echo "$1"; finish_task; cleanup; exit 1; }

if [ "${QWEN_IMAGEGEN_DISCARD:-0}" != "1" ]; then
  GROUP_ID="$(find_group)"
  if [ -n "${GROUP_ID:-}" ]; then
    "$CLI" resume --task "$TASK" --group "$GROUP_ID" >/dev/null 2>&1 \
      && echo "{\"reused-group\":\"$GROUP_ID\"}"
  fi
fi

# A4：provider-error（千问红色横幅 = 生成被服务端拒绝）自动重提交一次；
#     --fetch 模式没有提示词、无法重提交，也自动重试没有意义 → 强制单次
MAX_ATTEMPTS=2
[ "${1:-}" = "--fetch" ] && MAX_ATTEMPTS=1
[ "${QWEN_IMAGEGEN_NO_RETRY:-0}" = "1" ] && MAX_ATTEMPTS=1

attempt=1
RES=""
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  if [ "${1:-}" != "--fetch" ]; then
    GEN="$(run_step "$SKILL_DIR/scripts/generate.js" "gen-$(date +%s)" 90000)"
    [ -z "$GEN" ] && GEN='{"error":"empty-runner-output","hint":"tabbit-cli 无输出，按失败处理；确认浏览器可用后重跑"}'
    if printf '%s' "$GEN" | grep -q '"error"'; then
      if printf '%s' "$GEN" | grep -q 'provider-error' && [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
        attempt=$((attempt + 1)); sleep 20; continue
      fi
      die "$GEN"
    fi
  fi

  RES="$(run_step "$SKILL_DIR/scripts/wait_download.js" "fetch-$(date +%s)" 140000)"
  [ -z "$RES" ] && RES='{"error":"empty-runner-output","hint":"等待图片阶段返回空输出，按失败处理"}'
  if printf '%s' "$RES" | grep -q '"error"'; then
    if printf '%s' "$RES" | grep -q 'provider-error' && [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
      attempt=$((attempt + 1)); sleep 20; continue
    fi
    die "$RES"
  fi
  break
done

printf '%s' "$RES" | grep -q '"path"' || die '{"error":"generation-failed","hint":"运行器未返回图片路径，重跑一次"}'
[ -s "$OUT_POSIX" ] || die "{\"error\":\"empty-output-file\",\"detail\":\"$OUT_ABS\"}"

echo "$RES"
finish_task
cleanup
exit 0
