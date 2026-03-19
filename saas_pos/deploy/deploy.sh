#!/bin/bash
set -euo pipefail

DEPLOY_DIR="/opt/deploy/saas-pos"
LOG="/opt/deploy/deploy.log"

echo "$(date): Deploy started" >> "$LOG"
cd "$DEPLOY_DIR"

git pull origin main >> "$LOG" 2>&1
docker compose -f docker-compose.prod.yml build --no-cache app caddy >> "$LOG" 2>&1
docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps app caddy >> "$LOG" 2>&1
docker image prune -f >> "$LOG" 2>&1

echo "$(date): Deploy complete" >> "$LOG"
