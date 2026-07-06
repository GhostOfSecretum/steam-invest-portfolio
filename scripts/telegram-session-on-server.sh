#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ -z "${TELEGRAM_PHONE:-}" ]]; then
  echo "Set TELEGRAM_PHONE before running this script." >&2
  exit 1
fi

if [[ -z "${TELEGRAM_CODE:-}" ]]; then
  echo "Set TELEGRAM_CODE after Telegram sends you the login code." >&2
  exit 1
fi

echo "Stopping steam-invest-app..."
docker compose -f "$COMPOSE_FILE" stop steam-invest-app >/dev/null

echo "Creating Telegram session through VPN..."
docker compose -f "$COMPOSE_FILE" run --rm --no-deps \
  -e TELEGRAM_PROXY_HOST=steam-invest-xray \
  -e TELEGRAM_PROXY_PORT=1080 \
  -e TELEGRAM_PHONE \
  -e TELEGRAM_CODE \
  -e TELEGRAM_PASSWORD \
  steam-invest-app npm run telegram:session | tee /tmp/telegram-session.out

SESSION="$(awk 'prev { print; exit } /^TELEGRAM_SESSION=$/ { prev=1 }' /tmp/telegram-session.out)"
if [[ -z "$SESSION" ]]; then
  echo "Could not read TELEGRAM_SESSION from script output." >&2
  exit 1
fi

export NEW_TELEGRAM_SESSION="$SESSION"
export ENV_FILE="$ENV_FILE"
python3 - <<'PY'
import os
from pathlib import Path

path = Path(os.environ["ENV_FILE"])
session = os.environ["NEW_TELEGRAM_SESSION"]
lines = path.read_text().splitlines()
out = []
replaced = False
for line in lines:
    if line.startswith("TELEGRAM_SESSION="):
        out.append(f"TELEGRAM_SESSION={session}")
        replaced = True
    else:
        out.append(line)
if not replaced:
    out.append(f"TELEGRAM_SESSION={session}")
path.write_text("\n".join(out) + "\n")
print(f"Updated {path}")
PY

echo "Starting steam-invest-app..."
docker compose -f "$COMPOSE_FILE" up -d steam-invest-app

echo "Done."
