#!/usr/bin/env bash
# Install a user-level LaunchAgent that only keeps the published personal site and named tunnel up.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL="com.zhangjizhe.interview-agent.zhezone-site"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/interview-agent"
STABLE="$HOME/Library/Application Support/interview-agent/portfolio-site"
SRC="$ROOT/deploy/portfolio-site/publish.sh"

[ -f "$SRC" ] || { echo "Missing $SRC" >&2; exit 1; }
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR" "$STABLE"
chmod 700 "$LOG_DIR" "$STABLE"
# Copy the script to a stable user path so the agent survives worktree cleanup.
cp "$SRC" "$STABLE/publish.sh"
chmod 700 "$STABLE/publish.sh"
printf '%s\n' "$ROOT" >"$STABLE/repo-path.txt"
chmod 600 "$STABLE/repo-path.txt"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$STABLE/publish.sh</string>
    <string>--ensure-only</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORTFOLIO_SITE_REPO</key>
    <string>$ROOT</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartInterval</key>
  <integer>120</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/zhezone-site.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/zhezone-site.log</string>
  <key>WorkingDirectory</key>
  <string>$STABLE</string>
</dict>
</plist>
PLIST
chmod 600 "$PLIST"

UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
echo "Installed user LaunchAgent $LABEL"
echo "It only checks 127.0.0.1:8787 and the existing zhezone tunnel containers every 2 minutes."
echo "The watchdog script is at $STABLE/publish.sh (not the worktree)."
echo "Uninstall with: bash deploy/portfolio-site/uninstall-watchdog.sh"
