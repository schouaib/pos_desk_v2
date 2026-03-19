# SPA Routing Fix: Serving Preact Apps Under Path Prefixes

## The Problem

The app serves two Preact SPAs under path prefixes via Caddy reverse proxy:
- `/admin/*` → Admin panel
- `/tenant/*` → Tenant panel

This created a conflict between **asset loading** and **client-side routing**.

### Attempt 1: No Vite `base` config

Without `base` in Vite, the built `index.html` references assets with bare paths:
```html
<script type="module" src="/assets/index-abc.js"></script>
```

When a browser at `/admin/` requests `/assets/index-abc.js`, the request **doesn't match** Caddy's `/admin/*` handler. Caddy returns an empty response, causing:
```
Failed to load module script: Expected a JavaScript-or-Wasm module script
but the server responded with a MIME type of "".
```

### Attempt 2: Add Vite `base: '/admin/'`

With `base: '/admin/'`, assets load correctly:
```html
<script type="module" src="/admin/assets/index-abc.js"></script>
```

Caddy matches `/admin/*`, strips the prefix, finds `/assets/index-abc.js` in `/srv/admin/` — assets load fine.

**But routing breaks.** The browser URL is `/admin/login`, and `preact-router` reads `window.location.pathname` directly. Routes are defined as `/login`, `/dashboard`, etc. (without prefix). No route matches `/admin/login` → **blank page, no errors**.

### Why not just prefix all routes?

Prefixing every route (`/login` → `/admin/login`) would require changes across ~8+ files: `app.jsx`, `Layout.jsx`, `Login.jsx`, `Setup.jsx`, and every component using `route()` or `<a href>`. It's invasive, error-prone, and breaks local development where routes have no prefix.

## The Solution

A **custom history adapter** that sits between `preact-router` and the browser, transparently handling the prefix.

### How it works

```
Browser URL: /admin/login
         ↓ (strip prefix)
preact-router sees: /login  →  matches route "/login"  ✓
         ↓ (on navigate)
route('/dashboard')  →  custom history prepends prefix
         ↓
Browser URL becomes: /admin/dashboard
```

### Implementation

```js
function createBasedHistory(base) {
  function strip(p) {
    return p.startsWith(base) ? p.slice(base.length) || '/' : p
  }
  return {
    get location() {
      return {
        pathname: strip(window.location.pathname),
        search: window.location.search,
      }
    },
    listen(cb) {
      const fn = () => cb({
        pathname: strip(window.location.pathname),
        search: window.location.search,
      })
      addEventListener('popstate', fn)
      return () => removeEventListener('popstate', fn)
    },
    push(url) { history.pushState(null, null, base + url) },
    replace(url) { history.replaceState(null, null, base + url) },
  }
}
```

Passed to `preact-router` via the `history` prop:
```jsx
const basedHistory = createBasedHistory('/admin')

<Router history={basedHistory}>
  <Login path="/login" />        // unchanged
  <Dashboard path="/dashboard" /> // unchanged
</Router>
```

### Why this works with zero app code changes

`preact-router` uses the custom history object for **all** routing operations:

| Operation | Without custom history | With custom history |
|---|---|---|
| **Read current URL** | `window.location.pathname` → `/admin/login` | `customHistory.location.pathname` → `/login` |
| **Navigate** (`route('/dashboard')`) | `history.pushState(null, null, '/dashboard')` | `customHistory.push('/dashboard')` → pushes `/admin/dashboard` |
| **`<a href="/login">` click** | preact-router intercepts → `route('/login')` | Same interception → goes through custom history |
| **Browser back/forward** | `popstate` → raw URL | `popstate` → stripped URL via listener |

### Files changed

| File | Change |
|---|---|
| `web/admin/vite.config.js` | Added `base: '/admin/'` |
| `web/tenant/vite.config.js` | Added `base: '/tenant/'` |
| `web/admin/src/app.jsx` | Added `createBasedHistory('/admin')`, passed to `<Router>` |
| `web/tenant/src/app.jsx` | Added `createBasedHistory('/tenant')`, passed to `<Router>`, fixed `window.location.href` to include prefix |

### Caddy config (unchanged)

```
handle /admin/* {
    uri strip_prefix /admin
    root * /srv/admin
    try_files {path} /index.html
    file_server
}
```

Caddy strips the prefix server-side for file serving. The custom history strips it client-side for route matching. Both layers work independently.

## Local Development

No impact. In dev mode, Vite serves at `http://localhost:5173/admin/` (due to `base: '/admin/'`). The custom history strips `/admin` so routes match normally. API calls use absolute paths (`/api/...`) and are unaffected by the base config.
