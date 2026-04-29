#!/usr/bin/env bash
# 本地一键启动 — 13 个服务 + 3 个前端,所有进程后台运行,日志写到 .runtime/logs/
# 用法:
#   bash scripts/start-local.sh start    # 启动
#   bash scripts/start-local.sh stop     # 停止
#   bash scripts/start-local.sh status   # 查看 PID + 端口
#   bash scripts/start-local.sh logs <name>
#
# 依赖:mvn 3.9+ / uv / go 1.21+ / node 20+ / pnpm 9+ / Java 21
# 默认全部 mock + 内存,无需 Mongo / Redis / 真实 LLM(ai-hub 走 INLINE_MOCK)。

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUNTIME="$ROOT/.runtime"
LOGS="$RUNTIME/logs"
PIDS="$RUNTIME/pids"
mkdir -p "$LOGS" "$PIDS"

export PATH="/usr/local/opt/node@20/bin:$PATH"

# ───── 服务清单(顺序 = 依赖顺序) ─────
# name|kind|dir|cmd|port
SERVICES=$(cat <<'EOF'
audit-svc|java|services/audit-svc|mvn -q -f services/audit-svc/pom.xml spring-boot:run|8085
livectx-svc|java|services/livectx-svc|mvn -q -f services/livectx-svc/pom.xml spring-boot:run|8086
upload-svc|java|services/upload-svc|mvn -q -f services/upload-svc/pom.xml spring-boot:run|8088
report-svc|java|services/report-svc|mvn -q -f services/report-svc/pom.xml spring-boot:run|8089
notify-svc|java|services/notify-svc|mvn -q -f services/notify-svc/pom.xml spring-boot:run|8082
session-svc|java|services/session-svc|mvn -q -f services/session-svc/pom.xml spring-boot:run|8081
routing-svc|java|services/routing-svc|mvn -q -f services/routing-svc/pom.xml spring-boot:run|8083
tool-svc|java|services/tool-svc|mvn -q -f services/tool-svc/pom.xml spring-boot:run|8087
agent-bff|java|services/agent-bff|mvn -q -f services/agent-bff/pom.xml spring-boot:run|8084
llm-router|py|services/llm-router|uv run python -m llm_router.main|8090
ai-hub|py|services/ai-hub|uv run python -m ai_hub.main|8091
kb-svc|py|services/kb-svc|uv run python -m kb_svc.main|8092
gateway-ws|go|services/gateway-ws|go run ./cmd/gateway-ws|8080
web-c|web|.|pnpm --filter @ai-kefu/web-c dev|5173
web-agent|web|.|pnpm --filter @ai-kefu/web-agent dev|5174
web-admin|web|.|pnpm --filter @ai-kefu/web-admin dev|5175
EOF
)

# ───── 共享环境变量(让各服务找到下游) ─────
export SESSION_SVC_URL=http://localhost:8081
export NOTIFY_SVC_URL=http://localhost:8082
export ROUTING_SVC_URL=http://localhost:8083
export AGENT_BFF_URL=http://localhost:8084
export AUDIT_SVC_URL=http://localhost:8085
export LIVECTX_SVC_URL=http://localhost:8086
export TOOL_SVC_URL=http://localhost:8087
export UPLOAD_SVC_URL=http://localhost:8088
export REPORT_SVC_URL=http://localhost:8089
export LLM_ROUTER_URL=http://localhost:8090
export AI_HUB_URL=http://localhost:8091
export KB_SVC_URL=http://localhost:8092
export GATEWAY_WS_URL=http://localhost:8080
export AI_HUB_LLM_INLINE_MOCK=1   # 不用真实 LLM

bootstrap() {
  echo "[bootstrap] pnpm install ..."
  pnpm i || return 1
  echo "[bootstrap] 构建 packages dist(design-tokens / ui-glass)— Tailwind / Vite 需要 ..."
  for p in design-tokens ui-glass; do
    pnpm --filter "@ai-kefu/$p" run build || return 1
  done
  echo "[bootstrap] mvn -DskipTests install (第一次较慢) ..."
  mvn -q -DskipTests -T 1C install || return 1
  echo "[bootstrap] uv sync 各 Python 服务 ..."
  for d in services/llm-router services/ai-hub services/kb-svc; do
    (cd "$d" && uv sync --quiet) || return 1
  done
  echo "[bootstrap] 完成"
}

start_one() {
  local name="$1" kind="$2" dir="$3" cmd="$4" port="$5"
  local pidfile="$PIDS/$name.pid"
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "  [skip] $name 已在跑(pid=$(cat "$pidfile"))"
    return
  fi
  echo "  [start] $name → :$port (kind=$kind)"
  # Java 服务的 mvn -pl 必须在 root 执行;其它服务 cd 到目录
  local workdir="$ROOT/$dir"
  [[ "$kind" == "java" ]] && workdir="$ROOT"
  ( cd "$workdir" && nohup bash -c "$cmd" >"$LOGS/$name.log" 2>&1 & echo $! >"$pidfile" )
}

stop_one() {
  local name="$1"
  local pidfile="$PIDS/$name.pid"
  if [[ ! -f "$pidfile" ]]; then return; fi
  local pid
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "  [stop] $name (pid=$pid)"
    pkill -P "$pid" 2>/dev/null
    kill "$pid" 2>/dev/null
    sleep 0.2
    kill -9 "$pid" 2>/dev/null
  fi
  rm -f "$pidfile"
}

status_one() {
  local name="$1" port="$2"
  local pidfile="$PIDS/$name.pid"
  local state="-"
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    state="up(pid=$(cat "$pidfile"))"
  fi
  local listen=""
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    listen="✓"
  else
    listen=" "
  fi
  printf "  %-12s :%-5s %s %s\n" "$name" "$port" "$listen" "$state"
}

cmd_start() {
  bootstrap || { echo "bootstrap 失败,中止"; exit 1; }
  echo "[start] 后台启动所有服务"
  while IFS='|' read -r name kind dir cmd port; do
    [[ -z "$name" ]] && continue
    start_one "$name" "$kind" "$dir" "$cmd" "$port"
  done <<< "$SERVICES"
  echo
  echo "全部进程已派发,首次启动 Spring Boot 需 30~60s 编译。"
  echo "查看状态:    bash scripts/start-local.sh status"
  echo "查看某服日志: bash scripts/start-local.sh logs <name>"
  echo "停止所有:    bash scripts/start-local.sh stop"
  echo
  echo "前端访问:"
  echo "  C 端    http://localhost:5173"
  echo "  坐席台   http://localhost:5174"
  echo "  管理后台 http://localhost:5175"
}

cmd_stop() {
  echo "[stop] 关闭所有"
  while IFS='|' read -r name kind dir cmd port; do
    [[ -z "$name" ]] && continue
    stop_one "$name"
  done <<< "$SERVICES"
}

cmd_status() {
  echo "[status]"
  while IFS='|' read -r name kind dir cmd port; do
    [[ -z "$name" ]] && continue
    status_one "$name" "$port"
  done <<< "$SERVICES"
}

cmd_logs() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo "用法: bash scripts/start-local.sh logs <name>"
    exit 1
  fi
  tail -F "$LOGS/$name.log"
}

case "${1:-start}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  logs) shift; cmd_logs "$@" ;;
  bootstrap) bootstrap ;;
  *)
    echo "用法: bash scripts/start-local.sh {start|stop|status|logs <name>|bootstrap}"
    exit 1
    ;;
esac
