#!/usr/bin/env bash
# Deploys the current branch to production via docker compose.
#
# Unlike sfa-backend, there's no database here — this is a stateless Next.js
# app, so this script is just: pull latest, rebuild the "admin" image, restart
# the container. NEXT_PUBLIC_API_URL is baked in at build time (see Dockerfile/
# docker-compose.yml), so it's read from .env in this directory as usual.
#
# Usage: ./scripts/deploy.sh [branch]   (defaults to "main")
set -euo pipefail

BRANCH="${1:-main}"
COMPOSE="${COMPOSE_CMD:-docker compose}"   # set COMPOSE_CMD=docker-compose if this server uses the standalone binary
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "==> Checking working tree is clean"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree has uncommitted changes. Commit or stash before deploying." >&2
  git status --short
  exit 1
fi

echo "==> Fetching and checking out $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
COMMIT="$(git rev-parse --short HEAD)"
echo "==> Deploying commit $COMMIT"

echo "==> Building admin image"
$COMPOSE build admin

echo "==> Restarting admin service"
$COMPOSE up -d --no-deps admin

echo "==> Waiting for admin to report running (up to ~60s)..."
STARTED=false
for _ in $(seq 1 20); do
  if $COMPOSE ps admin 2>&1 | grep -qi "running\|up"; then
    STARTED=true
    break
  fi
  sleep 3
done

if [[ "$STARTED" != "true" ]]; then
  echo "ERROR: admin container did not report running within the timeout. Recent logs:" >&2
  $COMPOSE logs admin --tail=100 >&2
  exit 1
fi

echo "==> Recent logs:"
$COMPOSE logs admin --tail=30

echo "==> Deploy of $COMMIT complete."
