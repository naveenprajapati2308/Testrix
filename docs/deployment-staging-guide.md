# Testrix — Staging Deployment Runbook

**Target:** `https://testrix.in` · **Server:** 1× Linux, SSL-capable · **Registry:** Docker Hub
**Services found:** 11 containers across 5 Compose files · **Analysis date:** 2026-09-01

> This document analyzes the codebase as it actually exists today — not the older
> `docs/PROJECT_CONTEXT.md`, which predates the multi-product restructure and still describes a
> single "Automation Portal." It supersedes the prompt/spec in `docs/DeploymenrtGuide.md` (that
> file is the original request template, not a filled-in guide) and builds on the deleted-but-still
> -in-history `docs/deployment-and-production-readiness.md` (2026-08-09), whose closed findings are
> reconfirmed in §B rather than repeated.

---

## Table of Contents

- [A · Current architecture](#a--current-architecture)
- [B · Problems & breaking points](#b--problems--breaking-points)
- [C · Recommended staging architecture](#c--recommended-staging-architecture)
- [D · Docker architecture, explained against this repo](#d--docker-architecture-explained-against-this-repo)
- [E · Server architecture](#e--server-architecture)
- [F · Domain → server: DNS setup](#f--domain--server-dns-setup)
- [G · HTTP → HTTPS + SSL](#g--http--https--ssl)
- [H · Docker Hub strategy](#h--docker-hub-strategy)
- [I · First deployment — step by step](#i--first-deployment--step-by-step)
- [J · Ongoing development workflow](#j--ongoing-development-workflow)
- [K · CI/CD roadmap](#k--cicd-roadmap)
- [L · Database strategy](#l--database-strategy)
- [L2 · Persistent storage](#l2--persistent-storage)
- [M · Logs, monitoring & debugging](#m--logs-monitoring--debugging)
- [N · Deployment failure & rollback](#n--deployment-failure--rollback)
- [O · Server-level security checklist](#o--server-level-security-checklist)
- [P · Resource requirements](#p--resource-requirements)
- [Q · Final deployment checklist](#q--final-deployment-checklist)

---

## A · Current architecture

What actually exists today, verified by reading the code.

Testrix is **five products behind one Nginx gateway**, all Java 21 / Spring Boot on the backend
and React + Vite on the frontend, orchestrated by a root `docker-compose.yml` that just
`include:`s five sub-compose files. Nothing runs outside Docker today.

| Layer | What it is | Tech |
|---|---|---|
| Entry point | `gateway/` — single Nginx container. Builds and serves all 4 frontends as static files, reverse-proxies API calls to the right backend, and gates 3 of the 4 backends behind an `auth_request` JWT check | Nginx (multi-stage Docker build) |
| Shell | `platform/shell` — the outer app: login, dashboard, product switcher, AI chat widget | React + Vite |
| Automation Portal | Selenium/Playwright test-execution control center — backend, a separate *execution-manager* (queue broker), two *framework-runner* containers (actually run Chrome via Xvfb), a read-only report-artifact server, and its own frontend | Spring Boot ×4 + React |
| API Testing | Postman-style API test/collection runner with its own Redis cache and a scheduler for recurring runs | Spring Boot + Redis + React |
| Performance Testing | k6-based load testing, jobs run via `ProcessBuilder` inside the backend container | Spring Boot + k6 binary + React |
| GenAI | Chat/assistant microservice (Groq + Tavily APIs) embedded in the shell | Node/Express |
| Data | One shared MySQL 8.4 instance, one shared schema (`testrix_platform`) across all three Spring products, each with its own Flyway history table so migrations don't collide | MySQL 8.4 |

All 11 running containers sit on one Docker network (`testrix_network`), declared identically in
every sub-compose file so Compose treats it as shared/external rather than creating five separate
networks. Only two ports are published to the host today: `15000` (gateway) and `3306` on
`127.0.0.1` only (MySQL, loopback-bound — already a sound default). `api-testing-backend` also
still publishes `8081` directly; everything else is internal-only.

**Auth model:** automation-portal's backend is the identity provider (issues JWTs). api-testing,
performance-testing, and genai all validate the same shared secret (`PORTAL_JWT_SECRET`) but don't
issue tokens themselves. The gateway enforces this at the edge via an internal
`auth_request → /_auth → automation-portal /api/auth/me` call before proxying to api-testing,
performance-testing, or genai — each backend also re-checks the JWT itself as defense-in-depth in
case its port is ever hit directly.

**Background work** is all in-process `@Scheduled` polling — there is no message broker (no
Kafka/RabbitMQ). Execution queueing (automation), schedule polling (api-testing,
performance-testing) and token cleanup jobs all run as scheduled methods inside the relevant Spring
Boot process. The one genuinely separate worker tier is automation's **framework-runner**
containers — dedicated Chrome+Xvfb+Maven boxes that shell out to run real Selenium/Playwright
suites, wired for horizontal scale (two named instances today) via the execution-manager's
dispatcher.

---

## B · Problems & breaking points

Deployment-and-runtime focused, not a full security audit. A prior 2026-08-09 pass
(`deployment-and-production-readiness.md`, deleted from the tree but still in git history) closed
nine earlier CRITICAL findings and four cross-tenant gaps; those are re-verified as still fixed and
not repeated here. Everything below is new, found by reading the code as it stands today.

| Sev | Issue | Where | Why it matters |
|---|---|---|---|
| 🔴 **CRITICAL** | Working tree has 28 uncommitted changes, including an **untracked Flyway migration** | `V13__business_validation_execution_link.sql` (api-testing) | A Docker Hub build made from a fresh `git clone`/tag won't contain this file at all — the shared schema drifts from what the jar expects, and whatever feature depends on that table breaks silently in staging. Must be committed (and pushed) before the first image build. See §I step 1. |
| 🔴 **CRITICAL** | Automation's execution engine bind-mounts default to **Windows-only host paths** | `AUTOMATION_FRAMEWORK_REPO_PATH`, `AUTOMATION_PLAYWRIGHT_PATH`, `PROJECT_FRAMEWORKS_ROOT` — defaults `D:/New folder/MPHIDB`, `D:/playwright-js`, `D:/testrix-project-frameworks` in `products/automation-portal/docker-compose.yml` | None of these have a working fallback on Linux. Without explicitly overriding all three to real server paths *and* checking those external framework repos out there first, the Automation product's whole reason for existing — running Selenium/Playwright suites — cannot start on staging. Covered in §I step 12. |
| 🟠 **HIGH** | Gateway serves plain HTTP only, no TLS anywhere in the stack | `gateway/nginx.conf` — `listen 80`, no 443 block, no cert config | Direct blocker to the stated goal (`https://testrix.in`). Not a code bug — needs an edge TLS layer added in front of the existing gateway. See §G. |
| 🟠 **HIGH** | Automation-portal's CORS allow-list is hardcoded to five localhost origins with no env override | `SecurityConfig.java:119` — `http://localhost:15000/5173/5170/15173/3000` | Harmless for normal browser traffic today because the gateway serves frontend and API from the same origin (same-origin requests never trigger CORS). It *will* bite the moment anything calls the backend cross-origin — direct debug access from a `testrix.in` page to a different host/port, a future mobile client, or Google OAuth's redirect flow if that's ever turned on. Fix before relying on any of those. |
| 🟠 **HIGH** | Performance-testing backend's CORS is effectively wide open | Bare `@CrossOrigin` (no origin argument = allow-all) on 11 controllers — VolumeTest, VirtualUser, PerfTestSchedule, Result, Dashboard, PerfJobQueue, PerformanceTest, LoadTest, TestGroup, Drift | Inconsistent with the other two backends' locked-down posture. Currently mitigated because this backend's port isn't published to the host — but that's an infra accident, not a code guarantee. Tighten to match automation-portal's allow-list pattern. |
| 🟠 **HIGH** | Superadmin seed password has an insecure hardcoded fallback | `application.yml:103` (automation-portal) — `${PORTAL_SUPERADMIN_SEED_PASSWORD:password}` | Only fires on the very first boot against an empty database — but that's exactly what happens on a fresh staging server. If the env var is missing at that moment, the Super Admin account is created with the literal password `password`. Must be verified set before the very first `docker compose up`. |
| 🟡 MEDIUM | 5 of 11 running containers have no health check at all | execution-manager, report-artifact-service, framework-runner-1, framework-runner-2, and the gateway itself | execution-manager has no Actuator dependency; report-artifact-service isn't Spring Boot at all; the runners and gateway simply have no `healthcheck:` block. Compose can't gate `depends_on` on them and nothing detects a silent hang. See §M. |
| 🟡 MEDIUM | GenAI service has the same hardcoded-CORS pattern, plus a hardcoded port | `products/genai/service/server.js:7,12-18` | Same class of issue as the automation-portal CORS finding above — dormant behind the gateway, but a hard fail for any direct-port access from a real domain. |
| 🟡 MEDIUM | Real signed JWT sitting on disk, not gitignored | `products/api-testing/backend/.test-token` | Untracked today, so it hasn't leaked — but it isn't covered by any `.gitignore` pattern, meaning a careless `git add -A` would commit a working credential. Add `.test-token` to `.gitignore` now, cheap insurance. |
| 🟡 MEDIUM | `docker-compose.loadtest.yml` overlay is stale | `products/api-testing/docker-compose.loadtest.yml` | References a service topology (`api-testing-mysql`, `api_testing_platform` DB, its own network) that predates the shared-DB consolidation. Running it as-is against the current stack fails. Rework or delete before anyone reaches for it. |
| 🔵 LOW | Automation-portal's datasource URL is hardcoded, not `${}`-wrapped, unlike its two siblings | `application.yml:12` — `jdbc:mysql://localhost:3306/testrix_platform...` | Harmless today (Compose always sets `SPRING_DATASOURCE_URL`, which Spring's relaxed binding overrides regardless). Risky only if this jar is ever run standalone outside Compose. Normalize to `${DB_URL:...}` for consistency. |
| 🔵 LOW | Two dead dev-profile configs point at a stale DB name | `application-dev.yml:7` (automation-portal) and `execution-manager/application.yml:8` both default to `automation_portal`, not `testrix_platform` | Neither profile is active in Compose (no `SPRING_PROFILES_ACTIVE=dev` set anywhere) — confusing to a future reader, not a live bug. Clean up opportunistically. |
| 🔵 LOW | Two unused MySQL schemas get created on every fresh boot | `platform/mysql-init/01-databases.sql` creates `automation_portal` and `api_testing_platform`; every backend actually points at `testrix_platform` | Vestigial from before the shared-schema consolidation. Harmless, just noise — safe to leave or trim the init script, your call. |
| 🔵 LOW | Missing `.dockerignore` in five build contexts | api-testing/backend, api-testing/frontend, performance-testing/backend, performance-testing/frontend, gateway/ | Slower/larger builds, not a correctness issue. Add for hygiene when convenient. |
| ⚪ INFO | Google OAuth is coded but entirely unconfigured | `GoogleOAuth2SuccessHandler.java` exists; no client-id/secret anywhere in config or `.env.example` | Not a blocker — just don't expect it to work in staging unless you deliberately configure a Google OAuth client and add the CORS/redirect origins to match. |

**Already fixed, reconfirmed today — no action needed:** JWT/encryption secrets fail fast with no
insecure fallback (except the superadmin seed password above); forgot-password no longer leaks the
OTP in the response; the Super Admin seeder never resets an existing password on restart;
environment-credential list endpoints omit the raw config JSON; the report-artifact path-traversal
fix (`resolveSafe()`) is in place; no session token is logged to the console; MySQL is
loopback-bound with a required root password; and the four cross-tenant project-isolation gaps from
the 08-09 retrofit review (audit-log scoping, perf-testing SSE ownership check, group-controller
project check, module ACL legacy-role fallback) are all still fixed in the current code.

---

## C · Recommended staging architecture

The existing shape is sound — one gateway, one shared database, Compose-orchestrated. Staging adds
exactly one new layer: TLS termination in front of the gateway. Nothing about the product
containers changes.

```text
                                Internet
                                   │
                              testrix.in
                                   │  DNS A record
                                   ▼
                          Server public IP
                                   │
                ┌──────────────────┴──────────────────┐
                │   Edge Nginx + Certbot  (NEW)        │   :80 → redirect, :443 → TLS
                │   only container publishing 80/443   │
                └──────────────────┬──────────────────┘
                                   │  proxy_pass, internal network only
                                   ▼
                ┌──────────────────────────────────────┐
                │   testrix-gateway  (existing, as-is)  │   nginx, routing + auth_request JWT gate
                └───┬──────────┬──────────┬──────────┬─┘
                    ▼          ▼          ▼          ▼
             automation-   api-testing- performance- genai-
             portal-       backend     testing-     service
             backend                   backend
                │              │           │
                ▼              ▼           ▼
         execution-        Redis      k6 (in-process,
         manager                      ProcessBuilder)
                │
         framework-runner ×2 (Chrome + Xvfb, bind-mounts
         MPHIDB / playwright-js / project-frameworks from host)
                │
                ▼
         ┌─────────────┐
         │  MySQL 8.4  │  loopback-bound, one shared schema
         └─────────────┘
```

Everything below the new edge layer is **unchanged** — same 11 containers, same one shared
network, same auth model. That's deliberate: the gateway's routing + JWT gate is already built and
working; the only thing staging genuinely needs on top is a certificate.

---

## D · Docker architecture, explained against this repo

Concepts mapped to Testrix's actual files, not generic examples.

**Dockerfile** — A recipe, not a running thing. `products/api-testing/backend/Dockerfile` is two
stages: stage 1 pulls `maven:3.9.9-eclipse-temurin-21`, copies the source, runs `mvn package`;
stage 2 starts fresh from the much smaller `eclipse-temurin:21-jre`, copies *only* the built jar
out of stage 1, and sets `CMD ["java","-jar","api-testing-platform-backend.jar"]`. The multi-stage
split matters: the final image never contains Maven, the full dependency cache, or source code —
just a JRE and one jar.

**Docker image** — The frozen, versioned output of running that Dockerfile — filesystem layers
plus the startup command. `gateway/Dockerfile` is the interesting one: it's five stages that
separately build `platform/shell` and all three product frontends, then a final stage copies all
four `dist/` folders plus `nginx.conf` into an `nginx:alpine` base. One image, four frontends baked
in. **Consequence worth internalizing: any change to any frontend requires rebuilding and
re-pushing the *gateway* image** — there's no way to update just one product's UI independently of
the others.

**Docker container** — A running instance of an image, plus the runtime config layered on top —
env vars, volumes, network, port mapping. The same `framework-runner` image runs as two *different*
containers today (`automation-framework-runner-1` and `-2`), each with its own name and Playwright
`node_modules` volume, so two suites can execute concurrently without colliding.

**Docker Hub** — The handoff point between "built on your dev machine" and "running on the
server." Instead of shipping source code to the server and building there (slow, and requires
Maven/Node toolchains on a production box), you push the already-built image once and the server
does a cheap `docker pull`. See §H for the exact naming/tagging scheme for this repo's 8 custom
images.

### Docker Compose in this repo

The root `docker-compose.yml` is unusual in a useful way — it has **no services of its own**,
only:

```yaml
name: testrix
include:
  - platform/docker-compose.yml
  - products/automation-portal/docker-compose.yml
  - products/api-testing/docker-compose.yml
  - products/genai/docker-compose.yml
  - products/performance-testing/docker-compose.yml
```

Each product owns its own compose file and can be developed/tested in isolation, but
`docker compose up` from the root brings the whole platform up as one unit because they all
declare the same external network name (`testrix_network`) and reference the same shared MySQL
container (`testrix-mysql`) by its Compose service name — Docker's embedded DNS resolves that name
to whichever container is currently running, so services never need to know an IP address.

| Concept | How Testrix uses it |
|---|---|
| Named volumes | `testrix_mysql_data`, `automation_portal_artifacts`, `api_testing_history_bodies`, `performance_testing_k6_runs`, etc. — Docker owns the storage location; survives container recreation, deleted only by explicit `docker volume rm`. |
| Bind mounts | Automation's three external-framework paths (`AUTOMATION_FRAMEWORK_REPO_PATH` etc.) — the *host's* filesystem, not Docker's. This is the one place the architecture genuinely depends on server-side setup outside Docker (§I step 12). |
| Networks | One flat network, `testrix_network`, shared by all 11 containers. Simple and correct at this scale — no need for per-product network segmentation yet. |
| Env vars | Root `.env` feeds shared secrets (JWT, DB, SMTP, encryption key) into every service's Compose block via `${VAR}` substitution; `products/genai/service/.env` is a separate file for GenAI-only keys (Groq/Tavily), loaded via `env_file:` instead. |
| Restart policies | **Not currently set on any service** — add `restart: unless-stopped` across the board before staging goes live unattended (§I step 15). |
| Health checks | Present on MySQL, Redis, and the three main Spring Boot backends (curl against `/actuator/health`); absent on 5 services — see the MEDIUM finding in §B. |

---

## E · Server architecture

Nothing except the new edge layer touches the public internet directly.

```text
Internet
   │
   ▼
Server firewall — only 22 (SSH), 80, 443 open
   │
   ▼
Edge Nginx + Certbot container  (published: 80, 443)
   │  proxy_pass http://testrix-gateway   (internal Docker network, no host port needed)
   ▼
testrix-gateway  (existing image, unmodified)
   │  routes by path prefix, auth_request-gated
   ▼
automation-portal-backend / api-testing-backend / performance-testing-backend / genai-service
   │
   ▼
MySQL (127.0.0.1-only), Redis (internal-only), framework-runners (internal-only)
```

Once the edge layer is verified working, remove the gateway's own host port publish (`15000:80`)
— with the edge container reaching it over `testrix_network` by service name, publishing it to the
host as well is redundant attack surface. Same logic for `api-testing-backend`'s currently-published
`8081`: close it once you've confirmed everything works through the gateway.

---

## F · Domain → server: DNS setup

1. **Find the server's public IP** — from your hosting provider's dashboard, or run this *on the
   server itself*:
   ```bash
   curl -4 ifconfig.me
   ```
2. **Add an A record** at your domain registrar / DNS provider for `testrix.in` pointing at that
   IP. TTL 300s (5 min) while you're setting up — raise it to an hour or more once stable, so
   future changes don't wait as long to propagate.
3. **Optional `www`** — either a second A record for `www.testrix.in`, or a CNAME to `testrix.in`.
   Decide now whether `www` should redirect to the bare domain or vice versa; the edge Nginx config
   in §G assumes the bare domain is canonical.
4. **Wait for propagation**, typically minutes to a few hours depending on your registrar and the
   TTL you set.
5. **Verify from your own machine**, not the server (loopback can lie to you):
   ```bash
   dig +short testrix.in
   nslookup testrix.in
   ```
   Confirm the returned IP matches the server. You can also cross-check propagation globally at a
   site like whatsmydns.net.

---

## G · HTTP → HTTPS + SSL

Let's Encrypt via Certbot, in its own thin container in front of the existing gateway — not a
rewrite of `gateway/nginx.conf`. That file already implements working routing and the JWT
`auth_request` gate; touching it isn't necessary to get TLS, so this plan doesn't touch it.

```text
HTTP  :80   ──redirect──▶  HTTPS :443  ──▶  Edge Nginx (TLS termination)  ──▶  testrix-gateway:80  ──▶  containers
```

### 1. Bring up the edge layer HTTP-only first

Certbot's webroot method proves domain ownership by serving a file over plain HTTP — so the cert
can't exist yet when you first start. Add a small compose file (e.g. `edge/docker-compose.yml`, or
a new top-level include) with two services:

```yaml
services:
  edge-nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./edge/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - certbot-etc:/etc/letsencrypt
      - certbot-www:/var/www/certbot
    networks: [testrix_network]
    depends_on: [testrix-gateway]

  certbot:
    image: certbot/certbot
    volumes:
      - certbot-etc:/etc/letsencrypt
      - certbot-www:/var/www/certbot
    entrypoint: ["sh", "-c", "trap exit TERM; while :; do certbot renew; sleep 12h; done"]

volumes:
  certbot-etc:
  certbot-www:
```

Initial `edge/nginx.conf`, HTTP-only (no 443 block yet — the cert doesn't exist):

```nginx
server {
    listen 80;
    server_name testrix.in www.testrix.in;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        proxy_pass http://testrix-gateway:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Request the certificate

```bash
docker compose -f edge/docker-compose.yml up -d edge-nginx
docker compose -f edge/docker-compose.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d testrix.in -d www.testrix.in \
  --email you@yourdomain.com --agree-tos --no-eff-email
```

### 3. Switch on the 443 block, reload

Replace `edge/nginx.conf` with the full version — redirect 80→443, terminate TLS, then proxy
exactly as before:

```nginx
server {
    listen 80;
    server_name testrix.in www.testrix.in;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name testrix.in www.testrix.in;

    ssl_certificate     /etc/letsencrypt/live/testrix.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/testrix.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 25m;   # matches the gateway's own limit — keep them in sync

    location / {
        proxy_pass http://testrix-gateway:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # required for live execution progress (SSE) to survive the extra hop —
        # verify with a real run once staging is up, see the smoke-test note in §M
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

```bash
docker compose -f edge/docker-compose.yml exec edge-nginx nginx -s reload
```

### 4. Renewal

The `certbot` service above already loops `certbot renew` every 12 hours (a no-op until ~30 days
from expiry, then renews). The one thing it can't do itself is reload Nginx to pick up the renewed
cert — either add `--deploy-hook "nginx -s reload"` pointed at a shared way to reach the
edge-nginx container, or simplest for staging: a weekly cron job on the host running
`docker compose exec edge-nginx nginx -s reload` (a reload is nearly free even if the cert didn't
change).

### Other HTTPS details already handled correctly

The gateway's own security headers (`X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, a scoped `Content-Security-Policy`) stay as-is — they're independent of where
TLS terminates. Mixed-content: since every frontend calls the backend via relative paths (never a
hardcoded `http://` URL), once the browser loads the page over `https://testrix.in` every
subsequent API call inherits `https://` automatically — no mixed-content risk from the frontend
side.

---

## H · Docker Hub strategy

```text
Dev machine → git commit → docker build → docker tag → docker push → Docker Hub → server: docker pull → recreate container
```

Today's compose files use `build:`, not `image:` — fine for local dev, but it means the server
would need the full Maven/Node toolchain and the entire source tree just to run the app. For
staging, add a **deploy-time compose overlay** that swaps every `build:` for an `image: <tag>`
reference — shown fully in §I.

### Image naming

8 custom images total (MySQL and Redis stay as their official upstream images — never rebuild
those). One important consequence of §D's gateway finding: the gateway repo covers *all four*
frontends, so a frontend-only change still means rebuilding and pushing `gateway`.

| Docker Hub repo | Source |
|---|---|
| `<you>/testrix-gateway` | `gateway/Dockerfile` (bakes shell + all 3 product UIs) |
| `<you>/testrix-automation-backend` | `products/automation-portal/backend` |
| `<you>/testrix-automation-execution-manager` | `products/automation-portal/execution-manager` |
| `<you>/testrix-automation-framework-runner` | `products/automation-portal/framework-runner` — one image, used by both runner-1 and runner-2 containers |
| `<you>/testrix-automation-report-artifacts` | `products/automation-portal/report-artifact-service` |
| `<you>/testrix-apitesting-backend` | `products/api-testing/backend` |
| `<you>/testrix-perftesting-backend` | `products/performance-testing/backend` |
| `<you>/testrix-genai-service` | `products/genai/service` |

### Tags

Tag every build with something traceable back to a commit — `2026-09-01-a1b2c3d` (date + short
SHA) works well and sorts chronologically. Additionally push a floating `staging-latest` tag purely
as a convenience alias for "what staging currently runs" — but the compose overlay on the server
should always pin the dated tag, never bare `latest`, so a rollback is just changing one line back
to the previous dated tag and re-pulling. Bare `latest` is ambiguous about what's actually running
and makes "what changed" and "go back one version" both guesswork.

### Auth & visibility

Private repos are the safer default for an internal product like this — Docker Hub's free tier
includes private repos with a repo-count limit, which 8 repos may or may not fit depending on your
plan; check before assuming. On the server, authenticate once:

```bash
docker login -u <your-dockerhub-username>
```

### Rollback via tags

Because every push is a new dated tag, "roll back" is never a rebuild — it's changing the tag in
the server's compose overlay and re-pulling:

```text
testrix/testrix-apitesting-backend:2026-08-30-9f1e2c4   # previous, known-good
testrix/testrix-apitesting-backend:2026-09-01-a1b2c3d   # current, just found broken
```

See §N for the full rollback procedure.

---

## I · First deployment — step by step

Fresh Linux server to `https://testrix.in` serving real traffic. Commands assume Ubuntu/Debian —
swap the package manager lines for your distro if different.

**1. Commit and push everything first.** Before anything server-side: the working tree has 28
uncommitted changes including a Flyway migration the build needs (§B, CRITICAL finding #1). Review,
commit, and push from your dev machine.

```bash
git status
git add products/api-testing/backend/src/main/resources/db/migration/V13__business_validation_execution_link.sql
git add -p   # review the rest of the 28 changed files deliberately, not blindly with -A
git commit -m "..."
git push
```

**2. Server preparation.**

```bash
sudo apt update && sudo apt upgrade -y
sudo adduser deploy && sudo usermod -aG sudo deploy
# copy your SSH public key to ~deploy/.ssh/authorized_keys, then test login as `deploy` before continuing
```

**3. SSH hardening.** In `/etc/ssh/sshd_config`: `PasswordAuthentication no`,
`PermitRootLogin no`. Then `sudo systemctl restart sshd`. Confirm key-based login as `deploy`
works *before* restarting sshd, from a second terminal you keep open — don't lock yourself out.

**4. Install Docker + Compose plugin.**

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# log out/in for the group change to apply, then:
docker compose version
```

**5. Configure the firewall.**

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Nothing else needs to be open — every other service (backends, MySQL, Redis, the runners) stays
inside the Docker network, reachable only from other containers.

**6. DNS.** Complete §F now if not already done — confirm `dig +short testrix.in` resolves to
this server before continuing, so the certbot step in phase 3 doesn't fail on a domain that doesn't
point here yet.

**7. Pull the repo (config only — not for building).**

```bash
sudo mkdir -p /opt/testrix && sudo chown deploy:deploy /opt/testrix
git clone <your-repo-url> /opt/testrix
cd /opt/testrix
```

The server needs the repo for its `docker-compose.yml` files, the gateway/nginx configs, and
Flyway migration source — not to build images from (that happens on your dev machine per §H).

**8. Build the 8 images locally, tag, push.** From your dev machine, at the repo root:

```bash
TAG=$(date +%F)-$(git rev-parse --short HEAD)

docker build -t <you>/testrix-gateway:$TAG -f gateway/Dockerfile .
docker build -t <you>/testrix-automation-backend:$TAG products/automation-portal/backend
docker build -t <you>/testrix-automation-execution-manager:$TAG products/automation-portal/execution-manager
docker build -t <you>/testrix-automation-framework-runner:$TAG products/automation-portal/framework-runner
docker build -t <you>/testrix-automation-report-artifacts:$TAG products/automation-portal/report-artifact-service
docker build -t <you>/testrix-apitesting-backend:$TAG products/api-testing/backend
docker build -t <you>/testrix-perftesting-backend:$TAG products/performance-testing/backend
docker build -t <you>/testrix-genai-service:$TAG products/genai/service

for img in gateway automation-backend automation-execution-manager automation-framework-runner \
           automation-report-artifacts apitesting-backend perftesting-backend genai-service; do
  docker push <you>/testrix-$img:$TAG
done

echo $TAG   # note this down — you'll need it in step 11
```

**9. Create the production `.env` on the server.** Never copy your dev `.env` — generate fresh
secrets:

```bash
openssl rand -base64 48   # run 3× for PORTAL_JWT_SECRET, MYSQL_ROOT_PASSWORD, PORTAL_EVENTS_API_KEY
openssl rand -base64 32   # for APITESTING_ENCRYPTION_KEY (must be a 32-byte key)
```

Populate `/opt/testrix/.env` using `.env.example` as the field list. **Explicitly set
`PORTAL_SUPERADMIN_SEED_PASSWORD`** — don't let it fall through to the insecure default (§B). Also
create `products/genai/service/.env` with real `GROQ_API_KEY`/`TAVILY_API_KEY` values, separately.

**10. Check out the external automation frameworks on the server.**

```bash
sudo mkdir -p /var/testrix/frameworks
git clone <mphidb-repo-url> /var/testrix/frameworks/mphidb
git clone <playwright-js-repo-url> /var/testrix/frameworks/playwright-js
mkdir -p /var/testrix/frameworks/project-frameworks
```

In `.env`, set:

```ini
AUTOMATION_FRAMEWORK_REPO_PATH=/var/testrix/frameworks/mphidb
AUTOMATION_PLAYWRIGHT_PATH=/var/testrix/frameworks/playwright-js
PROJECT_FRAMEWORKS_ROOT=/var/testrix/frameworks/project-frameworks
```

This is the CRITICAL finding from §B — skip it and the Automation product simply can't execute
anything.

**11. Write the deploy compose overlay.** A new file, e.g. `docker-compose.images.yml`, that
overrides `build:` with `image:` for each service (Compose merges overlays over the base files):

```yaml
# docker-compose.images.yml
services:
  testrix-gateway:
    build: !reset null
    image: <you>/testrix-gateway:2026-09-01-a1b2c3d
  automation-portal-backend:
    build: !reset null
    image: <you>/testrix-automation-backend:2026-09-01-a1b2c3d
  automation-execution-manager:
    build: !reset null
    image: <you>/testrix-automation-execution-manager:2026-09-01-a1b2c3d
  automation-framework-runner-1:
    build: !reset null
    image: <you>/testrix-automation-framework-runner:2026-09-01-a1b2c3d
  automation-framework-runner-2:
    build: !reset null
    image: <you>/testrix-automation-framework-runner:2026-09-01-a1b2c3d
  automation-report-artifacts:
    build: !reset null
    image: <you>/testrix-automation-report-artifacts:2026-09-01-a1b2c3d
  api-testing-backend:
    build: !reset null
    image: <you>/testrix-apitesting-backend:2026-09-01-a1b2c3d
  performance-testing-backend:
    build: !reset null
    image: <you>/testrix-perftesting-backend:2026-09-01-a1b2c3d
  genai-service:
    build: !reset null
    image: <you>/testrix-genai-service:2026-09-01-a1b2c3d
```

This one file is the thing you edit on every future deploy — bump the tags, nothing else. It's
just tags, so it's fine to commit and diff over time (a lightweight changelog for free).

**12. Add the edge TLS layer.** Follow §G in full now — get the certificate before the first real
`up`, so you're never briefly live on plain HTTP.

**13. Pull images and start everything.**

```bash
cd /opt/testrix
docker login -u <you>
docker compose -f docker-compose.yml -f docker-compose.images.yml pull
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d
```

**14. Migrations and seed data — nothing manual required.** Flyway runs automatically on each
backend's startup against the shared schema; the Super Admin account seeds itself on first boot via
`DataSeeder`, using whatever `PORTAL_SUPERADMIN_SEED_PASSWORD` you set in step 9. Just watch the
logs to confirm it happened cleanly:

```bash
docker compose logs -f automation-portal-backend | grep -i -E "flyway|seed"
```

**15. Add restart policies.** Not set on any service today (§D). Add to the overlay from step 11,
or directly in each product's compose file:

```yaml
    restart: unless-stopped
```

**16–21. Verify the stack, layer by layer.**

```bash
docker compose ps                                  # everything Up / healthy
curl -sk https://testrix.in/health/automation       # -> {"status":"UP"}
curl -sk https://testrix.in/health/apitest
curl -sk https://testrix.in/health/perf
curl -sk https://testrix.in/health/genai
# open https://testrix.in in a browser — shell should load, login should work
# log in as the seeded Super Admin, confirm the dashboard renders
```

**22–25. Verify automation execution end-to-end.** The single most likely thing to be broken on a
fresh Linux server (§B CRITICAL): trigger one real run of a small suite from the Automation
product's UI and watch it through to completion — queued → running → a real pass/fail result with
a report. If it hangs at `QUEUED`, check `automation-execution-manager` and the runner logs first;
if Chrome fails to launch inside the runner, re-check `shm_size`/`cap_add: SYS_ADMIN` made it
through the deploy overlay.

**26–29. Logs, restart behavior, HTTPS, final smoke test.**

```bash
docker compose logs --tail=100 <service>          # spot-check each service once
docker restart automation-portal-backend           # confirm it comes back healthy, doesn't lose data
curl -I https://testrix.in                          # confirm a valid cert, no browser warning
curl -I http://testrix.in                           # confirm 301 to https
```

Final smoke test: fresh login → view dashboard → run one API test → run one small automation
suite → check a performance test kicks off → open the GenAI chat widget. If all five work, staging
is live.

---

## J · Ongoing development workflow

The whole point of getting this right once is that every later change is the same five commands,
not a bespoke exercise.

```text
Code change → git commit/push → docker build (changed service only) → tag → docker push
   → SSH to server → edit tag in docker-compose.images.yml → docker compose pull <service>
   → docker compose up -d <service>   (recreates just that one container)
   → tail logs, hit /health/<product>, smoke-test the specific feature that changed
```

**Only rebuild what changed.** A backend-only fix in api-testing needs exactly one image
rebuilt/pushed/pulled (`testrix-apitesting-backend`) and one container recreated — everything else
on the server keeps running untouched. Remember the one exception from §D: any frontend change, in
*any* product, means rebuilding `testrix-gateway`, because all four frontends are baked into that
one image.

**Start with this: manual.** For a solo developer standing this up for the first time, manual
build→push→pull is genuinely the right starting point — it's simple, it's exactly what you just did
in §I, and there's nothing to debug except your own commands. Don't reach for CI/CD until the
manual loop feels repetitive enough to be worth automating.

**Move to CI/CD once…** you're deploying more than a couple times a week, or more than one person
is pushing changes, or a manual step has already been forgotten once (e.g. pushed the image but
forgot to bump the tag on the server). All three are signs the manual loop has stopped saving time.

---

## K · CI/CD roadmap

There is currently no CI/CD in this repo — `.github/` has no workflow files at all (only leftover
tooling from an automated Java-upgrade run). Build this incrementally, not all at once.

```text
GitHub → GitHub Actions (on push to main) → docker build (changed products only) → docker push
   → SSH deploy step (or a self-hosted runner on the server) → docker compose pull && up -d
```

1. **Stage 1 — build+test only, no deploy.** A workflow that runs on every push/PR:
   `mvn -pl products/*/backend test` for each backend, `npm run build` for each frontend. Catches
   broken builds before they ever reach a manual deploy. Zero deployment risk, pure safety net.
2. **Stage 2 — build+push images on merge to main.** Same job, but on merge, also builds and
   pushes the changed product's image(s) to Docker Hub, tagged with the commit SHA. You still do
   the pull+up on the server manually — this stage just removes "build on my laptop" from the loop.
3. **Stage 3 — automated deploy.** Add an SSH deploy step (or a lightweight self-hosted runner on
   the server itself) that updates the tag in `docker-compose.images.yml` and runs `pull && up -d`
   for just the changed service. Gate this behind a manual approval step in Actions until you trust
   it — an unattended auto-deploy to a shared staging environment is worth being deliberate about.

Don't skip straight to Stage 3 — Stage 1 alone (tests actually running on every push) is where
most of the value is for a still-actively-changing codebase like this one.

---

## L · Database strategy

Single MySQL 8.4 container, one shared schema (`testrix_platform`) across automation-portal,
api-testing, and performance-testing, each with its own Flyway history table so their migrations
never collide. This is already correct for staging — don't split it into three databases, the
current per-product-history-table design is a reasonable way to share one schema safely.

**Migrations run automatically** on each backend's boot — no separate migration step in the deploy
runbook. The one risk: if a new backend version's migration fails partway on a non-empty database,
that backend won't start (Flyway's built-in safety), which is the correct failure mode — it won't
silently run against a half-migrated schema. Recovery is: fix forward with a new migration, or
restore the pre-deploy backup (below) and roll the image tag back.

**Backup, before every deploy that includes a migration:**

```bash
docker exec testrix-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" testrix_platform' \
  > /opt/testrix/backups/testrix_platform_$(date +%F_%H%M).sql
```

Automate this as a daily cron plus an ad-hoc run before any deploy that touches a Flyway migration.
Keep at least the last 7 daily + last 4 pre-deploy backups; prune older ones. Staging vs. future
production: when a real production environment exists, it must be a *separate* MySQL
container/volume — never point production at the staging database, and vice versa.

## L2 · Persistent storage

A container is disposable by default — anything not in a named volume or bind mount is gone the
moment it's removed. What Testrix actually needs to survive that:

| Data | Mechanism | Notes |
|---|---|---|
| MySQL data | Named volume `testrix_mysql_data` | Already correct |
| Automation reports/screenshots | Named volume `automation_portal_artifacts` | Already correct, also read-only-mounted into report-artifact-service |
| External test frameworks (MPHIDB, Playwright) | Host bind mounts | Server-side setup required — §I step 10. This is the one piece of "state" that lives outside Docker entirely. |
| API-testing history/form-data | Named volumes | Already correct |
| k6 run outputs | Named volume | Already correct |
| Backend logs | Only automation-portal has a log volume; the other five services' logs live purely in `docker logs` | Fine for staging's early weeks; add real log shipping once you care about historical logs surviving a container recreate — see §M |

---

## M · Logs, monitoring & debugging

| Question | Command |
|---|---|
| Is everything running? | `docker compose ps` — look for `Up` and, where defined, `healthy` |
| Is a specific service actually healthy? | `docker inspect --format='{{json .State.Health}}' <container>` |
| What's it logging right now? | `docker compose logs -f <service>` |
| Is it eating memory/CPU? | `docker stats` — watch `framework-runner` containers especially, Chrome is the heaviest thing in this stack |
| Is it restart-looping? | `docker compose ps` restart count, or `docker events --filter event=restart` |
| Is SSL still valid? | `echo | openssl s_client -servername testrix.in -connect testrix.in:443 2>/dev/null | openssl x509 -noout -dates` |

**Per-service health, end to end:**
- **Frontend**: `curl -I https://testrix.in` → 200
- **Automation backend**: `curl https://testrix.in/health/automation`
- **API-testing backend**: `curl https://testrix.in/health/apitest`
- **Performance-testing backend**: `curl https://testrix.in/health/perf`
- **execution-manager, report-artifact-service, framework-runners**: no health endpoint exists yet
  (§B MEDIUM finding) — for now, confirm liveness the indirect way: trigger a real automation run
  and watch it queue → run → complete.

**Smoke-test explicitly: live SSE progress through the new edge hop.** Automation's live execution
progress (and performance-testing's live run stream) use server-sent events. Adding the edge-Nginx
TLS layer in §G puts one more hop between the browser and the gateway; the config there already
sets `proxy_buffering off` and a long `proxy_read_timeout` for exactly this reason, but confirm it
live — start a real run in staging and watch whether progress updates arrive as they happen or only
in one lump at the end. If it's buffered, that's the setting to revisit.

**Logs.** For now, `docker compose logs` is your log store — fine while iterating. Once staging is
stable enough to matter, the lowest-effort next step is a `logging:` driver with size caps
(`max-size: "10m", max-file: "3"` per service) so logs can't silently fill the disk, followed by
shipping to something queryable (even a simple `docker compose logs > file` cron + `logrotate` is a
reasonable first step before reaching for a full stack like Loki/ELK).

---

## N · Deployment failure & rollback

Because every image push is a dated, immutable tag (§H) — never bare `latest` — rolling back a bad
deploy is always the same two-line operation:

```bash
# in docker-compose.images.yml, change the broken service's tag back:
#   image: <you>/testrix-apitesting-backend:2026-09-01-a1b2c3d   (broken)
#   image: <you>/testrix-apitesting-backend:2026-08-30-9f1e2c4   (previous, known-good)

docker compose -f docker-compose.yml -f docker-compose.images.yml pull api-testing-backend
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d api-testing-backend
```

This is exactly why `latest` is the wrong tag to run in staging: with `latest`, "the previous
version" isn't a thing you can name — you'd have to know which image ID it was and hope you didn't
already overwrite that layer locally. A dated tag is always addressable.

**If the failed deploy included a Flyway migration**, rolling the image tag back is not enough by
itself — the database schema has already moved forward and an older jar may not understand it. In
that case: restore the pre-deploy `mysqldump` from §L *and* roll the image tag back together, not
just one or the other.

---

## O · Server-level security checklist

| Area | Recommendation |
|---|---|
| SSH | Key-only, no root login (§I step 3) |
| Firewall | Only 22, 80, 443 open (§I step 5) — everything else stays behind Docker's internal network |
| Public ports | Only the edge Nginx (80/443). Close the gateway's `15000` and api-testing's `8081` host publishes once the edge layer is verified (§E) |
| Docker daemon | Don't expose the Docker socket/TCP API to the network; leave it on the local Unix socket only (default — just don't change it) |
| Database | Already loopback-only (`127.0.0.1:3306`) — keep it that way, never publish it to `0.0.0.0` |
| Redis | Already internal-only, no host port published — keep it that way |
| Container privileges | Every container runs as root except `framework-runner` (deliberately, non-root `chromeuser`, required for Chrome's own sandbox). Not urgent for staging; worth revisiting for production hardening — most of these images could drop to a non-root `USER` without functional impact |
| Secrets | Fresh, generated secrets in staging's `.env` — never copy dev values (§I step 9); confirm `.env` stays gitignored on the server too |
| Automatic updates | `sudo apt install unattended-upgrades` for OS security patches; Docker image updates stay manual/CI-driven (§H/§K), not automatic — you want to control exactly what version is running |
| Backups | Daily MySQL dump + pre-deploy dump (§L); store off-server (even scp'd to your own machine periodically) so a server-level failure doesn't take the backups with it |
| Log rotation | Cap Docker's log driver size (§M) so a runaway log can't fill the disk |

---

## P · Resource requirements

The one component that genuinely drives sizing here is **Chrome inside the framework-runner
containers** — everything else in this stack (three Spring Boot APIs, Nginx, MySQL, Redis, a Node
service) is light by comparison.

| Tier | Spec | Fits |
|---|---|---|
| Bare minimum | 2 vCPU / 4 GB RAM / 40 GB disk | Everything up and reachable, but expect real contention the moment a Selenium/Playwright run and normal API traffic overlap — Chrome alone routinely wants 500MB–1GB per active session, ×2 runner instances |
| **Recommended for staging** | **4 vCPU / 8 GB RAM / 80 GB disk** | Comfortable headroom for both framework-runner instances to run concurrently, plus normal API-testing/performance-testing traffic, without starving MySQL |
| If load testing gets heavy | 8 vCPU / 16 GB RAM | k6 runs and concurrent Selenium suites both want real CPU; bump here once you're regularly running both together |

**Disk** is mostly the automation artifacts volume (screenshots/reports accumulate) and MySQL
data — with no retention policy currently visible on the artifacts side, budget for growth and
revisit if disk usage climbs faster than expected. **The likeliest bottleneck isn't CPU or RAM,
it's `shm_size` starving Chrome** if you ever change the current `2gb` per-runner setting down —
leave it as configured.

---

## Q · Final deployment checklist

Work through this once, top to bottom, before calling staging done.

- [ ] Working tree committed and pushed, including the untracked V13 migration
- [ ] All 8 images built, tagged with date+SHA (never `latest`), pushed to Docker Hub
- [ ] Automation-portal CORS allow-list updated to include `https://testrix.in` (rebuild+repush
      that image after)
- [ ] Performance-testing CORS tightened from wide-open to an explicit allow-list
- [ ] Server: firewall open on 22/80/443 only, SSH key-only
- [ ] DNS A record confirmed resolving to the server (`dig +short testrix.in`)
- [ ] Fresh production `.env` generated on the server — not copied from dev —
      `PORTAL_SUPERADMIN_SEED_PASSWORD` explicitly set
- [ ] MPHIDB + playwright-js repos checked out on the server; `AUTOMATION_FRAMEWORK_REPO_PATH` /
      `AUTOMATION_PLAYWRIGHT_PATH` / `PROJECT_FRAMEWORKS_ROOT` point at real Linux paths, not the
      Windows defaults
- [ ] Edge Nginx + Certbot up, valid cert issued, HTTP→HTTPS redirect confirmed
- [ ] Gateway's `15000` and api-testing's `8081` host port publishes removed once the edge layer
      is verified
- [ ] `restart: unless-stopped` added to every service
- [ ] All containers `Up`, and every service that has a health check reports `healthy`
- [ ] Login works end-to-end as the seeded Super Admin over `https://testrix.in`
- [ ] One real automation execution run through to completion (queued → running → report)
- [ ] One API-testing run and one performance-testing (k6) run both complete
- [ ] GenAI chat widget responds
- [ ] Live execution progress (SSE) updates in real time through the new edge hop, not just at the
      end
- [ ] Container restart tested (`docker restart` on a backend) — comes back healthy, no data loss
- [ ] First MySQL backup taken and stored off-server
- [ ] `.test-token` added to `.gitignore`; `docker-compose.loadtest.yml` either fixed or removed

---

*Built from the codebase as of 2026-09-01, not from the older `docs/PROJECT_CONTEXT.md`. A rendered,
navigable version of this same content is also published as an Artifact:
https://claude.ai/code/artifact/cd02f9b2-56c1-4033-b1d2-bb86867cab4d*
