# SaaS POS — Technical Documentation

A comprehensive guide for engineers joining this project. Covers architecture, modules, API endpoints, data models, and frontend applications.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Authentication & Authorization](#authentication--authorization)
5. [Database](#database)
6. [Backend Modules](#backend-modules)
   - [Super Admin](#1-super-admin-module)
   - [Subscription Plans](#2-subscription-plans-module)
   - [Tenant (Store)](#3-tenant-module)
   - [Signup](#4-signup-module)
   - [Users](#5-user-module)
   - [Products](#6-product-module)
   - [Categories](#7-category-module)
   - [Brands](#8-brand-module)
   - [Units](#9-unit-module)
   - [Suppliers](#10-supplier-module)
   - [Purchases](#11-purchase-module)
   - [Stock Losses](#12-stock-loss-module)
7. [Frontend Applications](#frontend-applications)
   - [Admin Panel](#admin-panel)
   - [Tenant Panel](#tenant-panel)
8. [API Route Summary](#api-route-summary)
9. [Environment & Configuration](#environment--configuration)

---

## Overview

This is a **multi-tenant SaaS Point-of-Sale system**. Multiple stores can sign up, subscribe to a plan, and manage their inventory, purchases, suppliers, and staff — all isolated from each other.

**Three user tiers:**

| Role | Scope | Access |
|------|-------|--------|
| **Super Admin** | Platform-wide | Manages plans, tenants, and other super admins |
| **Tenant Admin** | Single store | Full access to their store's data, settings, and staff |
| **Cashier** | Single store | Restricted by granular per-module permissions |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.24 + Fiber v2 |
| Database | MongoDB |
| Auth | JWT (golang-jwt/jwt v5) + bcrypt passwords |
| Frontend | Preact 10.19 + @preact/signals |
| Styling | Tailwind CSS 3.4 + DaisyUI 4.7 |
| Build | Vite 5.1 (frontends), Docker multi-stage (backend) |
| Barcode | JsBarcode 3.12 (tenant frontend only) |

---

## Architecture

### Backend Pattern

Each domain module in `internal/` follows a three-file structure:

| File | Purpose |
|------|---------|
| `handler.go` | HTTP endpoint handlers — parses input, calls service, returns response |
| `model.go` | Data structures (DB models) and input DTOs |
| `service.go` | Business logic and database operations |

Shared packages live in `pkg/`:
- `pkg/jwt` — Token generation and parsing
- `pkg/response` — Standardized JSON response helpers

### Response Format

All API responses follow this shape:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "error message" }

// Paginated list
{ "success": true, "data": { "items": [...], "total": 150, "page": 1, "limit": 10, "pages": 15 } }
```

### Multi-Tenancy

Tenant isolation is enforced at the database level:
- Every tenant-scoped document carries a `tenant_id` field
- All queries filter by the authenticated user's `tenant_id` (extracted from JWT)
- Compound unique indexes prevent cross-tenant data collisions (e.g., same email in different stores is allowed)

### Static File Serving

The Go server serves both frontends and uploaded files:
- `/admin` → `./web/admin/dist` (super admin SPA)
- `/tenant` → `./web/tenant/dist` (tenant SPA)
- `/uploads` → `./uploads` (logos, product images)

---

## Authentication & Authorization

### JWT Claims

```go
Claims {
  ID          string          // User or admin ID
  Email       string
  Role        string          // "super_admin" | "tenant_admin" | "cashier"
  TenantID    string          // Empty for super_admin
  Permissions Permissions     // Module-level permissions (cashier only)
}
```

### Middleware Chain

Requests flow through these middlewares (applied per route group):

```
Auth() → RequireRole(...) → RequirePermission(module, action) → TenantActiveGuard()
```

| Middleware | What it does |
|-----------|-------------|
| `Auth()` | Validates Bearer token, extracts claims into context |
| `RequireRole(roles...)` | Allows only specified roles (403 otherwise) |
| `RequirePermission(module, action)` | Checks cashier permissions; tenant_admin always passes |
| `TenantActiveGuard()` | Verifies tenant is active and subscription is not expired (returns 402 if expired) |

### Permission System

Cashier permissions are per-module with these possible actions:

| Module | view | add | edit | delete | movement | loss | validate | pay |
|--------|:----:|:---:|:----:|:------:|:--------:|:----:|:--------:|:---:|
| products | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| categories | ✓ | ✓ | ✓ | ✓ | | | | |
| brands | ✓ | ✓ | ✓ | ✓ | | | | |
| units | ✓ | ✓ | ✓ | ✓ | | | | |
| purchases | ✓ | ✓ | ✓ | ✓ | | | ✓ | ✓ |
| suppliers | ✓ | ✓ | ✓ | ✓ | | | | ✓ |

Tenant admins bypass all permission checks.

### Background Job — Plan Expiry

A goroutine in `main.go` runs on startup and then hourly:
- Finds tenants where `plan_expires_at < now`
- Sets their `active` flag to `false`
- Affected users get HTTP 402 on their next request

---

## Database

**Engine:** MongoDB (no SQL migrations — indexes created programmatically on startup via `database.EnsureIndexes()`)

### Collections & Key Indexes

| Collection | Notable Indexes |
|-----------|----------------|
| `super_admins` | Unique on `email` |
| `subscription_plans` | Compound on `(active, price)` |
| `tenants` | Unique on `email` |
| `users` | Unique on `(tenant_id, email)` |
| `products` | Compound on `(tenant_id, created_at)`, `(tenant_id, name)`, `(tenant_id, barcodes)` |
| `categories` | Unique on `(tenant_id, name)` |
| `brands` | Unique on `(tenant_id, name)` |
| `units` | Unique on `(tenant_id, name)` |
| `purchases` | Indexed on `(tenant_id, created_at)` |
| `suppliers` | Indexed on `(tenant_id, name)` |
| `losses` | Indexed on `(tenant_id, created_at)` |

### Connection Pool
- Min: 2, Max: 20 connections
- Connection timeout: 10 seconds

---

## Backend Modules

### 1. Super Admin Module

**Location:** `internal/superadmin/`

**Data Model:**
```
SuperAdmin { ID, Name, Email, Password (bcrypt), Active, CreatedAt, UpdatedAt }
```

**Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/super-admin/setup-status` | None | Returns `{ needs_setup: bool }` — true if no admins exist |
| POST | `/api/super-admin/setup` | None | First-time setup: creates the first super admin. Blocked if any admin exists |
| POST | `/api/super-admin/login` | None | Returns `{ token, admin }` |
| POST | `/api/super-admin/admins` | super_admin | Register additional admin (name, email, password) |
| GET | `/api/super-admin/admins` | super_admin | List all admins |
| PATCH | `/api/super-admin/admins/:id/active` | super_admin | Toggle admin active status `{ active: bool }` |

---

### 2. Subscription Plans Module

**Location:** `internal/subscription/`

**Data Model:**
```
Plan { ID, Name, Description, Price, MaxUsers, MaxProducts, Active, CreatedAt, UpdatedAt }
```

`MaxUsers` and `MaxProducts` of `0` means unlimited.

**Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/plans` | None | List active plans (sorted by price ascending) — used in signup |
| POST | `/api/super-admin/plans` | super_admin | Create plan |
| GET | `/api/super-admin/plans` | super_admin | List all plans (active + inactive) |
| GET | `/api/super-admin/plans/:id` | super_admin | Get single plan |
| PUT | `/api/super-admin/plans/:id` | super_admin | Update plan |
| PATCH | `/api/super-admin/plans/:id/active` | super_admin | Toggle plan active status |

---

### 3. Tenant Module

**Location:** `internal/tenant/`

**Data Model:**
```
Tenant {
  ID, Name, Email, Phone, Address,
  LogoURL, BrandColor (default: #3b82f6), Currency (default: DZD),
  RC, NIF, NIS, NART, CompteRIB,          // Legal/fiscal fields (Algerian business)
  PlanID, Active, SubscribedAt, PlanExpiresAt,
  CreatedAt, UpdatedAt
}
```

**Endpoints — Super Admin:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/super-admin/tenants` | super_admin | Create tenant (name, email, plan_id required) |
| GET | `/api/super-admin/tenants` | super_admin | List all tenants |
| GET | `/api/super-admin/tenants/:id` | super_admin | Get single tenant |
| PUT | `/api/super-admin/tenants/:id` | super_admin | Update tenant (name, phone, brand_color, plan_id, plan_expires_at) |
| PATCH | `/api/super-admin/tenants/:id/active` | super_admin | Toggle tenant active status |

**Endpoints — Tenant Panel:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tenant/settings` | tenant_admin | Get store settings |
| PUT | `/api/tenant/settings` | tenant_admin | Update settings (name, phone, address, logo_url, currency, fiscal fields) |
| POST | `/api/tenant/settings/upload-logo` | tenant_admin | Upload logo (webp/jpeg/png, max 2MB). Returns `{ url }` |

**Logo storage:** `./uploads/{tenant_id}/logo/{filename}.{ext}`

---

### 4. Signup Module

**Location:** `internal/signup/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/signup` | None | Create tenant + admin user in one step |

**Request body:**
```json
{
  "store_name": "My Store",
  "email": "admin@store.com",
  "password": "min8chars",
  "phone": "+1234567890",
  "brand_color": "#3b82f6",
  "plan_id": "ObjectID"
}
```

**What happens:**
1. Validates plan exists and is active
2. Creates tenant (`active: false`)
3. Creates tenant_admin user (`active: false`)
4. Returns JWT token for immediate login
5. If user creation fails, rolls back (deletes the tenant)

Both tenant and user start inactive — the super admin must activate them.

---

### 5. User Module

**Location:** `internal/user/`

**Data Model:**
```
User {
  ID, TenantID, Name, Email, Password (bcrypt),
  Role ("tenant_admin" | "cashier"),
  Permissions { Products, Categories, Brands, Units, Purchases, Suppliers },
  Active, CreatedAt, UpdatedAt
}
```

**Endpoints — Tenant:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/tenant/auth/login` | None | Login: validates user, tenant active, plan not expired. Returns `{ token, user }` |
| GET | `/api/tenant/auth/me` | Any tenant role | Returns current user info from JWT |
| POST | `/api/tenant/users/` | tenant_admin | Create user (name, email, password, role, permissions) |
| GET | `/api/tenant/users/` | tenant_admin | List tenant users |
| GET | `/api/tenant/users/:id` | tenant_admin | Get single user |
| PUT | `/api/tenant/users/:id` | tenant_admin | Update user (name, role, permissions — not email/password) |
| PATCH | `/api/tenant/users/:id/active` | tenant_admin | Toggle user active status |

**Endpoints — Super Admin:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/super-admin/tenants/:tenantId/users` | super_admin | List users of a tenant |
| PATCH | `/api/super-admin/tenants/:tenantId/users/:id/active` | super_admin | Toggle user active |

**Login validation order:** email exists → password matches → user active → tenant exists → tenant active → plan not expired.

---

### 6. Product Module

**Location:** `internal/product/`

**Data Model:**
```
Product {
  ID, TenantID, Name, Barcodes []string,
  CategoryID, BrandID, UnitID,
  Ref, Abbreviation,
  QtyAvailable, QtyMin,
  PrixAchat,                          // Cost price
  PrixVente1, PrixVente2, PrixVente3, // Three sale price tiers
  PrixMinimum,                        // Floor price
  VAT (0-100),
  IsService,                          // If true, no stock tracking
  ImageURL,
  CreatedAt, UpdatedAt
}

Movement {
  Date, Type ("purchase"|"loss"), Qty, PrixAchat, Reference, SupplierName
}
```

**Endpoints:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/tenant/products?q=&page=&limit=` | products/view | List products (search by name regex or exact barcode) |
| POST | `/api/tenant/products/` | products/add | Create product |
| GET | `/api/tenant/products/:id` | products/view | Get single product |
| PUT | `/api/tenant/products/:id` | products/edit | Update product (cannot change qty — managed by purchases/losses) |
| DELETE | `/api/tenant/products/:id` | products/delete | Delete product |
| POST | `/api/tenant/products/upload-image` | products/add | Upload image (webp/jpeg/png, max 1MB). Returns `{ url }` |
| GET | `/api/tenant/products/:id/movements?page=&limit=&date_from=&date_to=` | products/movement | List stock movements (purchases + losses combined) |

**Key rules:**
- Barcodes must be unique per tenant
- VAT is clamped to 0–100
- Stock quantity is only modified by purchase validation and stock loss recording
- Image storage: `./uploads/{tenant_id}/products/{filename}.{ext}`
- List pagination: default limit 10, max 25
- Movement pagination: default limit 20, max 50

---

### 7. Category Module

**Location:** `internal/category/`

```
Category { ID, TenantID, Name (unique per tenant), CreatedAt, UpdatedAt }
```

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/tenant/categories?q=&page=&limit=` | categories/view | List (sorted by name, max limit 500) |
| POST | `/api/tenant/categories/` | categories/add | Create |
| PUT | `/api/tenant/categories/:id` | categories/edit | Update |
| DELETE | `/api/tenant/categories/:id` | categories/delete | Delete |

---

### 8. Brand Module

**Location:** `internal/brand/`

```
Brand { ID, TenantID, Name (unique per tenant), CreatedAt, UpdatedAt }
```

Same CRUD pattern as categories: `GET/POST/PUT/DELETE` on `/api/tenant/brands`.

---

### 9. Unit Module

**Location:** `internal/unit/`

```
Unit { ID, TenantID, Name (unique per tenant), CreatedAt, UpdatedAt }
```

Same CRUD pattern: `GET/POST/PUT/DELETE` on `/api/tenant/units`.

---

### 10. Supplier Module

**Location:** `internal/supplier/`

**Data Model:**
```
Supplier { ID, TenantID, Name, Phone, Address, Balance, CreatedAt, UpdatedAt }
```

**Endpoints:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/tenant/suppliers?q=&page=&limit=` | suppliers/view | List (search in name, phone, address) |
| POST | `/api/tenant/suppliers/` | suppliers/add | Create |
| PUT | `/api/tenant/suppliers/:id` | suppliers/edit | Update (name, phone, address — not balance) |
| DELETE | `/api/tenant/suppliers/:id` | suppliers/delete | Delete |
| PATCH | `/api/tenant/suppliers/:id/balance` | suppliers/edit | Manual balance adjustment `{ amount }` (positive or negative, uses `$inc`) |
| POST | `/api/tenant/suppliers/:id/pay` | suppliers/pay | Pay supplier `{ amount }` |

**Payment logic:**
- Distributes payment across unpaid/partial purchases (oldest first)
- Updates each purchase's `paid_amount` and status
- Subtracts from supplier balance
- Amount cannot exceed total remaining balance across all unpaid purchases

---

### 11. Purchase Module

**Location:** `internal/purchase/`

**Data Model:**
```
Purchase {
  ID, TenantID, SupplierID, SupplierName, Status,
  Lines []PurchaseLine, Total, PaidAmount, Note,
  CreatedAt, UpdatedAt, ValidatedAt
}

PurchaseLine {
  ProductID, ProductName, Qty, PrixAchat, PrixVente1, PrixVente2, PrixVente3
}
```

**Purchase Lifecycle:**

```
Draft ──(validate)──> Validated ──(pay)──> Paid
  │                       │
  ├─ Can edit             ├─ Stock updated
  ├─ Can delete           ├─ Supplier balance increased
  └─ No stock impact      └─ Can record payments
```

**Endpoints:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/tenant/purchases?page=&limit=&supplier_id=&status=&q=&date_from=&date_to=` | purchases/view | List (without lines, for performance) |
| POST | `/api/tenant/purchases/` | purchases/add | Create (status=draft) |
| GET | `/api/tenant/purchases/:id` | purchases/view | Get with full lines |
| PUT | `/api/tenant/purchases/:id` | purchases/edit | Update (draft only) |
| DELETE | `/api/tenant/purchases/:id` | purchases/delete | Delete (draft only) |
| POST | `/api/tenant/purchases/:id/validate` | purchases/validate | Validate: updates stock and prices |
| POST | `/api/tenant/purchases/:id/pay` | purchases/pay | Record payment `{ amount }` |

**Validation logic (what happens when a purchase is validated):**

For each line:
1. Fetch current product quantity and cost price
2. Calculate **prix moyen pondéré** (weighted average cost):
   ```
   new_cost = (old_qty × old_cost + incoming_qty × incoming_cost) / (old_qty + incoming_qty)
   ```
3. Update product: `qty_available += line.qty`, `prix_achat = new_cost`
4. Update sale prices if non-zero in the purchase line
5. Add purchase total to `supplier.balance`
6. Set purchase status to `"validated"`, record `validated_at`

**Payment logic:**
- Adds to `paid_amount`
- If `paid_amount >= total`, sets status to `"paid"`
- Subtracts from `supplier.balance`

---

### 12. Stock Loss Module

**Location:** `internal/loss/`

**Data Model:**
```
StockLoss { ID, TenantID, ProductID, ProductName, Barcode, Type, Qty, Remark, CreatedAt }
```

**Loss types:** `"vol"` (theft), `"perte"` (waste/expiry), `"casse"` (breakage)

**Endpoints:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/api/tenant/losses` | products/loss | Record loss (immediately decrements product qty) |
| GET | `/api/tenant/losses?search=&from=&to=&page=&limit=` | products/loss | List losses (default: last 30 days, max 25/page) |

**Request body for recording:**
```json
{
  "product_id": "ObjectID",
  "type": "casse",
  "qty": 5,
  "remark": "Broken during delivery"
}
```

Losses are permanent — there is no reversal mechanism.

---

## Frontend Applications

Both frontends are independent Preact SPAs with the same internal structure:

```
src/
├── app.jsx          # Router setup, auth guard, plan-expiry handling
├── main.jsx         # Entry point, renders App
├── index.css        # Tailwind imports
├── pages/           # One component per route
├── components/      # Shared UI (Layout, Modal, LangSwitcher)
└── lib/
    ├── api.js       # All API calls
    ├── auth.js      # Token/user storage in localStorage, permission helpers
    └── i18n.jsx     # Translations (English, French, Arabic with RTL)
```

### Admin Panel

**Location:** `web/admin/` — Dev server on default Vite port (5173)

**Pages:**
- **Setup** — First-time super admin account creation (name, email, password)
- **Login** — Email/password login
- **Dashboard** — Stat cards: total plans, total stores, active stores, total admins. Quick links to other pages
- **Plans** — Table of subscription plans with create/edit modal (name, description, price, max_users, max_products). Enable/disable toggle
- **Tenants** — Table of stores with create/edit modal. View tenant's users in nested modal. Toggle tenant and user active status. Brand color indicator
- **Admins** — Table of super admins. Create modal. "You" badge on current user. Cannot disable yourself

**Auth:** Stores `sa_token` and `sa_user` in localStorage.

### Tenant Panel

**Location:** `web/tenant/` — Dev server on port 5174

**Pages:**
- **Signup** — Three-step flow: (1) Select plan from cards → (2) Fill store details form → (3) "Pending approval" confirmation
- **Login** — Email/password with translated error messages for plan expired, account disabled, store disabled
- **Dashboard** — Welcome banner, stat cards (products, suppliers, purchases, staff count for admins only), quick links for admins
- **Products** — Full CRUD with three-tab modal (Basic Info, Pricing, Stock). Barcode list management. Image upload with compression. Stock movement history dialog with date range filter. Stock loss recording dialog. Print label modal with barcode generation (JsBarcode + ESC/POS printer support via WebUSB)
- **Categories / Brands / Units** — Simple CRUD tables with search and pagination. Cache-busted after mutations
- **Suppliers** — CRUD table plus balance adjustment modal and payment modal (shows unpaid validated purchases)
- **Purchases** — Complex multi-modal page: purchase list with status filters and date range. Create/edit modal with dynamic line items, searchable product/supplier dialogs. Validate and pay actions
- **Losses** — Read-only list with date range filter and product search. Shows loss type badges (theft/waste/damage)
- **Users** (admin only) — Staff management with permission matrix table for cashiers (checkboxes for each module × action)
- **Settings** (admin only) — Three sections: General (logo, name, phone, address), Legal/Fiscal (RC, NIF, NIS, NART, RIB), Currency (code, symbol, position)

**Auth:** Stores `tenant_token` and `tenant_user` in localStorage.

**Permission-aware UI:**
- `hasPerm(module, action)` — Returns true for tenant_admin, checks `user.permissions[module][action]` for cashiers
- `isTenantAdmin()` — Role check
- Navigation items, action buttons, and modals conditionally render based on permissions
- Entire nav groups (Product Management, Purchases) hide if user lacks view permission on all child modules

**Plan expiration handling:**
- On HTTP 402 response, dispatches a `plan-expired` browser event
- App shows a full-screen `PlanExpiredScreen` overlay requiring logout

---

## API Route Summary

### Public (No Auth)

```
GET    /api/plans                              Active plans for signup
POST   /api/signup                             Create tenant + admin user
POST   /api/tenant/auth/login                  Tenant user login
GET    /api/super-admin/setup-status            Check if first setup needed
POST   /api/super-admin/setup                   First-time admin setup
POST   /api/super-admin/login                   Super admin login
```

### Super Admin Routes

All require `Auth()` + `RequireRole("super_admin")`.

```
POST   /api/super-admin/admins
GET    /api/super-admin/admins
PATCH  /api/super-admin/admins/:id/active

POST   /api/super-admin/plans
GET    /api/super-admin/plans
GET    /api/super-admin/plans/:id
PUT    /api/super-admin/plans/:id
PATCH  /api/super-admin/plans/:id/active

POST   /api/super-admin/tenants
GET    /api/super-admin/tenants
GET    /api/super-admin/tenants/:id
PUT    /api/super-admin/tenants/:id
PATCH  /api/super-admin/tenants/:id/active

GET    /api/super-admin/tenants/:tenantId/users
PATCH  /api/super-admin/tenants/:tenantId/users/:id/active
```

### Tenant Routes

All require `Auth()` + `RequireRole("tenant_admin", "cashier")` + `TenantActiveGuard()`.
Permission-gated routes also require `RequirePermission(module, action)`.

```
GET    /api/tenant/auth/me

GET    /api/tenant/settings                     (tenant_admin only)
PUT    /api/tenant/settings                     (tenant_admin only)
POST   /api/tenant/settings/upload-logo         (tenant_admin only)

POST   /api/tenant/users/                       (tenant_admin only)
GET    /api/tenant/users/                       (tenant_admin only)
GET    /api/tenant/users/:id                    (tenant_admin only)
PUT    /api/tenant/users/:id                    (tenant_admin only)
PATCH  /api/tenant/users/:id/active             (tenant_admin only)

GET    /api/tenant/categories                   (categories/view)
POST   /api/tenant/categories/                  (categories/add)
PUT    /api/tenant/categories/:id               (categories/edit)
DELETE /api/tenant/categories/:id               (categories/delete)

GET    /api/tenant/brands                       (brands/view)
POST   /api/tenant/brands/                      (brands/add)
PUT    /api/tenant/brands/:id                   (brands/edit)
DELETE /api/tenant/brands/:id                   (brands/delete)

GET    /api/tenant/units                        (units/view)
POST   /api/tenant/units/                       (units/add)
PUT    /api/tenant/units/:id                    (units/edit)
DELETE /api/tenant/units/:id                    (units/delete)

GET    /api/tenant/products                     (products/view)
POST   /api/tenant/products/                    (products/add)
GET    /api/tenant/products/:id                 (products/view)
PUT    /api/tenant/products/:id                 (products/edit)
DELETE /api/tenant/products/:id                 (products/delete)
GET    /api/tenant/products/:id/movements       (products/movement)
POST   /api/tenant/products/upload-image        (products/add)

GET    /api/tenant/suppliers                    (suppliers/view)
POST   /api/tenant/suppliers/                   (suppliers/add)
PUT    /api/tenant/suppliers/:id                (suppliers/edit)
DELETE /api/tenant/suppliers/:id                (suppliers/delete)
PATCH  /api/tenant/suppliers/:id/balance        (suppliers/edit)
POST   /api/tenant/suppliers/:id/pay            (suppliers/pay)

GET    /api/tenant/purchases                    (purchases/view)
POST   /api/tenant/purchases/                   (purchases/add)
GET    /api/tenant/purchases/:id                (purchases/view)
PUT    /api/tenant/purchases/:id                (purchases/edit)
DELETE /api/tenant/purchases/:id                (purchases/delete)
POST   /api/tenant/purchases/:id/validate       (purchases/validate)
POST   /api/tenant/purchases/:id/pay            (purchases/pay)

GET    /api/tenant/losses                       (products/loss)
POST   /api/tenant/losses                       (products/loss)
```

---

## Environment & Configuration

**File:** `internal/config/config.go` — loaded from `.env` via godotenv with fallback defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | `3000` | HTTP server port |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB` | `saas_pos` | Database name |
| `JWT_SECRET` | `secret` | JWT signing key (**must override in production**) |
| `JWT_EXPIRES_IN` | `24h` | Token expiration (Go duration format) |

### Running Locally

```bash
# Start MongoDB (if not using Docker)
mongod

# Run backend
go run ./cmd/server

# In another terminal — admin frontend
cd web/admin && npm install && npm run dev

# In another terminal — tenant frontend
cd web/tenant && npm install && npm run dev
```

### Docker

```bash
# Full stack
docker-compose up    # Go app on :3000, MongoDB on :27017

# Production build
docker build -t saas-pos .
```

The Dockerfile uses a multi-stage build: builds both frontends with Node, compiles Go binary, runs on Alpine Linux.

---

## Important Implementation Notes

1. **No database transactions.** Multi-document updates (e.g., purchase validation updating products + supplier) are not atomic. If one fails mid-way, others may have already succeeded.

2. **No soft deletes.** All deletions are permanent (physical removal from MongoDB).

3. **No test suite.** No unit or integration tests are configured.

4. **No lint/format tooling.** No Go linter or JS linter is set up.

5. **Plan limits are informational.** `MaxUsers` and `MaxProducts` on subscription plans are stored but not enforced at the application level.

6. **File uploads are local.** Product images and logos are stored on the filesystem under `./uploads/`, not in cloud storage.

7. **Currency fields are display-only.** The currency code/symbol/position in store settings affects frontend display but doesn't change any backend calculations.
