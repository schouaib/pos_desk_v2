# Scalability Audit & Improvement Roadmap

## Context

The SaaS POS is deployed on a single VPS with Docker (Caddy + Go + MongoDB). As tenants and traffic grow, several bottlenecks will surface. This document addresses them in priority order — highest-impact, lowest-effort fixes first.

---

## Phase 1: Critical Fixes (Day 1)

### 1.1 Add Missing Database Indexes
**Files:** `internal/database/indexes.go`

Sales, purchases, expenses, losses, and retraits collections have no indexes but are queried with `(tenant_id, created_at)` filters constantly. This causes full collection scans.

Add indexes:
- `sales`: `(tenant_id, created_at)`
- `purchases`: `(tenant_id, status, created_at)`, `(tenant_id, supplier_id, status)`
- `expenses`: `(tenant_id, created_at)`
- `stock_losses`: `(tenant_id, created_at)`, `(tenant_id, product_id)`
- `retraits`: `(tenant_id, created_at)`

### 1.2 Fix N+1 Queries
**Files:** `internal/purchase/service.go`, `internal/sale/service.go`, `internal/supplier/service.go`

- **Purchase creation** (`buildLines()`): Fetches each product individually per line. 50-line purchase = 50 DB queries. Fix: batch fetch all product IDs with a single `Find()` + `$in`.
- **Sale creation**: Same N+1 pattern per sale line. Fix: same batch approach.
- **Supplier payment** (`PayBalance()`): Updates each purchase individually in a loop. Fix: use `BulkWrite()`.

### 1.3 Cache TenantActiveGuard
**File:** `internal/middleware/tenant_guard.go`

Currently runs a `FindOne()` on the tenants collection for **every single API request**. At 1000 concurrent users = 1000 extra queries/sec.

Fix: Cache tenant active status in-memory with a 5-minute TTL using a simple `sync.Map` + expiry. No Redis needed yet.

### 1.4 Add Rate Limiting
**File:** `cmd/server/main.go`

No rate limiting exists anywhere. Add Fiber's `limiter` middleware:
- Login endpoints: 10 req/min per IP
- File upload: 20 req/min per tenant
- General API: 100 req/min per IP

### 1.5 Fix Goroutine Leak
**File:** `cmd/server/main.go`

`time.Tick()` creates a goroutine that never gets garbage collected. Replace with `time.NewTicker()` + context cancellation for graceful shutdown.

---

## Phase 2: Performance Hardening (Day 2-3)

### 2.1 Add Cache Headers in Caddyfile
**File:** `Caddyfile`

Static assets have no cache headers — browsers re-download everything on each visit.

```caddy
handle /admin/assets/* {
    header Cache-Control "public, immutable, max-age=31536000"
    uri strip_prefix /admin
    root * /srv/admin
    file_server
}
handle /tenant/assets/* {
    header Cache-Control "public, immutable, max-age=31536000"
    uri strip_prefix /tenant
    root * /srv/tenant
    file_server
}
```

Vite hashes asset filenames, so immutable caching is safe.

### 2.2 Add Pagination to Unbounded Queries
**Files:** `internal/user/service.go`, `internal/tenant/service.go`

Both `ListByTenant()` and `List()` fetch ALL records into memory with no limit. Add `page` + `limit` parameters (max 50).

### 2.3 Add Request Timeouts
**File:** `cmd/server/main.go`

No global timeouts configured. Add to Fiber config:
```go
app := fiber.New(fiber.Config{
    ReadTimeout:  15 * time.Second,
    WriteTimeout: 15 * time.Second,
    IdleTimeout:  60 * time.Second,
})
```

### 2.4 Fix Missing Context Timeouts
**Files:** `internal/expense/service.go`, `internal/loss/service.go`, `internal/retrait/service.go`

Several services use `context.Background()` instead of timeout contexts. Replace with `context.WithTimeout(ctx, 5*time.Second)` consistently.

### 2.5 Add Go Compression Middleware
**File:** `cmd/server/main.go`

Caddy compresses frontend responses but API responses from Go bypass Caddy's compression since they're proxied. Add Fiber's `compress` middleware for API JSON responses.

---

## Phase 3: Production Hardening (Day 4-5)

### 3.1 Docker Resource Limits & Health Checks
**File:** `docker-compose.prod.yml`

No resource limits or health checks exist. Add:
```yaml
app:
  deploy:
    resources:
      limits:
        memory: 512M
        cpus: "1.0"
  healthcheck:
    test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/plans"]
    interval: 30s
    timeout: 10s
    retries: 3

caddy:
  deploy:
    resources:
      limits:
        memory: 256M

mongo:
  deploy:
    resources:
      limits:
        memory: 1G
```

### 3.2 Zero-Downtime Deploy
**File:** `deploy/deploy.sh`

Current script kills containers immediately (`--force-recreate`). Improve:
1. Build new images first
2. Start new containers
3. Wait for health check to pass
4. Remove old containers
5. Keep previous image for rollback

### 3.3 Deploy Rollback Script
**New file:** `deploy/rollback.sh`

Tag images before deploy, keep one previous version. Rollback script restores previous image and restarts.

---

## Phase 4: Scale-Ready Architecture (Future)

These aren't urgent but prepare for growth beyond a single VPS:

### 4.1 Add Redis for Caching
- Tenant status cache (replace in-memory)
- Session management
- Rate limiting state (distributed)
- Plans/categories/brands cache

### 4.2 CDN for Static Assets
- Move frontend assets to Cloudflare CDN or similar
- Reduces VPS bandwidth, improves global latency

### 4.3 MongoDB Replica Set
- Read replicas for stats/reporting queries
- Automatic failover
- Point-in-time backup

### 4.4 Horizontal Scaling
- Multiple app containers behind Caddy load balancer
- Requires Redis for shared state (sessions, rate limits)
- MongoDB connection pool tuning

### 4.5 Background Job Queue
- Replace goroutine-based plan expiry with a proper job queue
- Enable async processing for bulk imports, report generation

---

## Priority Summary

| Phase | Items | Effort | Impact |
|-------|-------|--------|--------|
| **Phase 1** | Indexes, N+1, cache guard, rate limit, goroutine fix | 1 day | Eliminates worst bottlenecks |
| **Phase 2** | Cache headers, pagination, timeouts, compression | 1-2 days | 2-3x response speed improvement |
| **Phase 3** | Resource limits, health checks, zero-downtime | 1-2 days | Production reliability |
| **Phase 4** | Redis, CDN, replicas, horizontal scaling | As needed | Multi-VPS scale |

---

## Verification

After each phase:
1. Load test with `wrk` or `hey`: `hey -n 1000 -c 50 https://saas-pos.duckdns.org/api/plans`
2. Check MongoDB query performance: `db.sales.find({...}).explain("executionStats")`
3. Monitor container resources: `docker stats`
4. Verify cache headers: `curl -I https://saas-pos.duckdns.org/tenant/assets/index-xxx.js`
5. Test rate limiting: rapid-fire login requests
6. Deploy test: push a change, verify zero-downtime via continuous `curl` during deploy

---

## Why Not Kubernetes?

### Current State
- Single VPS, 3 containers (Caddy + Go + MongoDB)
- Small team, early stage
- ~$5/month hosting cost

### What K8s Would Add
- **Complexity**: YAML manifests, ingress controllers, secrets management, networking, persistent volumes, RBAC
- **Cost**: K8s control plane needs ~2GB RAM minimum just for itself. You'd need a bigger VPS or a managed K8s service ($40-75/month vs current ~$5/month)
- **Ops overhead**: Cluster upgrades, node management, monitoring stack (Prometheus/Grafana)

### When K8s Makes Sense
- 10+ microservices needing orchestration
- Multiple replicas of each service for high availability
- Auto-scaling based on traffic spikes
- Multi-region deployment
- Team of 3+ engineers managing infrastructure

### Recommended Scaling Path Instead

| Stage | Trigger | Action | Cost |
|-------|---------|--------|------|
| **Now** | Current | Single VPS + Docker Compose | ~$5/month |
| **Growth** | ~500 concurrent users | Add second VPS + **Docker Swarm** | ~$10/month |
| **Scale** | ~5000+ users or multi-region | Managed K8s (DigitalOcean, GKE) | $40-75/month |

### Why Docker Swarm Before K8s

Docker Swarm gives 80% of K8s benefits with 10% of the complexity:
- **Rolling deploys** — zero-downtime updates out of the box
- **Auto-restart** — failed containers automatically restarted
- **Service scaling** — `docker service scale app=3` to run 3 instances
- **Load balancing** — built-in ingress routing mesh
- **Uses existing compose files** — `docker stack deploy -c docker-compose.prod.yml saas-pos`
- **Zero learning curve** — if you know Docker Compose, you know Swarm

K8s is the right tool when Swarm's limitations are hit (complex scheduling, custom autoscaling policies, service mesh, multi-cloud). For a SaaS POS with < 5000 users, that day is far away.
