#!/bin/sh
set -eu
cd "$(git rev-parse --show-toplevel)"
exec node scripts/automation.mjs nightly --ref origin/main
