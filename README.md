# Testrix — Unified Testing Platform

Testrix hosts four testing products behind **one URL, one login and one database server**, with
the services that every product needs — identity and email — pulled out into a platform backend
of their own so that no product depends on another to stay up.

| Product | What it does |
|---|---|
| **Automation** | Selenium/TestNG and Playwright suite execution, reports, screenshots, live logs |
| **API Testing** | API collections, request builder, groups, scheduling, execution history, business-validation checks |
| **Performance Testing** | Load/volume tests, virtual users, drift detection, queued runs |
| **GenAI** | AI assistant (Groq LLM + web search) that can query the other three products on the caller's behalf |

Everything runs in Docker and is reached through a single nginx gateway.

## Quick start

```bash
cp .env.example .env      # fill in the required secrets — the stack refuses to boot without them
docker compose up -d --build
```

Open **http://localhost:15000** and sign in. That one session works across every product.

| URL | What it is |
|---|---|
| `http://localhost:15000/` | Testrix shell — login, dashboard, admin console, AI chat |
| `http://localhost:15000/automation/` | Automation UI |
| `http://localhost:15000/apitest/` | API Testing UI |
| `http://localhost:15000/perf/` | Performance Testing UI |
| `http://localhost:15000/health/{platform,automation,apitest,perf,genai}` | Per-service health |

## Architecture

```
Browser ──► testrix-gateway (nginx :15000)
             │  /              → Testrix shell (login, dashboard, admin)
             │  /platform/api  → testrix-platform-backend   ← identity + mail, shared by all
             │  /automation/   → Automation UI + /automation/api
             │  /apitest/      → API Testing UI + /apitest/api
             │  /perf/         → Performance UI + /perf/api
             │  /genai/        → GenAI service
             │
             ├─► testrix-platform-backend :8080   auth, users, workspaces, audit, mail
             ├─► automation-portal-backend :8080 ─► execution-manager ─► framework-runner ×2 (Chrome)
             │                                                        └─► report-artifact-service
             ├─► api-testing-backend :8080 ──► api-testing-redis
             │        └─► api-testing-execution-service ×N   (scaled independently, drains scheduled runs)
             ├─► performance-testing-backend :8080
             └─► testrix-genai :3000 (Groq + Tavily)
                        │
                   testrix-mysql (schema: testrix_platform)
```

### Identity: issued in one place, verified everywhere

`testrix-platform-backend` is the **only** service that issues tokens or sends email. It owns
login, refresh/OTP, users, roles, tenants, projects/workspaces, audit and the one configured SMTP
account.

Every product verifies the JWT **locally** against the shared `PORTAL_JWT_SECRET` — api-testing's
and performance-testing's `JwtValidationFilter`, automation's own `security/JwtValidationFilter`,
and genai's `auth.js`. Nothing calls back to the platform service on the request path.

That is deliberate, and it is what the failure behaviour depends on:

| If this is down | What still works |
|---|---|
| `automation-portal-backend` | login, profile, admin, API Testing, Performance, GenAI — only `/automation/*` returns 502 |
| `testrix-platform-backend` | all four products keep serving already-signed-in users; only new logins fail |
| any one product | every other product, and the gateway itself |

The gateway does **no** auth subrequest of its own. It used to (`auth_request` against the
automation backend), which meant an automation outage took down API Testing, Performance and
GenAI as well. Each service enforces `anyRequest().authenticated()` itself, so removing that hop
lost no security — direct-port access is not a bypass.

Only the platform backend is health-gated in compose; the products are `service_started`, so a
broken product can never stop the gateway — and therefore login — from coming up.

### Multi-workspace isolation

Every user session carries `tenantId` / `projectId` / `projectCode` / `projectRoles` claims. All
project-scoped data is filtered by the `projectId` in the token, not by anything the client sends,
so the same account switched between two workspaces sees two completely different datasets.
Super Admin deliberately carries no project claim and is refused by project-scoped endpoints;
cross-project administration lives only under `/api/admin/**`.

### Rate limiting

The unauthenticated credential endpoints (login, refresh, password reset, workspace-request OTP)
are held per submitted username **and** per client IP, since an IP can be forged and a username
cannot. **Nothing is ever blocked permanently** — passing a limit starts a hold that expires on
its own, and attempts made during a hold do not extend it, so a bot cannot turn a temporary pause
into a permanent lockout for a real user.

| Tier | Limit | Hold | Response |
|---|---|---|---|
| Account (submitted username) | 20 failed attempts / hour | 1 hour | "this account is paused for 1 hour. It is not blocked: you can sign in again after that, or reset your password now." |
| Device (client IP) | 40 attempts / hour | 1 day | "access is paused for 1 day. This is temporary, and your account is not blocked." |

Both return `429` with a `Retry-After` header. A successful login clears that account's counter,
so a user who mistypes a few times is never left waiting. Tune with the `AUTH_RATE_LIMIT_*`
variables; set a tier's `_ATTEMPTS` to `0` to disable it.

Counters are in-memory, so they reset if the platform container restarts — deliberate, since a
shared store would put login back on a dependency this split exists to remove.

A Super Admin can see and lift holds without restarting anything:

| Endpoint | Does |
|---|---|
| `GET /platform/api/admin/rate-limit/holds` | lists only keys actually under a hold, with the wait remaining |
| `POST /platform/api/admin/rate-limit/clear` | lifts one — body `{"scope":"ACCOUNT","value":"user@example.com"}` or `{"scope":"DEVICE","value":"1.2.3.4"}` |
| `POST /platform/api/admin/rate-limit/clear-all` | lifts every hold |

They sit under `/api/admin/**`, so the existing SUPER_ADMIN rule gates them, and they are
deliberately **not** in the throttled-paths list — an admin clearing holds must never be able to
throttle themselves out of doing it. Every clear is written to the audit log as
`RATE_LIMIT_CLEARED`.

### API Testing: scaling execution separately from the API

`api-testing-backend` serves the REST API, writes due schedules to a durable queue
(`API_SCHEDULE_JOB`), and still runs "Run Now" itself on its own pool. A separate,
horizontally-scalable service — **`api-testing-execution-service`**, same image, different
role — drains that queue and runs the scheduled calls, so the REST API is never competing
with scheduled-execution load for threads or DB connections:

```bash
docker compose up -d --scale api-testing-execution-service=4
```

The number is the **total** replica count — raise or lower it any time by re-running that
command with a new number; no image rebuild is needed unless the code changed. Every
replica polls the same `API_SCHEDULE_JOB` table with `SKIP LOCKED`, so two replicas can
never claim the same job — the same mechanism `docker-compose.loadtest.yml` already uses to
prove two instances never double-run a schedule. Total scheduled-execution concurrency is
`replicas × SCHEDULER_MAX_CONCURRENT` (default 40 each, set in
`products/api-testing/docker-compose.yml`); `api-testing-backend`'s own
`SCHEDULER_MAX_CONCURRENT` sizes only its "Run Now" pool and is unaffected by
execution-service load, so a manual run never waits behind a scheduled backlog.

### Database

One MySQL container. Everything uses the `testrix_platform` schema; `automation_portal` and
`api_testing_platform` still exist from before the consolidation and are no longer written to.

Each service owns its own Flyway history table so migrations never collide:
`flyway_schema_history` (automation), `_apitest`, `_perf`, `_platform`. The identity and mail
tables were created by automation's V1–V32 back when auth lived there; that history stays frozen,
and **new platform schema changes belong in `platform/backend/src/main/resources/db/migration`**.

## Configuration

**One root `.env` for the whole stack.** Docker Compose loads it automatically, and every
`${VAR}` in every compose file resolves from it. There is no per-backend `.env`.

The one exception is `products/genai/service/.env`, wired in via `env_file:`, because it holds
third-party keys (`GROQ_API_KEY`, `TAVILY_API_KEY`) that belong to that service alone.

How a value reaches a backend:

```
.env  →  compose `environment:`  →  container env var  →  Spring ${...} in application.yml
```

Spring's relaxed binding maps `PORTAL_JWT_SECRET` to `portal.jwt.secret`, so most variables need
no explicit mapping. Secrets have **no insecure fallback** — a missing `PORTAL_JWT_SECRET`,
`MYSQL_ROOT_PASSWORD`, `PORTAL_EVENTS_API_KEY`, `PORTAL_SUPERADMIN_*` or
`APITESTING_ENCRYPTION_KEY` fails startup rather than booting with a well-known default.

Copy `.env.example`, which documents every variable. `.env` itself is git-ignored and must never
be committed.

### Frontend base URLs

Never hardcoded at a call site. Each frontend has one config module:

- `platform/shell/src/config.js` — `PLATFORM_BASE` (`/platform`) and `AUTOMATION_BASE` (`/automation`)
- `products/automation-portal/frontend/src/config.js` — `API_BASE` and `PLATFORM_BASE`
- api-testing / performance-testing — `src/api/client.js`, derived from `import.meta.env.BASE_URL`

Both are overridable at build time with `VITE_PLATFORM_BASE` / `VITE_AUTOMATION_BASE`, so a
deployment changes one file, not fifty.

## Ports

| Port | Service | Notes |
|---|---|---|
| 15000 | gateway | **the only port a user needs** |
| 18081 | platform backend | direct access for debugging |
| 18080 | automation backend | also the Google OAuth redirect target |
| 8081 / 8082 | api-testing / performance backends | direct access for debugging |
| 3000 | genai | |
| 3306 | MySQL | bound to `127.0.0.1` only |

Everything else (redis, execution-manager, framework-runners, report-artifacts) is reachable only
inside the `testrix_network` Docker network. In production, publish **only 15000** and drop the
rest of the `ports:` mappings.

## Folder structure

```
platform/
  backend/             Testrix platform service — auth, mail, users, workspaces, audit
  shell/               master frontend (login, dashboard, admin console, AI chat)
  mysql-init/          schema creation on first boot
  docker-compose.yml   mysql + platform backend + gateway
products/
  automation-portal/   backend, frontend, execution-manager, framework-runner, report-artifacts
  api-testing/         backend, frontend
  performance-testing/ backend, frontend
  genai/               Express service (Groq + Tavily)
shared/ui/             design tokens and components shared across frontends
gateway/               nginx.conf (all routing) + Dockerfile (builds all four UIs)
docs/                  architecture, deployment and version history
docker-compose.yml     root orchestration (includes the four product compose files)
```

Inside `platform/backend`, the platform-wide services are separate packages, not one blob:
`auth/`, `mail/`, `users/`, `workspace/`, `audit/`, `profile/`, `security/`, `config/`, `common/`.

## What must not go into a deployment

Already git-ignored, and none of it should ever reach a server or an image:

| Path | Why |
|---|---|
| `.env`, `products/genai/service/.env` | real secrets — ship values through the deploy environment |
| `node_modules/`, `dist/` | rebuilt during the image build |
| `target/` | Java build output, rebuilt during the image build |
| `*.log`, `logs/` | runtime output |
| `.backups/` | database dumps containing real user data |
| `products/automation-portal/backend/artifacts/` | execution screenshots, reports, videos |
| `.test-token` | real signed JWTs used for manual testing |
| `.idea/`, `.vscode/`, `.DS_Store`, `Thumbs.db` | local editor/OS files |

Not secret, but not needed at runtime either — exclude to keep images small:
`docs/`, `.git/`, `README.md`, `products/*/frontend/src` (already compiled into the gateway image),
and any `*.md` outside a service's own resources.

The Docker build only ever copies what a service needs: the gateway image takes the four
frontends' build output plus `nginx.conf`, and each backend image takes `pom.xml` + `src`.

## Development

- Vite dev servers (5170 shell, 5173 automation, and each product's own) are for
  `npm run dev` only. Production UIs are always built into the gateway image.
- The dev proxies in each `vite.config.js` mirror the gateway's routes, including `/platform/api`,
  so `npm run dev` behaves like the real gateway.
- Rebuild one piece: `docker compose up -d --build testrix-gateway` (UIs + nginx),
  `... testrix-platform-backend`, `... automation-portal-backend`, etc. A code change to
  `api-testing-backend` also needs `api-testing-execution-service` rebuilt (same image) and
  re-scaled: `docker compose up -d --build api-testing-backend api-testing-execution-service
  && docker compose up -d --scale api-testing-execution-service=<N>`.
- The gateway image is baked — frontend changes need a gateway rebuild, not just a restart.
- Shell scripts must stay LF; `.gitattributes` enforces it (a CRLF checkout once broke the
  framework-runner image).
- Always run compose from the repo root so the `testrix` project name resolves correctly.

## Roadmap

1. Move the historical identity/mail DDL out of automation's frozen V1–V32 into the platform
   migration stream, so a fresh install no longer depends on automation migrating first.
2. Merge execution-manager and report-artifact-service into the automation backend
   (framework-runner stays separate — it hosts Chrome and Maven).
3. Shared rate-limit / session store, so the platform backend can run more than one replica.
4. Cross-product notifications and richer platform-level reporting.
