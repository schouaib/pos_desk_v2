# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

### Backend (Go)
```bash
go run ./cmd/server              # Run dev server (port 3000)
go build -o server ./cmd/server  # Build binary
```

### Frontend - Admin Panel (`web/admin/`)
```bash
npm install && npm run dev       # Dev server (proxies /api to :3000)
npm run build                    # Production build → dist/
```

### Frontend - Tenant Panel (`web/tenant/`)
```bash
npm install && npm run dev       # Dev server on :5174
npm run build                    # Production build → dist/
```

### Docker
```bash
docker-compose up                # Full stack: Go app (:3000) + MongoDB (:27017)
```

### No test or lint commands are configured.

## Architecture

**Multi-tenant SaaS POS** with three-tier user model: Super Admin → Tenant Admin → Cashier.

### Tech Stack
- **Backend**: Go 1.24 + Fiber v2 + MongoDB
- **Frontend**: Two separate Preact SPAs (admin + tenant) with Tailwind CSS + DaisyUI
- **Auth**: JWT with role-based access + granular per-module permissions for cashiers
- **State**: @preact/signals

### Backend Structure (`internal/`)
Each domain module follows the pattern: `handler.go` (HTTP handlers), `model.go` (structs/DTOs), `service.go` (business logic + DB).

Modules: `signup`, `subscription`, `superadmin`, `tenant`, `user`, `product`, `category`, `brand`, `unit`, `purchase`, `supplier`, `loss`.

Shared packages in `pkg/`: `jwt` (token generation/parsing), `response` (standard JSON helpers).

### Route Layout
- `/api/super-admin/*` — Platform management (Auth + RequireRole("super_admin"))
- `/api/tenant/*` — Store operations (Auth + RequireRole + TenantActiveGuard)
- Public: `/api/signup`, `/api/plans`, `/api/tenant/auth/login`

Static serving: `/admin` → admin SPA, `/tenant` → tenant SPA, `/uploads` → uploaded files.

### Middleware Chain
`Auth()` → `RequireRole(roles...)` → `RequirePermission(module, action)` → `TenantActiveGuard()`

Cashier permissions are per-module (products, categories, brands, units, purchases, suppliers) with actions: view, add, edit, delete, plus module-specific ones (movement, loss, validate, pay).

### Database
MongoDB with no migration files — indexes are created programmatically on startup via `database.EnsureIndexes()`. All tenant-scoped documents carry `tenant_id` for data isolation.

### Response Format
```json
{"success": true, "data": {...}}
{"success": false, "error": "message"}
```

### Environment Variables
Loaded from `.env` via godotenv with defaults: `APP_PORT` (3000), `MONGO_URI` (mongodb://localhost:27017), `MONGO_DB` (saas_pos), `JWT_SECRET` (secret), `JWT_EXPIRES_IN` (24h).

### Entry Point
`cmd/server/main.go` — registers all routes, connects to DB, starts background plan-expiry job (hourly).

### Frontend Conventions
Both SPAs use: `pages/` for route components, `components/` for shared UI, `lib/` for API calls, auth helpers, and i18n. Routing via preact-router.
