#!/usr/bin/env bash
set -euo pipefail
LABEL="com.zhangjizhe.interview-agent.zhezone-site"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST"
echo "Removed user LaunchAgent $LABEL"
