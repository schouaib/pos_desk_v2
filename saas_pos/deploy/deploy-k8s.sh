#!/bin/bash
set -euo pipefail

DEPLOY_DIR="/opt/deploy/saas-pos"
LOG="/opt/deploy/deploy.log"
BRANCH="${DEPLOY_BRANCH:-main}"
TAG="$(date +%Y%m%d%H%M%S)"

echo "$(date): Deploy started (branch: $BRANCH, tag: $TAG)" >> "$LOG"
cd "$DEPLOY_DIR"

# Pull latest code
git fetch origin >> "$LOG" 2>&1
git checkout "$BRANCH" >> "$LOG" 2>&1
git pull origin "$BRANCH" >> "$LOG" 2>&1

# Build images with Docker
TURNSTILE_KEY="${VITE_TURNSTILE_SITE_KEY:-}"
docker build --target app -t saas-pos-app:$TAG -t saas-pos-app:latest . >> "$LOG" 2>&1
docker build --target caddy --build-arg VITE_TURNSTILE_SITE_KEY="$TURNSTILE_KEY" -t saas-pos-caddy:$TAG -t saas-pos-caddy:latest . >> "$LOG" 2>&1

# Import images into containerd (kubeadm runtime)
docker save saas-pos-app:$TAG | ctr -n k8s.io images import - >> "$LOG" 2>&1
docker save saas-pos-caddy:$TAG | ctr -n k8s.io images import - >> "$LOG" 2>&1

# Rolling update: set new image tag on deployments
kubectl -n saas-pos set image deployment/app app=saas-pos-app:$TAG >> "$LOG" 2>&1
kubectl -n saas-pos set image deployment/caddy caddy=saas-pos-caddy:$TAG >> "$LOG" 2>&1

# Wait for rollout to complete
kubectl -n saas-pos rollout status deployment/app --timeout=120s >> "$LOG" 2>&1
kubectl -n saas-pos rollout status deployment/caddy --timeout=120s >> "$LOG" 2>&1

# Cleanup old Docker images (keep latest)
docker image prune -f >> "$LOG" 2>&1

echo "$(date): Deploy complete (branch: $BRANCH, tag: $TAG)" >> "$LOG"
