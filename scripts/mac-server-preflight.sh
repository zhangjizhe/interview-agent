#!/bin/sh
# Read-only host summary. No installation, configuration, credentials or backups.
set -u

printf 'preflight_version=1\n'
printf 'host_os=%s\n' "$(uname -s)"
printf 'cpu_arch=%s\n' "$(uname -m)"
if command -v sw_vers >/dev/null 2>&1; then
  printf 'macos_version=%s\n' "$(sw_vers -productVersion)"
  server_memory_bytes=$(sysctl -n hw.memsize 2>/dev/null || printf 0)
  case "$server_memory_bytes" in
    ''|0|*[!0-9]*) printf 'host_memory_gib=unknown\n' ;;
    *) printf 'host_memory_gib=%s\n' "$((server_memory_bytes / 1073741824))" ;;
  esac
else
  printf 'macos_version=not_macos\n'
fi
df -Pk / | awk 'NR == 2 {printf "root_available_gib=%.1f\n", $4 / 1048576}'

if command -v docker >/dev/null 2>&1; then
  printf 'docker_cli=installed\n'
  docker --version 2>/dev/null || printf 'docker_version=unavailable\n'
  if docker compose version --short >/dev/null 2>&1; then
    printf 'compose_version=%s\n' "$(docker compose version --short)"
  else
    printf 'compose_version=unavailable\n'
  fi
else
  printf 'docker_cli=not_installed\n'
fi
printf 'scope=host_and_client_only; daemon, application and remote access not verified\n'
