# Testrix — Long-Term Infrastructure & Framework-Management Strategy

**Companion to:** [`docs/deployment-staging-guide.md`](./deployment-staging-guide.md) (the immediate
staging runbook). This document is architecture-and-decision only — **no code changes proposed
here**, per the request.

> Sections D–N of this request overlap heavily with architecture Testrix already has on file:
> [`docs/framework-lifecycle-architecture.md`](./framework-lifecycle-architecture.md) ("Plan 3",
> 2026-08-12) already designs the framework-registry/GitHub-per-instance/build-time-vs-run-time/
> worker-pool model in real depth, and [`docs/test-engine-integration-architecture.md`](./test-engine-integration-architecture.md)
> ("Plan 2") already **implements** the per-engine credential registry that Plan 3 builds the Worker
> role on top of. Re-deriving all of that from scratch here would drift out of sync with what's
> already decided (and, for Plan 2, already shipped). Sections D–N below summarize Plan 3's answer
> to each specific question asked here, point at the exact section to read in full, and add only
> what's new: mapping it onto a NOW/NEXT/FUTURE timeline. Sections A–C and O–P are genuinely new —
> domain, server sizing, capacity, and scaling weren't covered by any prior doc — and get full
> original analysis.

---

## Table of Contents

- [A · Domain purchase & management](#a--domain-purchase--management)
- [B · Server provider & sizing](#b--server-provider--sizing)
- [C · Capacity planning](#c--capacity-planning)
- [D–N · Framework architecture — mapped onto Plan 3](#dn--framework-architecture--mapped-onto-plan-3)
- [O · One server vs. multiple servers](#o--one-server-vs-multiple-servers)
- [P · Scaling strategy](#p--scaling-strategy)
- [Q · Recommended long-term architecture](#q--recommended-long-term-architecture)
- [R · Final questions, answered directly](#r--final-questions-answered-directly)
- [NOW / NEXT / FUTURE](#now--next--future)

---

## A · Domain purchase & management

### Where to buy `testrix.in`

`.in` is a ccTLD (India), which narrows the field slightly versus `.com` — not every low-cost
registrar carries it, and pricing/renewal terms vary more between registrars for ccTLDs than for
gTLDs. Reasonable options: **Namecheap**, **GoDaddy India**, **BigRock**, **Hostinger**. Cloudflare
Registrar (at-cost, no markup) is excellent when available, but confirm `.in` is on their supported
TLD list before assuming it — Cloudflare's ccTLD coverage is narrower than their gTLD coverage.

### Registrar selection criteria (in priority order)

1. **Renewal price, not first-year price.** The classic ccTLD trap is a cheap first year followed
   by a 2–3× renewal price. Check the renewal price explicitly before buying — it's usually on a
   separate pricing page, not the checkout page.
2. **WHOIS/registrant privacy support.** Mandatory for gTLDs under ICANN rules, but `.in` privacy
   support is registrar-dependent — some don't offer it, and .in's registry (NIXI) has its own
   privacy rules that differ from ICANN's. Confirm this is available and enabled before registering
   with real contact details.
3. **2FA on the registrar account itself.** This is the account that ultimately controls the
   domain, which controls DNS, which controls where `testrix.in` points — treat it with the same
   security posture as your GitHub org owner account or your cloud provider root account.
   Domain-hijacking-via-account-takeover is a real, common attack; TOTP-based 2FA (not SMS-only)
   closes most of it.
4. **Transfer-out friction.** Check the transfer-lock/EPP-code process before you're locked in —
   not a decision-blocker, but worth knowing.
5. **API access** (nice-to-have, not required at this stage) — useful later if DNS/domain changes
   ever need to be scripted (e.g. automated `staging.testrix.in` provisioning per feature branch).
   Not a NOW concern for a single production-ish domain.

### Registrar vs. DNS provider — keep them separate

Buy the domain from whichever registrar wins on the criteria above, then **delegate DNS to a
dedicated DNS provider** rather than using the registrar's built-in DNS panel. Recommended:
**Cloudflare (free tier)**. Reasons this is worth the extra five minutes of setup:

- Registrar DNS panels are frequently slow to propagate and have thin feature sets (no proxying, no
  DNSSEC toggle, weak API).
- Separating "who owns the domain" (registrar) from "who resolves it" (DNS provider) means an
  account compromise on either side alone doesn't hand over full control — a meaningful security
  property for very little extra effort.
- Cloudflare's free tier includes fast anycast DNS, one-click DNSSEC, and (if you ever want it) a
  proxy/CDN layer in front of the edge Nginx from the staging runbook — optional, not required.

Practically: buy at the registrar, then change the domain's **nameservers** at the registrar to
Cloudflare's assigned pair, and manage the A/CNAME records from Cloudflare's dashboard from then on.

### DNS records for Testrix

Given the gateway (`gateway/nginx.conf`, see the staging runbook §D/§F) already does **path-based
routing** for every product (`/automation/`, `/apitest/`, `/perf/`, `/genai/`) under one origin, a
subdomain-per-product architecture (`api.testrix.in`, `automation.testrix.in`, …) would be pure
duplication of a routing mechanism that already exists and already works — it would mean N times
the DNS records, N times the SSL SAN entries or separate certs, and N Nginx `server_name` blocks for
zero functional gain. **Don't build it.**

| Record | Value | Purpose | When |
|---|---|---|---|
| `A testrix.in` | staging server's public IP | The whole platform, one origin | **NOW** |
| `A/CNAME www.testrix.in` | → `testrix.in` (redirect) or the same IP | Convention; decide once whether `www` redirects to bare or vice versa | **NOW** |
| `A staging.testrix.in` | staging server's IP | Only needed once a *separate* production environment exists and the bare domain is handed to it | **NEXT**, not now — today's deployment already *is* "staging" living on the bare domain, which is fine while there's no production to conflict with it |
| `A docs.testrix.in` | (future, only if a public marketing/docs site becomes its own static site, separate from the product's internal API Collection/Docs pages that already exist inside the app) | Not an internal routing need — the gateway already serves internal docs pages | **FUTURE**, only if a public-facing doc site is ever built |
| Anything else from the original template (`api.`, `automation.`) | — | **Not needed** — the gateway's path routing already does this job | **Never**, given the current architecture |

**Bare domain vs. subdomain for the whole platform:** use `https://testrix.in` for everything, as
today's gateway already assumes (relative frontend paths, one `Content-Security-Policy`, one
`auth_request` cookie/JWT scope). A subdomain architecture would only make sense if different
products needed genuinely separate origins (different auth domains, different teams owning
different DNS zones, or a totally separate technology stack per product) — none of which is true
here.

### TTL, propagation, renewal, security

- **TTL**: 300s while actively changing records, raise to 3600s+ once stable — lower TTL costs
  nothing but a few extra DNS queries; the tradeoff only matters when you're mid-change.
- **Propagation**: typically minutes with Cloudflare's anycast network; verify with
  `dig +short testrix.in` from your own machine (not the server) before assuming it's live.
- **Domain renewal**: enable auto-renew at the registrar, and calendar a manual check ~30 days
  before expiry regardless — auto-renew billing failures (expired card) are a real, common cause of
  accidental domain loss. `testrix.in` expiring silently would take the entire platform down at the
  DNS level, independent of anything running on the server.
- **DNS security**: enable DNSSEC (one click on Cloudflare) once the base setup is stable — not
  urgent for a staging environment, but cheap insurance once you're pointing real users at it.

---

## B · Server provider & sizing

### Provider selection

Since `testrix.in` and the domain's real users are presumably India-centric, prioritize a data
center with an India region for lower latency, though this matters more once real users (not just
your own testing) are hitting the platform:

| Provider | India region | Notes |
|---|---|---|
| DigitalOcean | Bangalore (BLR1) | Simple pricing, predictable, good docs, dedicated-vCPU droplets available (important — see below) |
| AWS | Mumbai (ap-south-1) / Hyderabad (ap-south-2) | More knobs, more complexity; reasonable if you already use AWS elsewhere |
| Vultr | Mumbai | Similar simplicity to DigitalOcean |
| Azure | Central India | Reasonable if already inside Microsoft's ecosystem |
| Hetzner / Contabo | No India region (EU-based) | Excellent price/performance if latency-to-India isn't critical yet (e.g. purely internal staging use) — worth considering for a low-cost staging box specifically |

**Selection criteria that matter more than brand:**

1. **Dedicated vCPU, not "burstable/shared."** This is the single most important spec for this
   workload. Chrome under real page load is CPU-bound, not just memory-bound, and burstable
   instances (e.g. AWS `t3`, DigitalOcean's older shared droplets) throttle hard once the CPU
   credit balance runs out — which a sustained Selenium/k6 run will hit quickly. Pick a
   dedicated-CPU tier explicitly.
2. **NVMe SSD**, not spinning disk or even SATA SSD — screenshot/report/log write volume from
   automation runs is bursty and benefits from low-latency storage.
3. **Public IPv4 included.** Several providers now charge extra for a dedicated IPv4 address (IPv4
   exhaustion pricing) — confirm it's included or budget for it; the platform needs a public IPv4
   at minimum for the domain to resolve to something reachable by typical clients.
4. **Predictable bandwidth pricing**, not pay-per-GB with a low included allowance — avoid a
   surprise bill from report/screenshot traffic or a heavy load-testing session.
5. **Snapshot/backup support** at the provider level, as a second line of defense alongside the
   `mysqldump` strategy in the staging runbook §L.

### Sizing — don't size by container count

The instinct to size a server by "11 containers, therefore X" is the wrong axis. The real driver is
almost entirely **Chrome inside the framework-runner containers**; the three Spring Boot APIs,
MySQL, Redis, Nginx, and the Node GenAI service are all light by comparison and would comfortably
run on a 2 vCPU box on their own.

| Tier | Spec | What it actually fits |
|---|---|---|
| **Minimum staging** | 2 vCPU (dedicated) / 4 GB RAM / 40 GB NVMe | Everything reachable and functional, but a single Chrome session under real load can consume most of the free CPU/RAM headroom — expect visible slowdowns in the API/dashboard the moment an automation or k6 run is active. Usable for early smoke-testing, not for daily concurrent use. |
| **Recommended staging** | **4 vCPU (dedicated) / 8 GB RAM / 80 GB NVMe** | Comfortable room for both `framework-runner` instances (today's `EM_MAX_CONCURRENT=2`) to run concurrently, plus normal API-testing/performance-testing traffic, without starving MySQL or the dashboard. This is the number to actually provision for staging. |
| **Future production** | 8 vCPU / 16 GB RAM, or the first split into a separate Worker box (see §O) | Sized once real usage data exists — see §C for why a precise number beyond this needs load-testing, not estimation. |

### What actually drives disk growth

Mostly two things: the **automation artifacts volume** (screenshots + HTML reports accumulate,
currently no retention policy visible in the code) and **MySQL data**. Budget generously (the 80 GB
recommended-tier number already assumes headroom) and set a calendar reminder to check `docker
system df` and volume sizes monthly until a real retention/cleanup policy exists for old execution
artifacts.

---

## C · Capacity planning

There is no way to give an exact "N concurrent executions" number without actually load-testing
against the recommended server spec — anyone who gives you a precise number without benchmarking is
guessing. What can be stated concretely, grounded in the actual configuration:

- Each `framework-runner` container is configured with `shm_size: 2gb` and `cap_add: SYS_ADMIN`
  specifically because Chrome needs both to run reliably at all — this is a **hard floor**, not a
  tunable-down setting, per container.
- A single active Chrome/Selenium session typically wants **500 MB–1 GB RAM and a meaningful
  fraction of a CPU core** under real page load (JS execution, rendering, screenshot capture) — not
  idle-tab levels.
- `EM_MAX_CONCURRENT=2` today means the platform is already configured to cap automation
  concurrency at 2 — the two `framework-runner` instances are provisioned to match.
- Performance-testing's own concurrency cap is `PERF_QUEUE_MAX_CONCURRENT=3` (k6 jobs via
  `ProcessBuilder`) — also CPU-bound, and **k6 and Selenium compete for the same CPU pool** if both
  run at the same time on one box.

| Runners | Likely bottleneck first | Reasoning |
|---|---|---|
| 1 | Comfortable on the recommended 4 vCPU/8 GB tier | Plenty of headroom alongside the API backends |
| 2 (today's config) | Still CPU, not yet critical | This is what the recommended staging tier is sized for |
| 4 | **CPU**, then RAM | Roughly double today's concurrent Chrome cost; the recommended staging tier would likely start showing contention with the API backends. This is the point where "future production" sizing (§B) or the first server split (§O) becomes relevant, not before. |
| 8 | CPU and RAM together, likely before disk or DB | At this concurrency, MySQL connection pool exhaustion and disk write contention (screenshots/reports) become secondary bottlenecks worth watching too — but CPU/RAM saturate first given Chrome's per-session cost |

Network bandwidth is unlikely to bottleneck first — the real network cost is *latency* to whatever
external target the automation suites are actually testing (e.g. the real `godavari.mp.gov.in`
QA/staging targets referenced elsewhere in the project's history), not bandwidth to Testrix itself.

**Bottom line: benchmark, don't estimate, once you're past 2 concurrent runners.** Run a real suite
at increasing concurrency on the recommended staging box, watch `docker stats` during the run
(per the staging runbook §M), and find the actual knee in the curve for your real suites — synthetic
estimates this far from real data aren't worth pretending are precise.

---

## D–N · Framework architecture — mapped onto Plan 3

Every question from D through N in this request was already asked and answered, in real depth, by
[`docs/framework-lifecycle-architecture.md`](./framework-lifecycle-architecture.md) ("Plan 3",
written 2026-08-12, explicitly an architecture-decision document with no code proposed — the exact
brief this request is also asking for). Rather than re-deriving 700 lines of prior analysis, here is
each question mapped to Plan 3's answer, condensed, with the NOW/NEXT/FUTURE framing this request
specifically asks for layered on top.

### D. Future framework architecture — should adding a framework require redesign?

**Plan 3's answer, in one sentence** (its own §25 summary): every project's automation code is its
own Git repo, built independently into its own versioned container image, and executed on-demand by
a shared, stateless Worker pool that never permanently hosts anyone's code — Testrix's database only
stores pointers to where the real thing lives. Read Plan 3 §1–§6 for the full reasoning (the
build-time/run-time split is the load-bearing idea — §6 especially).

**Timeline:** the *target* state is FUTURE/NEXT (see the bucketed table at the end of this
document); the current bind-mount model is explicitly acceptable as the NOW state and is Plan 3's
own Phase 1 backfill target (Plan 3 §24 Phase 1 — "today's MPHIDB checkout and playwright-js
checkout each become exactly one manually-registered `framework_instances` row," i.e. the migration
doesn't require ripping anything out on day one).

### E. GitHub repository strategy for frameworks

Plan 3 §7 evaluates exactly the three options this request lists (monorepo-folder, separate repos,
hybrid) and lands on: **Option 2 (one Git repository per Framework Instance)**, with a separate,
centrally-maintained **template repo** per framework *type* (`selenium-template`,
`playwright-template`) that new instances are scaffolded from once (not linked to — see Plan 3 §7's
explanation of why instances don't auto-inherit template changes). Today's actual repos (MPHIDB,
playwright-js) map onto this cleanly as the first two Framework Instances, already living in their
own repos exactly as Plan 3 recommends — no repo restructuring needed to start the migration.

### F. Framework lifecycle

Plan 3 §19–§20 diagram this exactly (developer → Git push → CI → image → registry → Testrix
registration → dispatch → execution → results), including precisely which steps require code vs.
config vs. nothing — see Plan 3's own "what requires a code change" breakdown embedded in §9 (the
CI/build flowchart) and §24 (the phased migration, which states plainly which phase touches
`framework-runner/`'s code and which phases are pure configuration/registration).

### G. One container per framework vs. generic runner vs. worker pool

Plan 3 §10 evaluates exactly this (its "five named models" table: permanent server per framework,
permanent container per framework, ephemeral container per execution, shared worker pool, hybrid)
and recommends the same conclusion this request's own diagram gestures at: **ephemeral container per
execution, run by a shared stateless Worker pool** — not one long-lived container per framework.
The key safety property (Plan 3 §10): a Worker never holds more than one project's code resident at
once, so *sharing the pool* is safe even though *sharing a filesystem/checkout* (today's bind mount)
is not — that distinction is what makes the target model different from "one shared runner" without
reintroducing the isolation problem.

### H. Framework adapter/plugin architecture

Plan 3 §5 (the Framework Type / Template / Instance / Version four-concept model) and §16 (the
`framework_types`/`framework_templates`/`framework_instances`/`framework_versions` schema) are
exactly this. Plan 2 already deliberately **did not** build a heavier "Adapter" abstraction layer
(Plan 2 §6: "not needed... an Adapter layer would be pure ceremony without a concrete need it solves
today," since the existing generic `apiKey`/`portalUrl` contract already works per-engine with zero
framework code changes). Plan 3 doesn't reverse that — it adds the registry/versioning layer without
inventing a framework-specific adapter API, which is the right amount of abstraction for the actual
current need (2 framework types, not 20).

### I. Framework version management

Plan 3 §8 — five deliberately-separate version layers (Framework Type / Template Version / Instance
Version / Image-Runtime Version / Browser-dependency version), with an explicit answer to "should
every project always run the latest version": **no** — each Framework Instance has a single
`active_version_id` pointer, promoted deliberately (not automatically) on a successful build, and
rollback is just moving that pointer back to a still-registry-resident prior image, never a rebuild.

### J. Docker strategy — bind mount vs. image vs. hybrid

This is the one question Plan 3 answers most directly against *today's actual mechanism*: §3 names
today's bind-mount model as the explicit "why it doesn't scale" starting point, and §7/§9 recommend
**Option 2 — package each Framework Instance into a versioned container image**, pushed to a
registry, pulled by Workers at execution time. Plan 3 is explicit that this is the target, not
optional polish: at real multi-project scale, the bind-mount model requires either hand-merging
every project's suites into two shared folders (breaks isolation) or one permanently-running
bind-mounted container per project (explicitly rejected — same cost profile as one server per
framework).

**Answering this request's direct question — is the bind mount a temporary staging solution or the
long-term architecture:** temporary. It is fine, and explicitly endorsed by Plan 3 itself (§24 Phase
1's backfill), as the NOW mechanism for exactly the current one-real-workspace situation. It stops
being appropriate the moment a second project needs its own Selenium/Playwright code — which is
the trigger described in §D above and formalized in the NOW/NEXT/FUTURE table at the end of this
document.

### K. Framework repo → image → worker workflow

Plan 3 §9's CI/CD flowchart is exactly this, including the base-layer-sharing point this request's
own phrasing implies ("how could Framework A → image A, Framework B → image B... be managed") —
Plan 3's answer: **yes, one image per Framework Instance** (not per framework *type* — every
project's own instance of Selenium gets its own image), made tractable at scale by all instances of
the same type sharing common base layers (`selenium-base`, `playwright-base`), so Docker's layer
cache keeps build time and registry storage close to linear in "the top instance-specific layer,"
not linear in full image size — see Plan 3 §9's closing paragraph and §22's scale table.

### L. Framework registry table inside Testrix

Plan 3 §16 designs exactly this schema (`framework_types`, `framework_instances`,
`framework_versions`, extending — not duplicating — the already-shipped `test_engines` /
`test_engine_credentials` tables from Plan 2). This request's own field list (id, name, type,
version, repository, branch/tag, runtime, execution_command, build_command, docker_image, status,
timestamps) maps almost one-to-one onto Plan 3's `framework_instances` + `framework_versions`
tables — worth reading Plan 3 §16 directly rather than re-specifying the same columns here. Per this
request's own instruction not to implement automatically: **this is architecture only, not built** —
same status Plan 3 itself already carries (an approved design, phase 1 of §24 not yet started).

### M. Framework isolation (dependency conflicts)

Solved structurally, not by convention, by the same mechanism as K/J: each Framework Instance is its
own image with its own pinned Java/Node/Python/Maven/npm/browser versions baked in at build time.
Plan 3 §14 (Security & Isolation) and §10's "runtime isolation" point cover this: two ephemeral
containers running concurrently on the same Worker share no filesystem or network namespace, so
Framework A's dependency versions can never leak into Framework B's container regardless of what's
installed in each.

### N. Future worker architecture (worker pool + queue)

Plan 3 §10–§11 design exactly the diagram in this request (Testrix API → Execution Queue → Worker
Manager → Worker 1/2/3 → Framework A/B/C), including the one concrete *protocol* change needed to
get there: switching today's push-based dispatch (`POST {runnerUrl}/runner/run`) to a **pull** model
where Workers poll the queue for eligible jobs (Plan 3 §11, §24 Phase 3) — this is what makes
project-hosted Workers behind NAT/firewalls work with zero inbound network configuration, and is
explicitly called out as the one genuine mechanism change, not just a database addition. Plan 3 §24
(the phased migration table) is the direct answer to "how does today's staging architecture avoid
blocking this future evolution" — see the full table there; the short version is that Phase 1
(adding the registry tables, backfilling today's two bind mounts as registered instances) requires
zero changes to the running `framework-runner`/`execution-manager` containers, so nothing in the
staging deployment plan needs to anticipate or hold space for this beyond "don't build anything today
that would need to be torn out for Phase 1 to land" — and nothing in the staging runbook does.

---

## O · One server vs. multiple servers

**Don't split prematurely — this request explicitly warns against it, and the current architecture
gives no reason to yet.** One server, as sized in §B, is correct for the immediate staging goal.

### What actually triggers a split (in likely order of occurrence)

1. **Sustained CPU/RAM contention between the API/dashboard and active automation/k6 runs on one
   box** — observable directly via `docker stats` during a real run (staging runbook §M). This is
   the first, most likely trigger, and it's a *measurement*, not a guess — don't split until you've
   actually seen it happen.
2. **A production environment needs to exist alongside staging**, and the two must never compete for
   the same CPU/RAM or risk one affecting the other's stability. At that point, production and
   staging becoming genuinely separate servers (not just separate DBs on one box) is the natural
   split — independent of framework growth.
3. **Framework/project count grows enough that the Worker pool (§D–N above) needs to scale
   independently of the API/gateway tier.** This is exactly the split Plan 3's architecture already
   anticipates: Workers are designed to be able to run anywhere with network access to the queue and
   registry (Plan 3 §10's two worker deployment modes), so "move the Workers to their own box(es)"
   requires no redesign when this trigger fires — just standing up more Worker instances elsewhere.
4. **k6 load-test runs need guaranteed CPU** that active Selenium runs would otherwise contend for
   (§C's cross-competition point) — a dedicated performance-testing box becomes worth it once load
   tests are run often enough that contention with automation runs is a recurring problem, not a
   one-off.

### The natural first split, when one of the above actually happens

**Move the `framework-runner` (Worker) containers to a second server**, keep the gateway, the three
API backends, MySQL, and Redis on the first. This is the lowest-effort split because:
- Workers are already the heaviest, most bursty component (§B/§C).
- Plan 3's architecture is explicitly designed for Workers to be independently placed (§10) — this
  split requires zero change to the *design*, only to *where the containers run* and how they reach
  the queue/registry over the network.
- The API/gateway/DB tier staying together avoids a premature database-split decision, which is a
  much bigger architectural step (data locality, cross-server latency, backup complexity) than
  moving stateless Worker containers.

A DB-tier split (its own server) and further application-server splits are FUTURE concerns — see the
NOW/NEXT/FUTURE table.

---

## P · Scaling strategy

### Scaling the Worker tier — already designed for, per Plan 3

Once Plan 3's Phase 3 (pull-based dispatch) lands, scaling automation execution capacity is just
"run more Worker containers, on more hosts if needed, polling the same queue" — no application
redesign, because Plan 3's model was built around this from the start (§10, §22's scale table: "the
Worker pool sizing tracks concurrency, never instance count"). This is the cleanest scaling path in
the whole platform and needs no new analysis here beyond what Plan 3 already provides.

### Scaling the three Spring Boot API backends — partially possible today, one real blocker

This is genuinely new analysis, grounded in what the staging deployment recon found:

**What already works in Testrix's favor:** all three backends are stateless in the way that matters
for horizontal scaling — auth is JWT-based (no server-side session store), and the gateway's Nginx
already resolves backend upstreams via **Docker's embedded DNS resolver** rather than a hardcoded
IP (`gateway/nginx.conf` uses `set $var; proxy_pass http://$var;`, specifically so it re-resolves
on container changes). Scaling a backend service with `docker compose up -d --scale
api-testing-backend=3` would, in principle, let Nginx's resolver see and route to multiple replica
IPs without any gateway config change — this pattern is already the right one for horizontal
scaling, not something that needs to be introduced later.

**The real current blocker: in-process `@Scheduled` jobs would duplicate across replicas.**
`ExecutionWorker`'s queue poll, the stuck-execution reaper, `RefreshTokenService`'s nightly cleanup,
`HistoryRetentionJob`, `SchedulePoller`, `PerfJobWorker`, and `ScheduledRunner` all currently run as
in-process Spring `@Scheduled` methods inside their respective backend. Scale any of those backends
to more than one replica today, and **every replica's scheduled method fires independently** —
duplicate queue dispatch attempts, duplicate cleanup runs, potentially duplicate execution triggers.
This is a real architectural limitation *specifically for horizontal scaling*, not for the current
single-instance staging deployment, and it's worth naming explicitly because it's the kind of thing
that's invisible until the first scale-out attempt breaks something in a confusing way.

**Fix, when the time comes (NEXT/FUTURE, not needed now):** either (a) a distributed lock per
scheduled job (e.g. a `SELECT ... FOR UPDATE`/DB-advisory-lock pattern — some of the DB-polling
"queues" already lean this direction per the recon's note on `SKIP LOCKED`-style claiming) so only
one replica's tick actually executes the work per interval, or (b) promote the scheduled-job
responsibility out of the web-serving backend entirely into a single dedicated small
"scheduler/worker-coordinator" process — which is directly compatible with, and arguably a stepping
stone toward, Plan 3's centralized Worker-Manager/Scheduler direction (§N above).

### Scaling the database — future concern, not a current limitation to fix

Single MySQL instance is correct for current and near-future scale (staging runbook §L already
covers this). Read replicas / connection pooling tuning only become relevant once the API tier
itself is scaled out and generating meaningfully more concurrent DB load than one instance handles
— no action needed now, and no architecture change is required later either (adding a read replica
doesn't require restructuring the application, just infrastructure + a read/write datasource split
where it matters).

---

## Q · Recommended long-term architecture

Adapting the source template's diagram onto Testrix's actual entities — Plan 3's own §25 diagram
already covers the framework/worker half in full detail; this version places it in the context of
the staging deployment runbook's server/gateway layer so the whole picture is in one place.

```text
GitHub
   │
   ├── testrix (platform monorepo: shell, gateway, 3 product backends+frontends, genai)
   │
   ├── <project>-selenium        (Framework Instance repo — starts as MPHIDB, generalizes per Plan 3 §7)
   ├── <project>-playwright      (Framework Instance repo — starts as playwright-js)
   └── <project-N>-<framework>   (every future project/framework pair, same pattern — Plan 3 §20)
         │
         ▼
      CI/CD  (staging runbook §K; per-instance CI, Plan 3 §9 — never one shared pipeline)
         │
         ▼
    Docker Images  (8 platform images — staging runbook §H; N framework-instance images — Plan 3 §9/§16)
         │
         ▼
     Docker Hub / Image Registry  (platform images; framework images may live in a separate
     │                             registry namespaced by project_id — Plan 3 §14)
     ▼
  Testrix Server(s)
     │
     ▼
  Edge Nginx + SSL  (staging runbook §G)
     │
     ▼
   Gateway  (unchanged routing/auth_request logic)
     │
     ▼
Execution Manager / Execution Gateway  (today's QueueProcessor, generalizing per Plan 3 §11
     │                                  from push-dispatch to pull-based Queue)
     ▼
   Worker Pool  (today: 2 static framework-runner containers.
     │           Target: any number of stateless Workers, on this server or split out per §O,
     │           each pulling ephemeral containers per job — Plan 3 §10)
     │
     ├── Framework Instance A (Project 1 Selenium)
     ├── Framework Instance B (Project 1 Playwright)
     ├── Framework Instance C (Project 2 Selenium)
     └── Framework Instance N (any future project × any future framework type)
```

**What's real today vs. what this diagram anticipates:** everything above the "Execution Manager"
line is either already built (the platform's 8 images, Docker Hub workflow, gateway) or is this
request's own staging-runbook deliverable (edge SSL). Everything from "Execution Manager" down is
Plan 3's target state, not yet built — today it's still one shared bind-mounted checkout per engine
type, dispatched by push, which is explicitly fine as the NOW state per Plan 3's own phased
migration (§24) and the table below.

---

## R · Final questions, answered directly

1. **Where should I purchase `testrix.in`, and what should I look for in a registrar?** Namecheap,
   GoDaddy India, or BigRock are all reasonable; prioritize disclosed renewal pricing, WHOIS privacy
   support, and registrar-account 2FA over brand — see §A.
2. **How should DNS be configured?** Delegate to Cloudflare (free tier) for DNS management, keep it
   separate from the registrar account; one `A` record for `testrix.in`, one for `www`; no per-product
   subdomains — the gateway's path routing already does that job. See §A.
3. **What server spec for staging?** 4 vCPU (dedicated, not burstable) / 8 GB RAM / 80 GB NVMe, in
   an India-region data center if real users matter yet. See §B.
4. **What spec once automation usage increases?** No fixed number — benchmark at the recommended
   tier first (§C); the next real move is usually splitting the Worker tier onto its own server
   (§O) before simply buying a bigger single box.
5. **How many concurrent browser executions can the initial server support?** Comfortably 2 (today's
   configured `EM_MAX_CONCURRENT`); 4 is where CPU contention with the API tier is likely to start
   showing up on the recommended spec — needs real benchmarking to confirm, not estimation. See §C.
6. **Should every framework have a separate GitHub repository?** Yes — one repo per Framework
   *Instance* (not per type), per Plan 3 §7, already answered and designed in depth.
7. **Should frameworks remain outside the Testrix repository?** Yes — Plan 3 §7 rejects the
   monorepo-folder option explicitly; source code lives in its own Git history, Testrix's DB stores
   only pointers (Plan 3 §13).
8. **Should frameworks be packaged into Docker images?** Yes — this is the direct fix for the
   current bind-mount limitation; see §D–N (J) above and Plan 3 §9.
9. **One Docker image per framework?** One image per Framework *Instance* (i.e. per project's own
   copy of a framework type), sharing common base layers per type to keep build cost bounded — Plan
   3 §9/§22.
10. **A generic worker image?** Yes — the Worker itself (today's `framework-runner`, generalized) is
    one generic image that knows how to pull and run *any* framework instance's image; it does not
    need framework-specific logic baked in. Plan 3 §10/§11.
11. **How should framework versions be managed?** A single `active_version_id` pointer per instance,
    moved deliberately on successful builds; rollback is a pointer change, never a rebuild. Plan 3
    §8.
12. **How should a new framework be added without redesigning infrastructure?** New
    `framework_types`/template + a new instance repo scaffolded from it — zero changes to Testrix's
    dispatch core, per Plan 3 §11/§21 row 5. This is the central design goal Plan 3 already meets.
13. **How should framework dependencies be isolated?** By construction — each instance's own image,
    each execution its own ephemeral container, no shared filesystem/runtime between them. §D–N (M)
    above, Plan 3 §14.
14. **How should framework workers scale?** Run more stateless Worker instances (this server or
    split out per §O), all pulling from the same queue — no redesign needed once Plan 3's Phase 3
    pull-model lands. §P above.
15. **How should this support a centralized Scheduler Management Console eventually?** The Scheduler
    only ever enqueues generic jobs (Plan 3 §12) and never talks to a framework or Worker directly —
    that decoupling is what makes a future centralized console additive, not a rearchitecture.
16. **What should be implemented now?** See the NOW column below — essentially nothing from D–N;
    the staging runbook's deployment plan is what's actually due now.
17. **What should be postponed until Testrix grows?** Everything in Plan 3 beyond its own Phase 1
    (the registry tables + backfill) — see NEXT/FUTURE below.
18. **Which current decisions could become technical debt later?** The two items already flagged in
    the staging runbook §B as HIGH/CRITICAL — the Windows-path bind-mount defaults, and (more
    structurally) the fact that a second real project today would have nowhere to put its own
    framework code without hand-editing the shared MPHIDB/playwright-js checkouts. Both are already
    understood and already have a designed fix (Plan 3) — the debt is real but not silent or
    undocumented.

---

## NOW / NEXT / FUTURE

| | Scope |
|---|---|
| **NOW** — required for staging | Everything in `docs/deployment-staging-guide.md`: Docker Compose as-is, 1 server (§B recommended spec), Docker Hub for the platform's 8 images, edge Nginx + Let's Encrypt SSL, `testrix.in` + `www.testrix.in` only (no other subdomains), today's bind-mounted MPHIDB/playwright-js checkouts left exactly as they are. |
| **NEXT** — once framework count or workload actually increases | Plan 3 Phase 1 (registry tables + backfilling today's two checkouts as registered Framework Instances, §D–N above / Plan 3 §24) — non-disruptive, doesn't touch the running containers. Distributed-lock or single-owner fix for the `@Scheduled` jobs, *before* attempting to scale any backend past one replica (§P). First server split — Worker tier moved off the API/DB box — once §O's triggers actually fire, not before. Framework Version API + per-instance CI (Plan 3 Phase 2). CI/CD Stage 1–2 from the staging runbook §K. |
| **FUTURE** — production-scale | Plan 3 Phases 3–6 in full: pull-based dispatch, ephemeral-container execution replacing the bind mount, self-service Framework Instance provisioning, a Testrix-managed Worker pool (Kubernetes Jobs or equivalent once concurrency demand justifies it). A genuinely separate production server/environment (with its own DB, its own domain identity decision per §A). Centralized Scheduler Management Console. Database read replicas, if API-tier load ever actually requires them. |

**The throughline, matching this request's own constraint:** nothing in the NOW column blocks
anything in NEXT or FUTURE — Plan 3's own migration path (§24) was explicitly designed so the
current pilot deployment never has to be torn out or redone for the target architecture to be
reached incrementally. Ship the staging deployment now; the framework-scaling architecture is
analyzed, documented, and ready to start from Phase 1 whenever a second real project actually needs
it — not before.
