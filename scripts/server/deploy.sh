#!/usr/bin/env bash
# Activates a release uploaded by .github/workflows/deploy.yml (see DEPLOY.md). Runs on the
# server as the deploy user:
#
#   bash /www/wwwroot/dwaprice.com/releases/<sha>/scripts/server/deploy.sh <sha>
#
# Links shared/.env and shared/cache into the release, switches "current" to it, reloads
# PM2 and waits for /api/health to report the new commit. If it never does, "current" goes
# back to the previous release and the script exits 1. Safe to run again for the same sha;
# running it with an older sha that is still in releases/ is a manual rollback.
set -euo pipefail

APP_DIR=/www/wwwroot/dwaprice.com
# Production port, passed to PM2 (ecosystem.config.js). Port 3000 belongs to another app on
# the server. Changing it also means changing the Nginx proxy targets (DEPLOY.md, step 8).
APP_PORT=3100
HEALTH_URL="http://127.0.0.1:$APP_PORT/api/health"
HEALTH_TRIES=20 # 3 s apart
KEEP_RELEASES=5

RELEASES="$APP_DIR/releases"
SHARED="$APP_DIR/shared"
CURRENT="$APP_DIR/current"

log() { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() {
  log "ERROR: $*"
  exit 1
}

SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || die "usage: deploy.sh <git-sha>"
RELEASE="$(readlink -e "$RELEASES/$SHA")" || die "$RELEASES/$SHA does not exist (upload the release first)"
[ -f "$RELEASE/server.js" ] || die "$RELEASE/server.js not found: incomplete upload?"
[ -f "$SHARED/.env" ] || die "$SHARED/.env is missing (one-time server setup in DEPLOY.md)"

# Non-interactive SSH sessions skip ~/.bashrc: load nvm if Node was installed with it.
if ! command -v pm2 >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi
command -v pm2 >/dev/null 2>&1 || die "pm2 is not on PATH (DEPLOY.md: install Node and PM2)"

# One deploy at a time: a CI run and a manual run could otherwise race.
exec 9>"$APP_DIR/.deploy.lock"
flock -w 600 9 || die "another deploy is still running"

mkdir -p "$SHARED/cache" "$SHARED/logs"

# The release uses the production .env and the shared Next cache (.next/cache: unstable_cache
# data and optimised images), so both survive every deploy.
ln -sfn "$SHARED/.env" "$RELEASE/.env"
if [ -e "$RELEASE/.next/cache" ] && [ ! -L "$RELEASE/.next/cache" ]; then
  rm -rf "$RELEASE/.next/cache"
fi
ln -sfn "$SHARED/cache" "$RELEASE/.next/cache"

# Points "current" at a release (rename over the old link, so the switch is atomic) and
# reloads PM2. A failed reload is left to the health check, which then rolls back.
# 9>&-: pm2 may start its daemon here, which must not inherit (and keep) the deploy lock.
activate() {
  ln -sfn "$1" "$APP_DIR/.current.tmp"
  mv -Tf "$APP_DIR/.current.tmp" "$CURRENT"
  touch "$1" # newest first when pruning
  APP_PORT="$APP_PORT" pm2 startOrReload "$1/ecosystem.config.js" --update-env 9>&- || log "pm2 reload failed"
  pm2 save 9>&- >/dev/null || log "pm2 save failed"
}

# True once /api/health answers 200 with this commit (the new worker, not the old one).
healthy() {
  local body i
  for ((i = 1; i <= HEALTH_TRIES; i++)); do
    if body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)" && [[ "$body" == *"\"commit\":\"$1"* ]]; then
      return 0
    fi
    sleep 3
  done
  return 1
}

PREVIOUS="$(readlink -e "$CURRENT" || true)"
log "activating $SHA (previous: $(basename "${PREVIOUS:-none}"))"
activate "$RELEASE"

if ! healthy "$SHA"; then
  log "health check failed: $HEALTH_URL did not report commit $SHA"
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$RELEASE" ] && [ -f "$PREVIOUS/server.js" ]; then
    log "rolling back to $(basename "$PREVIOUS")"
    activate "$PREVIOUS"
    if healthy "$(basename "$PREVIOUS")"; then
      log "rollback is healthy"
    else
      log "rollback is not healthy either: check pm2 logs dwaprice"
    fi
  else
    log "no previous release to roll back to"
  fi
  exit 1
fi
log "$SHA is live"

# Keep the newest releases; never remove the live one.
live="$(readlink -e "$CURRENT")"
n=0
for dir in $(ls -1dt "$RELEASES"/*/); do
  dir="$(readlink -e "$dir")"
  n=$((n + 1))
  if [ "$n" -le "$KEEP_RELEASES" ] || [ "$dir" = "$live" ]; then continue; fi
  log "removing old release $(basename "$dir")"
  rm -rf -- "$dir"
done
