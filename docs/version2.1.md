# MASTER ENGINEERING COMMAND — TESTRIX PERFORMANCE TESTING PLATFORM
## Complete Architecture Audit, Performance Testing Coverage, Implementation Planning, and Enterprise-Grade Execution

### 1. ROLE AND OBJECTIVE

Act as a Principal Performance Engineering Architect, Senior Java/Spring Boot Engineer, React Architect, Database Designer, Test Automation Specialist, and Distributed Systems Engineer.

Your task is to deeply inspect, analyze, redesign where necessary, and prepare an implementation-ready engineering plan for the Performance Testing module inside the existing Testrix application.

This is a real product engineering task, not an interview exercise, academic explanation, or generic tutorial.

The objective is to evolve Testrix into a comprehensive performance testing platform supporting multiple testing methodologies, workload models, API and browser performance testing, live monitoring, detailed analytics, scheduled executions, distributed execution runners, and future multi-engine support.

Do not begin by blindly rewriting code or introducing new libraries. First understand the existing codebase and identify what already works, what is incomplete, what is incorrectly designed, and what is missing.

Produce a detailed technical analysis and implementation plan grounded in the actual repository.

---

### 2. MANDATORY TECHNOLOGY STACK

The architecture must respect the following stack:

- Frontend: React, using the existing project conventions and dependencies.
- Backend: Java with Spring Boot.
- Database: MySQL.
- Existing performance engine: Grafana k6.
- Future performance engine: Apache JMeter.
- Execution strategy: Isolated engine processes or containers, with support for future distributed runners.
- Visualization: Prefer the existing charting library if suitable; otherwise evaluate Recharts and Apache ECharts.
- Live execution updates: Evaluate Server-Sent Events (SSE), WebSockets, or the existing real-time communication mechanism.
- Scheduling: Inspect and extend the existing API scheduler rather than automatically replacing it.
- Database migrations: Follow the existing migration system; evaluate Flyway if no appropriate system exists.
- Infrastructure monitoring: Evaluate Prometheus, exporters, and compatible time-series storage when justified by actual requirements.

Do not introduce Node.js as the performance backend. Do not replace Spring Boot or MySQL with a different primary backend or database.

Redis, Kafka, RabbitMQ, Quartz, Kubernetes, Prometheus, Grafana, or other infrastructure components must not be introduced merely because they are popular. Explain the actual requirement, benefits, operational cost, and alternatives before recommending each dependency.

---

### 3. FIRST PHASE: COMPLETE EXISTING CODEBASE AUDIT

Inspect the complete relevant Testrix repository, including frontend, backend, database, configuration, scripts, existing execution infrastructure, scheduler, and deployment files.

Do not infer implementation details from filenames alone. Read the relevant source code and trace the actual execution flow.

Inspect the following areas:

A. React frontend:
- Performance dashboard and navigation.
- Existing test creation and configuration forms.
- Virtual-user and workload configuration.
- Test groups, scenarios, and script management.
- Execution history and result views.
- Existing charts, graphs, and statistics.
- API integration layer and authentication.
- Current scheduler UI.
- Drift detection and baseline comparison.
- Error handling, loading states, and live updates.
- Shared Testrix components and theme conventions.

B. Spring Boot backend:
- Controllers, DTOs, services, repositories, and entities.
- Existing k6 execution integration.
- Process creation, output collection, and cancellation.
- Execution lifecycle and status transitions.
- Existing scheduler and its persistence mechanism.
- Queueing, concurrency, locking, retries, and duplicate prevention.
- MySQL schema, indexes, relationships, and migrations.
- Script and artifact storage.
- Existing report generation and metrics aggregation.
- Authentication, authorization, project isolation, and audit logging.
- Existing drift detection and execution comparison logic.

C. Infrastructure:
- Dockerfiles and Docker Compose configuration.
- Existing runner processes and worker management.
- Resource limits and cleanup behaviour.
- Configuration files and environment variables.
- Logging, health checks, deployment assumptions, and CI/CD integration.

For every existing feature, classify it as:

1. Implemented and working.
2. Implemented but incomplete.
3. Implemented with architectural or reliability problems.
4. Missing.
5. Requires verification through an integration test.

Create a file-level inventory showing relevant file paths, responsibilities, dependencies, and recommended changes.

Do not fabricate files, APIs, classes, dependencies, or existing capabilities.

---

### 4. PERFORMANCE TESTING TAXONOMY — COMPLETE COVERAGE

Build a structured catalog of performance testing types and explain how each can be implemented using k6, JMeter, supporting integrations, or a combination of these.

At minimum, evaluate the following categories:

#### A. Core workload tests
- Smoke performance testing.
- Baseline testing.
- Normal-load testing.
- Expected-load testing.
- Peak-load testing.
- Stress testing.
- Spike testing.
- Soak testing.
- Endurance testing.
- Breakpoint testing.
- Capacity testing.
- Scalability testing.
- Volume testing.
- Concurrency testing.
- Burst testing.
- Flash-crowd testing.
- Wave testing.
- Ramp-up and ramp-down testing.
- Step-load testing.
- Recovery testing.
- Failover testing.
- Resilience testing.
- Saturation testing.
- Resource-exhaustion testing.
- Performance regression testing.

#### B. Workload models
- Constant virtual users.
- Ramping virtual users.
- Constant arrival rate.
- Ramping arrival rate.
- Externally controlled workload.
- Closed workload models.
- Open workload models.
- Mixed workload profiles.
- Multiple scenario groups.
- Weighted user journeys.
- Think time and pacing.
- Realistic user-session behaviour.
- Target request-rate profiles.
- Long-running and scheduled workload profiles.

Explain the difference between virtual users, iterations, requests per second, transactions per second, concurrency, and throughput. Do not treat these metrics as interchangeable.

#### C. Application and protocol testing
- REST API performance.
- SOAP over HTTP where applicable.
- GraphQL.
- Authentication and token refresh.
- CRUD operations.
- Multi-step API workflows.
- Dependent requests and correlation.
- Request and response payload sizes.
- File upload and download.
- Pagination, filtering, and search.
- Rate limiting and throttling.
- Timeouts, retries, and backpressure.
- WebSocket workloads.
- gRPC.
- TCP, FTP, LDAP, and other supported protocols.
- Database/JDBC performance.
- JMS and message-queue workloads.
- Asynchronous processing.
- Cache behaviour.
- Third-party integrations.

For every protocol, clearly distinguish native engine support from plugins, extensions, custom scripts, and external integrations. Never claim unsupported functionality is built in.

#### D. Browser and UI performance
- Browser-based login.
- Navigation between pages.
- SPA route transitions.
- Menu and tab interactions.
- Search and filtering journeys.
- Form submission.
- Page readiness and rendering.
- Browser network requests.
- Frontend JavaScript errors.
- Failed resources and console errors.
- Largest Contentful Paint (LCP).
- Interaction to Next Paint (INP).
- Cumulative Layout Shift (CLS).
- Browser memory and resource behaviour where measurable.
- API latency versus browser-observed latency.
- Combined browser and API workloads.

Clearly distinguish functional navigation correctness from browser performance measurement.

Explain why browser-level virtual users have a different resource cost from protocol-level virtual users. Recommend a realistic mixed testing strategy instead of assuming thousands of browser instances can be executed as cheaply as HTTP virtual users.

#### E. Infrastructure and distributed-system performance
- CPU utilization.
- Memory utilization.
- Disk I/O.
- Network throughput and latency.
- Container limits.
- Thread pools and connection pools.
- Database connection saturation.
- Slow queries and lock contention.
- Queue depth and consumer lag.
- Microservice latency.
- Distributed tracing.
- Autoscaling behaviour.
- Load-generator saturation.
- Runner failures and recovery.
- Horizontal and vertical scaling.
- Infrastructure capacity planning.

Separate metrics collected by the load engine from metrics requiring exporters, database instrumentation, tracing, cloud APIs, or external monitoring systems.

#### F. Advanced performance engineering
- Performance budgets.
- SLO/SLA validation.
- Baseline comparison.
- Regression detection.
- Capacity forecasting.
- Latency distribution analysis.
- Anomaly detection.
- Bottleneck correlation.
- Performance trends across releases.
- Performance testing in CI/CD.
- Scheduled performance regression suites.

For every test category, provide:

- Objective.
- Suitable application scenarios.
- Required configuration fields.
- Recommended engine.
- Implementation approach.
- Required libraries or infrastructure.
- Metrics collected.
- Thresholds and pass/fail criteria.
- Limitations.
- Implementation priority.

Classify each capability as:
1. Native engine functionality.
2. Requires Testrix orchestration or custom code.
3. Requires an external integration.
4. Experimental or subject to technical validation.

---

### 5. TARGET ARCHITECTURE

Design the target architecture using React, Spring Boot, and MySQL.

The architecture should include:

1. React Performance Workspace.
2. Spring Boot REST API.
3. Test Definition Service.
4. Scenario and Workload Configuration.
5. Script and Test-Plan Management.
6. Execution Orchestrator.
7. Scheduler.
8. Persistent Queue or equivalent dispatch mechanism.
9. Runner Registry and Health Monitoring.
10. k6 Engine Adapter.
11. Future JMeter Engine Adapter.
12. Metrics Collection and Normalization.
13. Threshold Evaluation.
14. Reporting and Analytics.
15. Historical Baselines and Regression Detection.
16. Artifact Storage.
17. Infrastructure Observability.
18. Authentication, authorization, and audit logging.

Provide:

- Architecture diagram.
- Component responsibilities.
- Synchronous versus asynchronous interactions.
- Execution lifecycle.
- Failure paths.
- Data ownership.
- Security boundaries.
- Scaling strategy.
- Deployment topology.
- Trade-offs between a modular monolith and microservices.

Prefer a modular Spring Boot backend initially unless repository evidence or demonstrated scaling requirements justify separating services.

Do not create a separate service for every module by default.

---

### 6. ENGINE ABSTRACTION AND MULTI-ENGINE SUPPORT

Design a stable engine abstraction so k6 is supported immediately and JMeter can be introduced later without rewriting the complete application.

Evaluate an interface conceptually similar to:

- getEngineType()
- validateExecution()
- prepareExecution()
- launchExecution()
- getExecutionStatus()
- collectMetrics()
- cancelExecution()
- collectFinalResult()
- collectArtifacts()

These are conceptual operations, not mandatory method signatures.

Define a normalized execution specification that includes:

- Test definition ID.
- Execution ID.
- Project and environment.
- Engine and engine version.
- Script or test-plan version.
- Scenario configuration.
- Workload model.
- Duration and execution stages.
- Test data references.
- Thresholds.
- Environment variables and secret references.
- Resource limits.
- Target authorization policy.

Define a common metrics model for:

- Requests and iterations.
- Response-time distributions.
- Throughput.
- Errors and failed checks.
- Dropped iterations.
- Active users.
- Data transfer.
- Engine health.
- Threshold evaluation.

Preserve engine-specific metrics and artifacts instead of forcing every engine into an identical feature set.

For JMeter, evaluate:
- JMX import and export.
- Non-GUI execution.
- CLI arguments and properties.
- JTL result processing.
- CSV data files.
- Plugins and protocol-specific samplers.
- Distributed execution.
- Version compatibility.
- Resource management.
- Result normalization.

Explicitly prevent accidental workload multiplication in distributed JMeter execution.

---

### 7. TEST STUDIO AND CONFIGURATION BUILDER

Design a complete React Test Studio.

The configuration workflow should cover:

1. Test identity and project.
2. Environment and target URL.
3. Engine selection.
4. Script/test-plan selection.
5. Test type.
6. Workload model.
7. Virtual users or arrival rate.
8. Ramp-up, steady-state, spike, ramp-down, and recovery stages.
9. Duration and iteration limits.
10. Scenario groups and weighted user journeys.
11. Request headers and authentication references.
12. Test data and parameterization.
13. Correlation and dynamic values.
14. Thresholds and performance budgets.
15. Runner selection and resource limits.
16. Validation and preflight checks.
17. Execution review and confirmation.

Support predefined workload templates and advanced custom configuration.

Explain how each template maps to actual k6 executors or JMeter Thread Groups, timers, controllers, and properties.

Provide validation rules, reasonable defaults, configuration constraints, and engine-specific limitations.

Do not create a generic form that exposes every field for every test type. The configuration UI must adapt to the selected engine, protocol, test type, and workload model.

---

### 8. API AND BROWSER NAVIGATION TESTING

Treat API performance and browser-based UI performance as separate but related execution modes.

For API performance:
- Endpoint and multi-step workflow testing.
- Authentication and token refresh.
- Request correlation and dynamic test data.
- Response validation.
- Error-rate measurement.
- Latency and throughput.
- Rate limiting.
- Request groups and endpoint-level results.

For browser performance:
- Browser navigation journeys.
- Page readiness and rendering.
- Element visibility and interaction timing.
- Route transitions.
- Browser network requests.
- Frontend errors.
- Core Web Vitals.
- API timing versus end-to-end browser timing.

Support a combined scenario where browser and API executions are correlated by test ID, time window, environment, and workload configuration.

Define which operations run through k6 browser functionality, which use protocol-level requests, and which require additional tooling.

Do not represent API response time as equivalent to complete browser navigation time.

---

### 9. LIVE MONITORING AND CHARTING

Inspect the existing React chart library before introducing another dependency.

Evaluate Recharts for standard React dashboards and Apache ECharts for advanced or high-volume visualization requirements.

Design the following visualizations:

#### Dashboard KPIs
- Total executions.
- Active executions.
- Pass rate and threshold failure rate.
- Average, p95, and p99 latency.
- Peak throughput.
- Error rate.
- Queued and running jobs.
- Runner availability.
- Recent regressions.

#### Live execution charts
- Latency percentiles over time.
- Requests per second.
- Iterations per second.
- Active virtual users.
- Target versus achieved arrival rate.
- Dropped iterations.
- Failed requests and error rate.
- CPU and memory utilization.
- Network utilization.
- Endpoint/group-level latency.
- Execution phase timeline.
- Threshold breach events.

#### Historical analytics
- Daily and weekly execution trends.
- Pass/fail distribution.
- Latency regression trends.
- Throughput comparisons.
- Test-type distribution.
- Engine usage.
- Slowest endpoints.
- Baseline versus current run.
- Release-to-release performance.
- Resource utilization comparisons.

#### Advanced visualizations
- Latency histograms.
- Heatmaps.
- Scatter plots.
- Endpoint ranking.
- Resource-versus-latency correlation.
- Capacity curves.
- Load-versus-error-rate curves.
- Performance degradation over time.

For every chart, specify:
- Data source.
- Metric definition.
- Aggregation window.
- API response schema.
- Update frequency.
- Empty/loading/error states.
- Whether it supports live or completed runs.
- Whether data is real or derived.
- Any sampling, aggregation, or downsampling required.

Never use invented demo values as production metrics.

Define the semantics of average, p50, p90, p95, p99, maximum, requests/sec, transactions/sec, error rate, and dropped iterations.

Explain why percentiles cannot generally be averaged across time windows or distributed workers without appropriate histogram/sketch or raw-sample aggregation.

Use Server-Sent Events for one-way live updates where suitable. Use WebSockets only when bidirectional communication materially benefits the application.

Do not stream every raw metric sample directly to React. Define a controlled aggregation and update strategy.

---

### 10. PERFORMANCE SCHEDULER REDESIGN

The current scheduler is primarily intended for API testing. Evaluate it and evolve it into a reusable execution scheduler without unnecessarily breaking existing API scheduling.

Support:
- Manual execution.
- Run now.
- One-time schedules.
- Recurring schedules.
- Cron-based schedules.
- Daily and weekly schedules.
- Explicit timezone.
- Start and end dates.
- Schedule enable/disable.
- Next-run preview.
- Missed-run policy.
- Retry policy.
- Execution timeout.
- Concurrency policies.
- Project and tenant quotas.
- Queue priority and fairness.
- Runner capacity checks.
- Cancellation.
- Duplicate-trigger prevention.
- Distributed locking or equivalent coordination.
- Worker heartbeats.
- Failure recovery.
- Audit history.
- Notifications.
- Scheduled regression suites.

Clearly separate:
- Schedule trigger.
- Queue admission.
- Job dispatch.
- Worker execution.
- Execution retry.
- Performance outcome.

A failed performance threshold is not automatically an execution failure and must not trigger an infrastructure retry.

Evaluate the existing scheduler first. Consider Spring scheduling, Quartz, or an external queue only according to demonstrated requirements.

If a persistent queue is needed, compare a MySQL-backed approach, Redis/BullMQ-equivalent infrastructure where compatible, and a Java-native messaging option. Do not introduce multiple overlapping schedulers or queues without justification.

Define queue/job states, idempotency keys, concurrency controls, retry rules, and failure recovery.

---

### 11. RUNNER MANAGEMENT AND DISTRIBUTED EXECUTION

Design a runner management subsystem supporting:

- k6 workers.
- Future JMeter workers.
- Engine and version compatibility.
- Runner registration.
- Heartbeat and health status.
- CPU and memory availability.
- Worker capacity.
- Maximum concurrent executions.
- Project/tenant assignment.
- Execution cancellation.
- Worker loss detection.
- Stale-job recovery.
- Container isolation.
- Artifact collection.
- Worker logs.
- Engine-specific configuration.

The dispatcher must select eligible workers based on capability, availability, capacity, project limits, and execution requirements.

Define a safe worker protocol, including authenticated job assignment, status updates, heartbeat, cancellation, and final result delivery.

Ensure workers cannot execute arbitrary host commands or access unrelated projects' secrets and artifacts.

Explain how runner saturation differs from target-system saturation and how the UI should expose both.

---

### 12. MYSQL DATA MODEL

Inspect the current schema before designing new tables.

Evaluate the following logical entities:

- Test definitions.
- Scenarios.
- Script versions.
- Test data references.
- Workload profiles.
- Threshold definitions.
- Schedules.
- Scheduled execution records.
- Executions.
- Execution phases.
- Execution events.
- Endpoint summaries.
- Threshold results.
- Runner registry.
- Artifact metadata.
- Baselines.
- Notifications.
- Audit records.

For each entity, define:
- Purpose.
- Columns and types.
- Primary and foreign keys.
- Unique constraints.
- Indexes.
- Relationships.
- Lifecycle and retention.
- Tenant/project ownership.
- Migration requirements.

Use MySQL for configuration, scheduling metadata, execution lifecycle, final summaries, endpoint aggregates, and artifact references.

Do not store every high-frequency time-series sample in MySQL by default. Evaluate Prometheus or another suitable metrics store for time-series telemetry and object storage for large raw results and reports.

Define how the application behaves if metrics storage is temporarily unavailable while an engine is running.

---

### 13. METRICS PIPELINE AND RESULT NORMALIZATION

Design a complete metrics pipeline:

Engine output
→ Collector
→ Validation
→ Normalization
→ Time-window aggregation
→ Time-series persistence
→ Threshold evaluation
→ Live updates
→ Final summaries
→ Reports and analytics.

For k6, evaluate supported built-in metrics, custom metrics, tags, thresholds, and output mechanisms.

For JMeter, evaluate JTL output and the mapping of available sample data into the common result schema.

Preserve:
- Raw artifacts.
- Engine-specific metadata.
- Script/test-plan version.
- Workload configuration.
- Environment.
- Execution start/end times.
- Runner identity.
- Engine version.
- Threshold results.

Define a common execution status separately from the performance outcome.

Suggested execution states:
QUEUED, PREPARING, STARTING, RUNNING, STOPPING, FINALIZING, COMPLETED, FAILED, CANCELLED, TIMED_OUT, PARTIAL.

Suggested performance outcomes:
PASS, FAIL, INCONCLUSIVE, NOT_EVALUATED.

Define the rules for missing metrics, insufficient samples, partial runs, worker crashes, and threshold evaluation.

---

### 14. THRESHOLDS, BASELINES, AND REGRESSION DETECTION

Implement configurable performance budgets and threshold evaluation.

Examples include:
- p95 response time below a configured limit.
- Error rate below a configured percentage.
- Minimum required throughput.
- Browser LCP target.
- Endpoint-specific latency limits.
- Maximum acceptable dropped-iteration rate.
- Infrastructure resource limits where telemetry is available.

These must be configurable rather than universal hardcoded values.

For every threshold, define:
- Metric.
- Aggregation method.
- Time window.
- Scope.
- Operator.
- Limit.
- Severity.
- Evaluation status.
- Handling of missing or insufficient data.

Design baseline selection, run comparison, regression percentages, tolerance bands, and confidence requirements.

Compare runs only when workload, environment, script version, engine version, duration, and measurement conditions are sufficiently compatible.

Explain the limitations of comparing p95/p99 values, especially when sample counts are low or workload profiles differ.

Do not classify random fluctuations as definite regressions without an appropriate comparison policy.

---

### 15. SECURITY AND OPERATIONAL SAFETY

The platform generates traffic against configured targets. Safety controls are mandatory.

Implement or recommend:
- Target URL allowlists.
- Environment authorization.
- Private network and SSRF protections.
- Credential and secret management.
- Tenant isolation.
- CPU, memory, duration, and concurrency limits.
- Maximum request-rate limits.
- Execution timeout.
- Emergency cancellation.
- Artifact access control.
- Secret redaction in logs.
- Audit trails.
- Worker/container isolation.
- Dependency and script validation.
- Safe handling of uploaded JMX, JavaScript, and data files.

Do not permit unrestricted execution of arbitrary shell commands.

Do not execute load tests against unauthorized external systems. Provide explicit confirmation and stronger limits for production targets.

Define safe default limits and the approval process for increasing them.

---

### 16. CI/CD AND AUTOMATION INTEGRATION

Evaluate how Testrix can support:
- Manual execution.
- Scheduled performance suites.
- Git-based script versioning.
- CI/CD-triggered runs.
- Release validation.
- Baseline comparison.
- Performance regression quality gates.
- Result APIs and webhooks.
- Notifications.
- Execution history linked to builds/releases.

Define how an external pipeline submits a test, receives an execution ID, waits for completion, and obtains the final outcome.

Do not mark a release as failed solely because the engine process returned a non-zero code; distinguish threshold failures from script errors, infrastructure failures, and intentional cancellation.

---

### 17. TESTING THE TESTING PLATFORM

The Testrix platform itself must be tested.

Define automated tests for:
- Unit-level workload configuration validation.
- Engine adapter behaviour.
- Execution lifecycle transitions.
- Scheduler idempotency.
- Concurrent job dispatch.
- Worker heartbeat and loss.
- Cancellation and timeout.
- Metrics normalization.
- Threshold calculations.
- Percentile aggregation.
- API authorization.
- Tenant isolation.
- Database migrations.
- Artifact persistence.
- SSE reconnect behaviour.
- Frontend charts with missing or partial data.
- End-to-end k6 execution.
- Future JMeter integration.
- Failure injection and recovery.

Include tests for edge cases such as:
- Zero requests.
- Empty metrics.
- Missing percentiles.
- Worker crashes mid-run.
- Duplicate scheduler triggers.
- Database unavailable during finalization.
- Metrics backend unavailable.
- Invalid script.
- Invalid target URL.
- Insufficient samples.
- Partial result files.
- Execution exceeding the permitted duration.

---

### 18. REQUIRED OUTPUT FORMAT

Produce the analysis in the following order:

1. Executive summary.
2. Existing repository audit.
3. Current feature inventory.
4. Missing-feature and risk matrix.
5. Complete performance-testing taxonomy.
6. Engine capability matrix for k6 and JMeter.
7. Target architecture and diagrams.
8. Backend package architecture.
9. Frontend information architecture.
10. Detailed execution lifecycle.
11. Test Studio configuration design.
12. Workload model and template mapping.
13. API and browser testing implementation.
14. Chart and statistics specification.
15. Scheduler redesign.
16. Runner and distributed execution architecture.
17. MySQL schema and migrations.
18. Metrics pipeline and storage strategy.
19. Thresholds, baselines, and regression analysis.
20. Security and operational controls.
21. Required libraries and dependency justification.
22. API endpoint inventory with request/response examples.
23. Failure handling and recovery strategy.
24. Testing strategy for the platform itself.
25. Phased implementation roadmap.
26. File-level change plan.
27. Acceptance criteria for each phase.
28. Risks, trade-offs, and unresolved technical decisions.

Use diagrams, tables, realistic examples, pseudocode, and representative API contracts where useful.

Distinguish verified repository facts from recommendations and assumptions.

Cite official documentation for current engine capabilities, framework integrations, and important technical constraints when external research is available.

Do not invent repository findings, performance numbers, benchmarks, or implementation status.

---

### 19. IMPLEMENTATION ROADMAP

Propose a staged delivery plan:

Phase 0: Existing codebase audit and architecture validation.

Phase 1: Common execution lifecycle, engine abstraction, validation, and reliable k6 execution.

Phase 2: Complete workload templates, thresholds, and script management.

Phase 3: Live monitoring, result normalization, and detailed reports.

Phase 4: Scheduler enhancement, persistent queueing, and safe dispatch.

Phase 5: Browser performance and Core Web Vitals.

Phase 6: Infrastructure monitoring and historical analytics.

Phase 7: Distributed workers and capacity-aware execution.

Phase 8: JMeter adapter and advanced protocol support.

Phase 9: CI/CD, regression gates, enterprise security, and operational hardening.

Adjust this order if repository evidence shows that an earlier dependency must be implemented first.

For each phase, define:
- Scope.
- Dependencies.
- Existing files to modify.
- New files to add.
- Libraries required.
- Database changes.
- APIs.
- Frontend changes.
- Tests.
- Acceptance criteria.
- Risks.
- Definition of done.

Do not assume all phases must be completed before useful functionality can ship.

---

### 20. EXECUTION INSTRUCTIONS

Start by auditing the actual repository.

Do not immediately generate a large amount of code.

Do not delete or rewrite existing working features without evidence.

Do not introduce duplicate scheduling, execution, reporting, or authentication systems.

Do not add libraries without explaining their purpose and compatibility.

Do not claim that a feature is implemented unless you can verify it.

Do not expose raw high-frequency metrics directly to the frontend without an aggregation strategy.

Do not treat protocol-level and browser-level virtual users as equivalent.

Do not confuse execution failure with performance-threshold failure.

Do not assume every performance test type requires a separate engine.

Do not assume every listed protocol is natively supported by k6 or JMeter.

First deliver the complete repository audit, architecture analysis, capability matrix, implementation plan, and prioritized file-level change list.

Then identify the first implementation phase and its dependencies. Proceed with code changes only when explicitly authorized, or when the surrounding development workflow already authorizes implementation.

The final goal is a maintainable, secure, scalable Testrix Performance Testing platform built on React, Spring Boot, and MySQL, with k6 as the initial engine and JMeter as a planned additional engine, providing reliable execution, comprehensive metrics, meaningful visual analytics, scheduling, browser performance testing, and a clear path to distributed load generation.