#!/bin/sh
set -eu
state="$HOME/.cache/repo-maintenance"
mkdir -p "$state"
chmod 700 "$state"
if ! command -v flock >/dev/null 2>&1; then
  printf '%s\n' '{"status":"failed","message":"flock indisponível"}'
  exit 1
fi
exec 9>"$state/fleet.lock"
if ! flock -n 9; then
  printf '%s\n' '{"status":"skipped_busy","message":"Trava global ocupada"}'
  exit 75
fi
exec node "$(dirname "$0")/run.mjs" "$@"
