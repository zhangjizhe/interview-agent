#!/usr/bin/env bash
# Publish or keep the personal site on 127.0.0.1:8787. Never restarts Interview, Lab, or API.
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: bash deploy/portfolio-site/publish.sh [options]

  --ensure-only     Do not rebuild; only make sure the published site and tunnel are up
  --dry-run         Print actions without changing processes
  --allow-dirty     Allow publishing from a worktree that also has Lab/Interview/API edits
  --source DIR      Path to examples/portfolio-site (defaults to this repo)
  --node PATH       Node binary (defaults to Node 22 if installed)
  -h, --help        Show this help

The site binds 127.0.0.1:8787 only. Secrets are never written to the repo or printed.
HELP
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# The LaunchAgent copy lives outside the repo. Full publishes still need a repo checkout.
if [ -d "$SCRIPT_DIR/../../examples/portfolio-site" ]; then
  ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
elif [ -n "${PORTFOLIO_SITE_REPO:-}" ]; then
  ROOT="$PORTFOLIO_SITE_REPO"
else
  ROOT=""
fi
SOURCE=""
ENSURE_ONLY=0
DRY_RUN=0
ALLOW_DIRTY=0
NODE_BIN=""

while [ $# -gt 0 ]; do
  case "$1" in
    --ensure-only) ENSURE_ONLY=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --source)
      SOURCE="${2:?--source requires a directory}"
      shift
      ;;
    --node)
      NODE_BIN="${2:?--node requires a path}"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

SOURCE="${SOURCE:-}"
PUBLISH_DIR="${PORTFOLIO_SITE_PUBLISH_DIR:-$HOME/Library/Application Support/interview-agent/portfolio-site}"
PID_FILE="$PUBLISH_DIR/site.pid"
LOG_DIR="$HOME/Library/Logs/interview-agent"
SITE_LOG="$LOG_DIR/zhezone-site-server.log"
STATE_DIR="$PUBLISH_DIR"
# Only these containers may be started by this script.
TUNNEL_CONTAINERS=(zhezone-portfwd zhezone-named-tunnel)
FORBIDDEN_CONTAINERS=(
  interview-web
  interview-agent-lab
  interview-api
  interview-postgres
  interview-redis
  interview-portfolio-gateway
  interview-portfolio-tunnel
)

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'dry-run:'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

die() { echo "$*" >&2; exit 1; }

if [ -z "$SOURCE" ]; then
  if [ -n "$ROOT" ]; then
    SOURCE="$ROOT/examples/portfolio-site"
  elif [ "$ENSURE_ONLY" -eq 0 ]; then
    die "Cannot find the repo. Run this script from deploy/portfolio-site, or set PORTFOLIO_SITE_REPO."
  fi
fi

is_forbidden() {
  local name="$1" item
  for item in "${FORBIDDEN_CONTAINERS[@]}"; do
    [ "$name" = "$item" ] && return 0
  done
  return 1
}

assert_safe_container() {
  local name="$1"
  is_forbidden "$name" && die "Refusing to touch product container: $name"
  local allowed=0 item
  for item in "${TUNNEL_CONTAINERS[@]}"; do
    [ "$name" = "$item" ] && allowed=1
  done
  [ "$allowed" -eq 1 ] || die "Refusing to start unmanaged container: $name"
}

find_node() {
  if [ -n "$NODE_BIN" ]; then
    [ -x "$NODE_BIN" ] || die "Node binary not executable: $NODE_BIN"
    echo "$NODE_BIN"
    return
  fi
  local candidate
  for candidate in \
      "$HOME/.nvm/versions/node/v22.22.0/bin/node" \
      "$HOME/.nvm/versions/node/v22.22.2/bin/node" \
      /opt/homebrew/opt/node@22/bin/node \
      /usr/local/opt/node@22/bin/node
  do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi
  die "Node 22 is required to publish the site"
}

check_node_version() {
  local bin="$1" major
  major="$("$bin" -p "process.versions.node.split('.')[0]")"
  [ "$major" -ge 22 ] || die "Need Node 22 or newer; found $("$bin" -v)"
}

check_dirty_source() {
  local repo
  repo="$(cd "$SOURCE/../.." && pwd)"
  [ -d "$repo/.git" ] || return 0
  [ "$ALLOW_DIRTY" -eq 1 ] && return 0
  local dirty
  dirty="$(git -C "$repo" status --porcelain -- \
    apps/web \
    apps/agent-lab \
    apps/api \
    packages \
    ':(exclude)apps/api/src/modules/portfolio-assistant/data/portfolio-public.v1.json' \
    ':(exclude)apps/api/src/modules/portfolio-assistant/portfolio-source.integrity.spec.ts' \
    || true)"
  if [ -n "$dirty" ]; then
    die "Worktree has Lab/Interview/API edits. Publish from a clean site branch, or pass --allow-dirty."
  fi
}

site_is_up() {
  curl -sS -o /dev/null --max-time 3 -w '%{http_code}' http://127.0.0.1:8787/ 2>/dev/null | grep -q '^200$'
}

pid_is_recognized_site() {
  local pid="$1" cmd cwd
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 1
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  printf '%s' "$cmd" | grep -q '[n]ode' || return 1
  printf '%s' "$cmd" | grep -q 'server.mjs' || return 1
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ {print substr($0,2); exit}')"
  if printf '%s
%s' "$cmd" "$cwd" | grep -Eq 'portfolio-site|zhezone|Application Support/interview-agent/portfolio-site|8787'; then
    return 0
  fi
  return 1
}

pid_is_our_site() {
  pid_is_recognized_site "$@"
}

listener_pids() {
  lsof -nP -t -iTCP:8787 -sTCP:LISTEN 2>/dev/null || true
}

stop_our_site() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if pid_is_our_site "$pid"; then
      run kill "$pid"
      run sleep 0.4
    fi
    run rm -f "$PID_FILE"
  fi
}

start_site() {
  local node_bin="$1"
  mkdir -p "$PUBLISH_DIR" "$LOG_DIR"
  chmod 700 "$PUBLISH_DIR" "$LOG_DIR" 2>/dev/null || true
  if [ "$ENSURE_ONLY" -eq 1 ] && site_is_up; then
    log "Site already healthy on 127.0.0.1:8787"
    return 0
  fi
  # Full publish may recycle a recognized personal-site process so new files go live.
  # Unknown listeners on 8787 are left alone.
  if site_is_up; then
    local existing
    existing="$(listener_pids | awk 'NR==1')"
    if [ "$ENSURE_ONLY" -eq 1 ]; then
      return 0
    fi
    if ! pid_is_recognized_site "$existing"; then
      die "127.0.0.1:8787 is in use by an unrecognized process (pid ${existing:-unknown}); not replacing it"
    fi
    log "Restarting recognized site process $existing to load the newly published files"
    if [ "$DRY_RUN" -eq 1 ]; then
      return 0
    fi
    run kill "$existing"
    run sleep 0.4
  fi
  [ -f "$PUBLISH_DIR/server.mjs" ] || die "No published site at $PUBLISH_DIR. Run without --ensure-only first."
  stop_our_site
  if [ "$DRY_RUN" -eq 1 ]; then
    log "Would start site with $node_bin at $PUBLISH_DIR"
    return 0
  fi
  # No gateway key is passed on purpose.
  (
    cd "$PUBLISH_DIR"
    nohup env \
      HOST=127.0.0.1 \
      PORT=8787 \
      ASSISTANT_MODE=agent-lab \
      AGENT_LAB_BASE_URL=http://127.0.0.1:3001/api \
      AGENT_LAB_PUBLIC_ORIGIN=https://zhezone.cn \
      "$node_bin" server.mjs >>"$SITE_LOG" 2>&1 &
    echo $! >"$PID_FILE"
  )
  chmod 600 "$PID_FILE" "$SITE_LOG" 2>/dev/null || true
  sleep 0.8
  site_is_up || die "Site did not become healthy on 127.0.0.1:8787"
  log "Site is serving http://127.0.0.1:8787"
}

sync_build() {
  local node_bin="$1"
  [ -d "$SOURCE" ] || die "Site source not found: $SOURCE"
  [ -f "$SOURCE/scripts/build.mjs" ] || die "Missing build script in $SOURCE"
  check_dirty_source
  log "Building site from $SOURCE"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "Would build and sync into $PUBLISH_DIR"
    return 0
  fi
  (cd "$SOURCE" && "$node_bin" scripts/build.mjs)
  mkdir -p "$PUBLISH_DIR/src" "$PUBLISH_DIR/scripts"
  chmod 700 "$PUBLISH_DIR"
  # Copy only runtime files; never copy .env or credential files.
  rsync -a --delete \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude '*.pem' \
    --exclude '*.key' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude 'preview' \
    "$SOURCE/server.mjs" "$SOURCE/package.json" "$PUBLISH_DIR/"
  rsync -a --delete \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude '*.pem' \
    --exclude '*.key' \
    "$SOURCE/src/" "$PUBLISH_DIR/src/"
  printf '%s\n' "published-at=$(date '+%Y-%m-%d %H:%M:%S %z')" "source=$SOURCE" >"$PUBLISH_DIR/SOURCE.txt"
  chmod 600 "$PUBLISH_DIR/SOURCE.txt"
}

ensure_tunnel() {
  local name status
  command -v docker >/dev/null 2>&1 || { log "Docker not available; skipped tunnel check"; return 0; }
  for name in "${TUNNEL_CONTAINERS[@]}"; do
    assert_safe_container "$name"
    if ! docker inspect "$name" >/dev/null 2>&1; then
      log "Tunnel container $name is missing. Not creating it here, because that would require a secret. Start the existing named tunnel manually."
      continue
    fi
    status="$(docker inspect -f '{{.State.Status}}' "$name")"
    if [ "$status" = "running" ]; then
      log "Tunnel container $name is already running"
      continue
    fi
    log "Starting existing tunnel container $name"
    run docker start "$name" >/dev/null
  done
}

NODE="$(find_node)"
check_node_version "$NODE"

if [ "$ENSURE_ONLY" -eq 0 ]; then
  sync_build "$NODE"
fi
start_site "$NODE"
ensure_tunnel
log "Done. Product Interview/Lab/API containers were not restarted."
