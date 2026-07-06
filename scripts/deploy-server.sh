#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Pull latest code"
git pull origin main

echo "==> Rebuild and start (from $ROOT_DIR)"
docker compose up -d --build

echo "==> Status"
docker compose ps

echo "==> Health"
curl -sf "http://127.0.0.1:${PORT:-3000}/api/health" && echo
