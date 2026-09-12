# Testrix Architectural Issues & Technical Debt Report
**File:** `docs/architectureissuses.md`  
**Date:** September 2026  
**Status:** Audit Completed — Pending Future Refactoring  
**Target Areas:** `platform/shell`, `products/automation-portal`, `products/api-testing`, `products/performance-testing`, `products/genai`, `shared/ui`

---

## 1. Executive Summary & Context

### Background
Originally, **Testrix** started as a monolithic standalone automation test management platform located inside `products/automation-portal` (frontend + backend + execution runner).

Later, the architecture evolved into a multi-product enterprise platform consisting of:
1. **Platform Shell Frontend** (`platform/shell` on Vite port `5170` / served at `/`)
2. **Platform Backend** (`platform/backend` on port `18081` / `/platform/api/`)
3. **Product Frontends & Backends** embedded via iframe into the shell:
   - **Automation Portal** (`products/automation-portal` at `/automation/`)
   - **API Testing** (`products/api-testing` at `/apitest/`)
   - **Performance Testing** (`products/performance-testing` at `/perf/`)
   - **GenAI** (`products/genai` at `/genai/`)
4. **API Gateway** (`gateway/nginx.conf`) routing requests.
5. **Shared UI Library** (`shared/ui/`) for cross-application design tokens and components.

### Core Problem
During the rapid conversion from the standalone Automation tool to the multi-product Shell architecture:
- Large portions of CSS were **copied directly from Automation into Shell**, leaving thousands of lines of dead CSS in both places.
- Core database migrations (V1 to V32) and global platform APIs (like Documentation / Integration Guide) **remained trapped inside `automation-portal-backend`**, making the Platform Backend dependent on Automation Portal.
- Reusable UI components (`DataTable`, `Field`, `Panel`, `Modal`, `Logo`) were **duplicated across repositories** instead of being placed in `shared/ui/`.
- Hardcoded URLs, ports, redirect paths, and legacy names (such as the localStorage key `'automationPortalAuth'`) became scattered across multiple services.

---

## 2. CSS Architecture & Duplication Analysis

### A. Iframe Isolation Boundary
* **Shell** lives on top at `/`.
* **Automation Portal** is embedded as an `<iframe>`: `<iframe src="/automation/#/${activePage}" />`.
* **CSS Boundary Rule**: CSS styles defined in the parent shell **never** penetrate into the iframe, and styles defined in the iframe **never** leak into the shell.

### B. The Giant `styles.css` Duplication (78 KB vs 106 KB)

| Metric | `products/automation-portal/frontend/src/styles.css` | `platform/shell/src/styles.css` |
| :--- | :--- | :--- |
| **File Size** | **78,179 bytes (~78 KB)** | **106,405 bytes (~106 KB)** |
| **Total Lines** | **3,670 lines** | **5,005 lines** |
| **Origin** | Original stylesheet from standalone version | Copied 1:1 from automation, then ~1,335 lines appended |
| **Dead Code Estimate** | **~1,200 lines (Shell, Sidebar, Topbar, Login, AI)** | **~3,500 lines (Execution, Reports, Logs, Screenshots)** |

#### 1. Dead CSS Inside `platform/shell/src/styles.css`:
Because the original `styles.css` was copied into Shell, Shell contains extensive styling for screens that are **only ever rendered inside the child iframe**:
- Execution Center (`.exec-*`, `.run-*`, `.queue-*`)
- Reports Center (`.report-*`, `.test-case-detail-*`)
- Logs Viewer (`.log-*`, `.terminal-*`, `.log-entry-*`)
- Screenshots Gallery (`.gallery-*`, `.screenshot-*`, `.thumb-*`)
- Environment Configuration (`.env-*`, `.variable-*`)
- Automation Setup Wizard (`.setup-*`, `.wizard-*`)
- Historical Compare (`.compare-*`, `.diff-*`)

> **Impact**: ~3,500 lines (~70 KB) in Shell's bundle are completely unreferenced and bloat the shell's bundle size.

#### 2. Dead CSS Inside `products/automation-portal/frontend/src/styles.css`:
Inside `App.jsx`, the portal detects if it is embedded: `const isEmbedded = window.self !== window.top;`. When embedded, it renders **only** `<div className="layout-content">{pages}</div>`. It **never** renders the outer shell, topbar, or sidebar.
Yet, its `styles.css` still contains:
- Outer Shell Grid (`.shell`)
- Sidebar (`.sidebar`, `.brand`, `.brand-logo`, `.sidebar-logo`, `nav`, `.sidebar-footer`)
- Admin Navigation (`.admin-sidebar`, `.admin-nav-btn`, `.nav-section-admin`)
- Topbar (`.topbar`, `.tb-search`, `.tb-avatar`, `.tb-bell`, `.tb-breadcrumb`)
- AI Chat Panel (`.ai-chat-btn`, `.ai-chat-panel`, `.ai-chat-messages`, `.ai-chat-bubble`)
- Authentication / Login Cards (`.login-wrap`, `.login-card`, `.login-brand`, `.login-btn`) — Automation immediately redirects unauthenticated users to `/`.

> **Impact**: ~1,200 lines of CSS in Automation Portal are dead weight inside the iframe.

### C. Bootstrap Inconsistency
- `automation-portal/frontend/src/main.jsx` imports:
  ```javascript
  import 'bootstrap/dist/css/bootstrap.min.css';
  import 'bootstrap/dist/js/bootstrap.bundle.min.js';
  ```
- `platform/shell`, `api-testing`, and `performance-testing` **do not import Bootstrap** (they use vanilla CSS design tokens or Tailwind).
- This introduces ~230 KB of Bootstrap CSS exclusively into the automation portal iframe, which causes CSS reset conflicts that require extra override classes in `styles.css`.

### D. Inventory of All CSS Files Across the Workspace

```
D:\Testrix\
├── platform\shell\src\
│   ├── styles.css                                     (106,405 B)  <-- Contains ~70 KB dead automation styles
│   ├── search\searchStyles.css                         (12,083 B)  <-- Global command palette / search
│   ├── components\profile\profile.css                   (7,880 B)  <-- User profile & credentials
│   └── components\shared\datatable-theme.css            (3,263 B)  <-- DUPLICATE of automation's datatable CSS
│
├── products\automation-portal\frontend\src\
│   ├── styles.css                                      (78,179 B)  <-- Contains ~25 KB dead shell/sidebar styles
│   ├── components\execution\compare.css                (12,766 B)  <-- Automation compare page
│   ├── components\screenshots\screenshots.css          (11,806 B)  <-- Screenshots gallery
│   ├── components\execution\execution.css              (11,370 B)  <-- Execution center
│   ├── components\environments\environments.css         (9,552 B)  <-- Environments page
│   ├── components\logs\logs.css                         (8,256 B)  <-- Test logs viewer
│   ├── components\reports\reports.css                   (8,179 B)  <-- Reports center
│   ├── components\dashboard\dashboard.css               (6,020 B)  <-- Automation dashboard
│   ├── components\setup\setup.css                       (4,747 B)  <-- Automation setup wizard
│   ├── components\shared\datatable-theme.css            (4,255 B)  <-- DUPLICATE of shell's datatable CSS
│   └── components\execution\execution-detail.css          (715 B)  <-- Execution detail drawer
│
├── products\api-testing\frontend\src\
│   └── index.css                                        (1,330 B)  <-- Clean Tailwind base & chevron styling
│
├── products\performance-testing\frontend\src\
│   └── index.css                                        (1,299 B)  <-- Clean Tailwind base & custom dropdowns
│
├── products\genai\frontend\src\
│   ├── App.css                                             (28 B)
│   └── index.css                                           (22 B)
│
└── shared\ui\
    ├── theme.css                                        (7,276 B)  <-- Canonical platform tokens (:root & dark mode)
    ├── loader.css                                       (4,033 B)  <-- FullScreenLoader animation
    ├── date-range-filter.css                              (813 B)  <-- DateRangeFilter styling
    ├── refreshing.css                                     (280 B)  <-- Shimmer/refresh pulse
    └── dashboard\
        ├── tokens.css                                   (7,890 B)  <-- Shared card/table/KPI tokens
        └── module-analytics-table.css                   (3,549 B)  <-- Shared module table styles
```

---

## 3. Duplicate Files & Redundancies

### A. Exact Component Duplication

| Component / File | Shell Location | Automation Portal Location | Ideal Location | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **`DataTable.jsx`** | `platform/shell/src/components/shared/DataTable.jsx` (372 lines) | `products/automation-portal/frontend/src/components/shared/DataTable.jsx` (373 lines) | `shared/ui/DataTable.jsx` | **HIGH** (Exact duplicate) |
| **`datatable-theme.css`** | `platform/shell/src/components/shared/datatable-theme.css` (3.2 KB) | `products/automation-portal/frontend/src/components/shared/datatable-theme.css` (4.2 KB) | `shared/ui/datatable-theme.css` | **HIGH** (Drifting duplicate) |
| **`Field.jsx`** | `platform/shell/src/components/shared/Field.jsx` (47 lines) | `products/automation-portal/frontend/src/components/shared/Field.jsx` (48 lines) | `shared/ui/Field.jsx` | **HIGH** (Exact duplicate) |
| **`Panel.jsx`** | `platform/shell/src/components/shared/Panel.jsx` (9 lines) | `products/automation-portal/frontend/src/components/shared/Panel.jsx` (9 lines) | `shared/ui/Panel.jsx` | **MEDIUM** (Exact duplicate) |
| **`testrix_logo.png`** | `platform/shell/src/assets/` | `automation/.../assets/`, `apitest/...`, `perf/...` | `shared/assets/` or gateway `/assets/` | **LOW** (4 copies in repo) |
| **`hierarchyRows.js`** | `platform/shell/src/components/shared/hierarchyRows.js` | Uses `shared/ui/hierarchyRows.js` | Use `shared/ui/hierarchyRows.js` directly | **LOW** (Wrapper re-export) |

### B. Unused Dead Code in Shell
* `platform/shell/src/components/shared/index.jsx` line 37:
  Exports `ExecutionTable({ executions, onSelect })`.
  This component was copied from `automation-portal/frontend/src/components/shared/index.jsx` and is **never imported or rendered anywhere in Shell**.

### C. Unused Layout Dead Code in Automation Portal
* `products/automation-portal/frontend/src/components/layout/index.jsx` (208 lines):
  Contains `Sidebar`, `Topbar`, and `PortalLayout`.
  Because `automation-portal` is run exclusively inside an iframe behind Testrix, and unauthenticated users are immediately redirected to `/`, this full layout is dead code.

### D. Modal Implementation Divergence
Three separate implementations of modals exist:
1. **Automation Portal**: `Modal` in `components/shared/index.jsx` with a custom `useViewportCenterOffset()` hook to calculate iframe scroll offset.
2. **Platform Shell**: `Modal` in `components/shared/index.jsx` with standard fixed CSS overlay.
3. **API Testing**: `ModalOverlay.jsx` importing `shared/ui/useViewportBounds.js` and `iframe-scroll-lock.js`.

---

## 4. Cross-Service Coupling & Architectural Dependencies

### A. Database Migrations Dependency (Flyway V1–V32)
* **Finding**: `platform/backend/src/main/resources/db/migration` contains **zero files**.
* **Reality**: The core MySQL schema (`testrix_platform`) including `users`, `roles`, `workspaces`, `projects`, `user_projects`, `audit_logs`, and `mail_templates` is created and managed by `products/automation-portal/backend/src/main/resources/db/migration/V1__...` through `V32__...`.
* **Risk**: If the platform backend is deployed or migrated independently of the automation portal backend, the entire database initialization fails because the tables are owned by automation's migration history (`flyway_schema_history`).

### B. Documentation / Integration Guide Trapped in Automation
* **Finding**: The global **"Documentation"** menu item in Shell's sidebar and Admin Workspace (`IntegrationGuide.jsx`) calls `/api/integration-guide`.
* **Reality**: This endpoint is served by **`automation-portal-backend`**, not `platform-backend`.
* **Risk**: If the automation-portal container is stopped or fails health check, Shell users lose access to platform-wide documentation and integration guides.

### C. Test Engines API Ownership
* `/api/test-engines` and `/api/test-engines/{id}/starter-kit` are served by `automation-portal-backend`. Shell's Project Admin settings invoke these APIs directly through `AUTOMATION_BASE`.

### D. GenAI Direct Coupling
* `products/genai/service/app.js` line 14:
  ```javascript
  const AUTOMATION_BASE_URL = process.env.AUTOMATION_BASE_URL || "http://automation-portal-backend:8080";
  ```
  The GenAI service communicates directly with `automation-portal-backend:8080` instead of going through the gateway or platform backend.

### E. Gateway Uploads Routing
* In `gateway/nginx.conf`:
  - `/uploads/profiles/` -> routes to `platform-backend:8080`
  - `/uploads/` -> routes to `automation-portal-backend:8080`
  Any general uploads are tied exclusively to the automation backend.

---

## 5. Hardcoded Values & Code Smells

### A. LocalStorage Auth Key (`'automationPortalAuth'`)
The platform JWT session token is stored under the legacy key name `'automationPortalAuth'` across four independent frontends:
1. `platform/shell/src/api.js` (line 4)
2. `products/automation-portal/frontend/src/api.js` (line 6)
3. `products/api-testing/frontend/src/api/client.js` (line 10)
4. `products/performance-testing/frontend/src/api/client.js` (line 9)

### B. Shell Root Redirect (`window.top.location.href = '/'`)
Both `products/automation-portal/frontend/src/api.js` (line 59) and `App.jsx` (line 383) hardcode `window.top.location.href = '/'` on expired session or missing token, assuming Shell will always live at the root `/`.

### C. Backend CORS Hardcoded Ports
Both `automation-portal/backend/.../SecurityConfig.java` (lines 78–79) and `platform/backend/.../SecurityConfig.java` (lines 99–100) hardcode local development origins:
```java
"http://localhost:15000", "http://localhost:5173", "http://localhost:5170", "http://localhost:15173", "http://localhost:3000"
```
These should ideally be injected via environment variables (`ALLOWED_CORS_ORIGINS`).

### D. Execution Webhook URL Hardcoding
In `platform/shell/src/components/team/WorkspaceSettings.jsx` (line 165):
```javascript
const callbackUrl = `${window.location.origin}/automation/api/events/execution`;
```
The webhook endpoint is hardcoded to `/automation/api/events/execution`.

### E. Backend Java Package Namespace
`api-testing` and `performance-testing` backends were created under the legacy package prefix:
- `com.automationportal.apitesting.*`
- `com.automationportal.perftesting.*`
Rather than a unified `com.testrix.*` namespace.

---

## 6. Actionable Refactoring Roadmap (For Future Fixes)

When you are ready to implement the fixes, follow this phased plan:

### Phase 1: CSS Clean-up & Size Reduction
1. **Shell `styles.css` Pruning**:
   - Delete lines defining `.exec-*`, `.report-*`, `.log-*`, `.gallery-*`, `.compare-*`, `.setup-*` from `platform/shell/src/styles.css`.
   - Result: Shell CSS drops from **106 KB to ~30 KB**.
2. **Automation `styles.css` Pruning**:
   - Delete `.shell`, `.sidebar`, `.topbar`, `.admin-sidebar`, `.login-card`, `.ai-chat-*` from `products/automation-portal/frontend/src/styles.css`.
   - Result: Automation Portal CSS drops from **78 KB to ~45 KB**.

### Phase 2: Shared Component Consolidation
1. Move `DataTable.jsx` and `datatable-theme.css` to `shared/ui/DataTable.jsx` and `shared/ui/datatable-theme.css`.
2. Move `Field.jsx` and `Panel.jsx` to `shared/ui/`.
3. Update imports in `platform/shell` and `products/automation-portal`.
4. Delete duplicate copies in `platform/shell/src/components/shared/` and `products/automation-portal/frontend/src/components/shared/`.
5. Remove dead `ExecutionTable` from Shell's `index.jsx`.
6. Consolidate `testrix_logo.png` into `shared/assets/testrix_logo.png`.

### Phase 3: Auth & Client API Normalization
1. Extract `authStore`, `unwrap()`, and `friendlyHttpMessage()` into `shared/ui/apiClient.js` (or `shared/lib/`).
2. Migrate `localStorage` key to `testrix_auth` with a backward-compatible fallback:
   ```javascript
   localStorage.getItem('testrix_auth') || localStorage.getItem('automationPortalAuth')
   ```

### Phase 4: Backend Decoupling & Documentation Service
1. Migrate the `IntegrationGuideController` and `integration_guide_sections` table handling from `automation-portal-backend` to `platform-backend`.
2. Establish baseline Flyway migrations in `platform/backend` so that the platform identity database can initialize independently.
3. Configure `ALLOWED_CORS_ORIGINS` via environment variables instead of hardcoding localhost ports in Java security beans.

---
*Report generated and archived in `docs/architectureissuses.md`.*
