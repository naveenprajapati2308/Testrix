# Phase 2 Execution Center Redesign — Code Review & Architecture Audit Report

**Document Target:** `docs/context/api.md`  
**Review Subject:** Dynamic Framework → Module → Environment Redesign (Phase 2)  
**Status:** Code Review Completed — Implementation Analysis & Action Plan  
**Target Repositories & Layers:**
- `products/automation-portal/backend` (Spring Boot 3 / Java 21)
- `products/automation-portal/frontend` (React 19 / Vite)
- `platform/shell` (Vite / React Shell Admin Workspace)
- Database: MySQL `testrix_platform` schema (Flyway migrations `V14`, `V16`, `V18`)

---

## 1. Executive Summary & Audit Verdict

### Original Objective
To redesign the relationship between **Frameworks**, **Modules**, and **Environments** so that:
1. Every Framework owns its own modules (Module names are not globally unique; they are scoped by `Framework + Module`).
2. Module → Environment mapping is explicit (a module only shows supported environments).
3. Configuration (Base URL, Timeout, Browsers, Parameters) belongs to the `Module + Environment` combination.
4. Execution Center UI flow is completely dynamic and driven by backend metadata:
   $$\text{Select Framework} \longrightarrow \text{Load Modules} \longrightarrow \text{Select Module} \longrightarrow \text{Load Supported Envs} \longrightarrow \text{Select Env} \longrightarrow \text{Load Options} \longrightarrow \text{Execute}$$
5. Administration of Modules and Environments is unified into a single source of truth.

### Audit Verdict

| Requirement Area | Status in Codebase | Implementation Details | Critical Gaps / Smells |
| :--- | :--- | :--- | :--- |
| **1. Framework → Module Mapping** | **PARTIAL** | DB has `(code, runner_type)` unique constraint (`V14`). Entity has `runnerType`. | **Multi-Tenancy Bug:** `projectId` is missing from uniqueness validation in `ModuleController.create()`. Frameworks are hardcoded in Java memory (`FrameworkRegistry`), not DB-driven. |
| **2. Module → Environment Mapping** | **CONFIRMED** | `module_environments` join table (`V16`). `GET /api/modules/{id}/environments` returns only enabled environments. | Advanced Mode ("Raw Suite XML") bypasses module validation entirely and displays all active environments. |
| **3. Environment Configuration** | **CONFIRMED** | `module_environments` stores `base_url`, `config_json`, `browsers`, `timeout_minutes`, `execution_params_json`. `ModuleEnvironmentResolver` handles cascading inheritance. | `config_json` (credentials/secrets) is stored in DB but never actually propagated down to `ExecutionWorker` / runner execution payload. |
| **4. Dynamic Execution Flow** | **CONFIRMED** | `ExecutionCenter.jsx` implements full cascading hooks (`selectedFramework` $\to$ `modules` $\to$ `supportedEnvironments` $\to$ `moduleEnvOptions`). | Async race conditions exist if user quickly changes frameworks while previous module environment fetch is in-flight. |
| **5. Browser Mapping** | **CONFIRMED** | Resolved via `ModuleEnvironmentResolver.resolveBrowsers()`. Server-side validation enforced in `ExecutionService`. | Runner Docker image only has Chrome binaries installed; selecting Firefox/Edge/WebKit will fail at runtime despite backend validation passing. |
| **6. Future Module Controller** | **CONFIRMED** | `ModuleAdminController` and `ModuleEnvironmentAdminController` are already built with full CRUD endpoints. | Modules are split across two controllers instead of one unified controller. |
| **7. Dashboard Compatibility** | **CONFIRMED** | `Execution` entity carries `framework` and `moduleCode`. Analytics endpoints query normalized fields. | Dashboard queries use `moduleCode` string instead of `moduleId`, which can cause aggregation collisions if two frameworks share the same module code. |
| **8. Component Blast Radius** | **AUDITED** | 5 Backend Controllers, 4 Repositories, 3 DB Migrations, 2 Frontends identified. | Shell Admin and Automation Portal have duplicate state and isolated styles. |
| **9. Unified Admin Management** | **PARTIAL** | `ModuleManagement.jsx` has `ModuleEnvironmentMappingPanel.jsx` embedded in Shell Admin. | `EnvironmentView.jsx` remains isolated inside Automation Portal iframe; Environments and Modules are still managed across two separate screens. |

---

## 2. Deep-Dive Code Review Against the 9 Phase 2 Requirements

---

### Requirement 1: Framework → Module Mapping
> **Spec:** Every Framework owns its own modules. Module names may be identical across different Frameworks (e.g. `Land` in Selenium vs `Land` in Playwright). The system must never assume module names are globally unique. The relationship must always be `Framework + Module`.

#### Current Implementation
1. **Database Schema (`V14__modules_composite_unique.sql`):**
   ```sql
   ALTER TABLE modules
       DROP INDEX code,
       ADD UNIQUE KEY uq_modules_code_runner_type (code, runner_type);
   ```
   The database correctly enforces composite uniqueness on `(code, runner_type)`.
2. **Entity & Repository:**
   - [ModuleEntity.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/modules/ModuleEntity.java#L26-L27):
     ```java
     @Column(name = "runner_type", nullable = false)
     private String runnerType = "MAVEN_TESTNG";
     ```
   - [ModuleRepository.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/modules/ModuleRepository.java):
     ```java
     Optional<ModuleEntity> findByCodeAndRunnerType(String code, String runnerType);
     List<ModuleEntity> findByProjectIdAndRunnerType(Long projectId, String runnerType);
     ```
3. **Framework Registry:**
   - [FrameworkRegistry.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/frameworks/FrameworkRegistry.java#L20-L45) registers:
     - `MAVEN_TESTNG` (Selenium, code `SL`)
     - `PLAYWRIGHT` (Playwright, code `PL`)

#### Code Review Findings & Bugs
* **CRITICAL BUG (Multi-Tenancy Collision in Wizard Module Creation):**  
  In [ModuleController.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/modules/ModuleController.java#L84-L87):
  ```java
  if (repository.findByCodeAndRunnerType(body.getCode(), runnerType).isPresent()) {
      throw new IllegalArgumentException(
          "A " + runnerType + " module with code '" + body.getCode() + "' already exists.");
  }
  ```
  `findByCodeAndRunnerType` does **not** check `projectId`!  
  If Project `A` has a module `LAND` for `MAVEN_TESTNG`, Project `B` will be rejected with an error if they try to create a module named `LAND` for `MAVEN_TESTNG`.  
  *Fix Required:* Must check `findByProjectIdAndCodeAndRunnerType(callerProjectId, body.getCode(), runnerType)`.
* **ARCHITECTURAL LIMITATION (Hardcoded Frameworks):**  
  `FrameworkRegistry` is an in-memory Java `@Component` with zero database representation. To add a new framework (e.g. Cypress, REST Assured), a developer must modify Java code and recompile.

---

### Requirement 2: Module → Environment Mapping
> **Spec:** Every module must explicitly define which environments it supports. When a user selects a Framework and Module, only supported environments should be displayed. Unsupported environments must never appear in Execution Center.

#### Current Implementation
1. **Join Table (`V16__module_environment_mapping.sql`):**
   ```sql
   CREATE TABLE module_environments (
       id BIGINT AUTO_INCREMENT PRIMARY KEY,
       module_id BIGINT NOT NULL,
       environment_id BIGINT NOT NULL,
       enabled BOOLEAN NOT NULL DEFAULT TRUE,
       base_url VARCHAR(500) NULL,
       config_json TEXT NULL,
       browsers VARCHAR(255) NULL,
       timeout_minutes INT NULL,
       execution_params_json TEXT NULL,
       CONSTRAINT uq_module_environment UNIQUE (module_id, environment_id),
       CONSTRAINT fk_module_environments_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
       CONSTRAINT fk_module_environments_environment FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE
   );
   ```
2. **Backend API ([ModuleController.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/modules/ModuleController.java#L137-L149)):**
   ```java
   @GetMapping("/{id}/environments")
   public ApiResponse<List<EnvironmentSummaryDto>> supportedEnvironments(@PathVariable Long id) {
       requireModuleAccess(id);
       List<Long> environmentIds = moduleEnvironmentRepository.findByModuleId(id).stream()
               .filter(ModuleEnvironmentEntity::isEnabled)
               .map(ModuleEnvironmentEntity::getEnvironmentId)
               .toList();
       return ApiResponse.ok(environmentRepository.findAllById(environmentIds).stream()
               .filter(EnvironmentEntity::isActive)
               .map(EnvironmentSummaryDto::from)
               .toList());
   }
   ```
3. **Frontend Consumer ([ExecutionCenter.jsx](file:///d:/Testrix/products/automation-portal/frontend/src/components/execution/ExecutionCenter.jsx#L79-L96)):**
   ```javascript
   api.moduleEnvironments(mod.id).then(list => setSupportedEnvironments(list));
   ```

#### Code Review Findings
* **POSITIVE:** Supported environments are strictly filtered by `enabled=true` in `module_environments` AND `active=true` in `environments`.
* **SECURITY HOLE (Raw XML Execution Bypass):**  
  In [ExecutionCenter.jsx](file:///d:/Testrix/products/automation-portal/frontend/src/components/execution/ExecutionCenter.jsx#L81-L83):
  ```javascript
  if (showAdvanced || !selectedModule) {
    setSupportedEnvironments(environments || []);
    return;
  }
  ```
  In "Advanced Mode" (Suite XML path), the UI falls back to **all** environments, allowing test execution against unmapped environments.

---

### Requirement 3: Environment Configuration
> **Spec:** Each Module + Environment combination should maintain its own configuration (Base URL, Credentials, API Endpoint, Browser, Timeout, Execution Parameters). Configuration must belong to the Module + Environment combination.

#### Current Implementation
1. **Per-Mapping Storage:**
   `module_environments` table stores overrides: `base_url`, `config_json`, `browsers`, `timeout_minutes`, `execution_params_json`.
2. **Cascading Inheritance Engine ([ModuleEnvironmentResolver.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/moduleenvironments/ModuleEnvironmentResolver.java)):**
   - **Base URL:** `mapping.getBaseUrl() != null ? mapping.getBaseUrl() : environment.getBaseUrl()`
   - **Timeout:** `mapping.getTimeoutMinutes() != null ? mapping.getTimeoutMinutes() : 120`
   - **Browsers:** `mapping.getBrowsers() != null ? split(mapping.getBrowsers()) : frameworkBrowsers`
3. **Admin API vs Public API Separation:**
   - Public endpoint `GET /api/modules/{id}/environments/{envId}/options` returns sanitized, non-secret options (`baseUrl`, `browsers`, `timeoutMinutes`).
   - Admin endpoint `GET /api/admin/module-environments/{id}` includes raw `configJson` and `executionParamsJson`.

#### Code Review Findings & Smells
* **SEVERITY: HIGH (Dormant Configuration in Execution Engine):**  
  While `ModuleEnvironmentEntity` stores `config_json` and `execution_params_json`, in [ExecutionService.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/executions/ExecutionService.java#L114-L126) and [ExecutionWorker.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/executions/ExecutionWorker.java), the worker **does not inject** `config_json` key-values into the execution environment variables or command-line system properties when calling `framework-runner`.
  *Result:* The admin UI allows typing credentials and parameters, but they are never delivered to the running test container!

---

### Requirement 4: Dynamic Execution Flow
> **Spec:** Select Framework $\to$ Load Modules $\to$ Select Module $\to$ Load Supported Environments $\to$ Select Environment $\to$ Load Configuration $\to$ Load Browser Options $\to$ Execute. Every dropdown must be loaded dynamically.

#### Current Implementation ([ExecutionCenter.jsx](file:///d:/Testrix/products/automation-portal/frontend/src/components/execution/ExecutionCenter.jsx))
1. **Framework Dropdown:** Populated dynamically via `api.frameworks()`.
2. **Module Dropdown:** Filtered dynamically:
   ```javascript
   const activeModules = (modules || [])
     .filter(m => m.active !== false)
     .filter(m => m.runnerType === selectedFramework);
   ```
3. **Environment Dropdown:** Filtered dynamically via `api.moduleEnvironments(mod.id)`.
4. **Browser Dropdown:** Derived dynamically from `moduleEnvOptions?.browsers`.
5. **Tags Dropdown:** Discovered dynamically via `api.moduleTags(mod.id)` from the module's test specs.

#### Code Review Findings
* **POSITIVE:** State cascading is well managed; changing `selectedFramework` automatically resets `selectedModule`, which resets `selectedSubType`, which resets `selectedEnv` and `selectedBrowser`.
* **RACE CONDITION RISK:**  
  When rapidly clicking different frameworks, multiple `api.moduleEnvironments()` promises run concurrently. Because there is no request deduplication or abort controller (only a local `cancelled` boolean inside the `useEffect`), rapid clicking can cause a slower network response from a previous framework to overwrite the active state.

---

### Requirement 5: Browser Mapping
> **Spec:** Browser availability depends on Framework, Module, Environment. Only supported browsers should be displayed.

#### Current Implementation
1. **Hierarchy of Resolution:**
   - Level 1 (Framework Default): `FrameworkRegistry.find(runnerType).browsers()`
   - Level 2 (Module + Environment Override): `ModuleEnvironmentEntity.browsers` (CSV string)
   - Computed via `ModuleEnvironmentResolver.resolveBrowsers()`.
2. **Server-Side Enforcement ([ExecutionService.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/executions/ExecutionService.java#L155-L164)):**
   ```java
   if (requestedBrowser != null && !requestedBrowser.isBlank()) {
       List<String> frameworkBrowsers = frameworkRegistry.find(framework).map(fw -> fw.browsers()).orElse(List.of());
       List<String> allowedBrowsers = ModuleEnvironmentResolver.resolveBrowsers(mapping, frameworkBrowsers);
       if (!allowedBrowsers.contains(requestedBrowser)) {
           throw new IllegalArgumentException("Browser '" + requestedBrowser + "' is not supported...");
       }
   }
   ```

#### Code Review Findings
* **POSITIVE:** Server validates requested browser against the resolved list; unauthorized browser values passed via direct API calls are rejected with an `IllegalArgumentException`.
* **ENVIRONMENT LIMITATION:**  
  In [FrameworkRegistry.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/frameworks/FrameworkRegistry.java#L42), `PLAYWRIGHT` only lists `java.util.List.of("chrome")`. `MAVEN_TESTNG` lists `List.of()` (empty list, because browser is hardcoded in Java TestNG suites).  
  *Limitation:* Multi-browser testing (Firefox, Edge, Safari/WebKit) is not yet supported at the container runner layer.

---

### Requirement 6 & 9: Unified Module & Environment Management
> **Spec:** Modules and Environments are closely related and should be managed from a single administration area instead of separate disconnected screens. Single source of truth.

#### Current Implementation
1. **Shell Admin Workspace ([ModuleManagement.jsx](file:///d:/Testrix/platform/shell/src/components/admin/ModuleManagement.jsx)):**
   - Renders data table of modules.
   - Embeds [ModuleEnvironmentMappingPanel.jsx](file:///d:/Testrix/platform/shell/src/components/admin/ModuleEnvironmentMappingPanel.jsx) inside a modal drawer when the user clicks the "Environments" button on a module row.
   - Supports creating/editing modules, toggling active, assigning runner type, setting visibility, configuring `allowed_roles`.
2. **Automation Portal ([EnvironmentView.jsx](file:///d:/Testrix/products/automation-portal/frontend/src/components/environments/EnvironmentView.jsx)):**
   - Lives inside the iframe under `/automation/#/environments`.
   - Manages environment CRUD (Base URL, Captcha keys, Auth configs).

#### Code Review Findings & Smells
* **SPLIT UX & DISCONNECTED SCREENS:**  
  The management is still split into two disconnected areas:
  - **Where Environments are Created:** In `automation-portal/EnvironmentView.jsx` (Iframe).
  - **Where Modules are Created & Mapped:** In `platform/shell/ModuleManagement.jsx` (Shell).
  An administrator must switch contexts between the outer Shell Admin and the embedded Automation Portal to configure an end-to-end flow.

---

### Requirement 7: Dashboard Compatibility
> **Spec:** Current dashboard functionality must continue working. Standardized execution metadata. Avoid framework-specific logic inside dashboard components.

#### Current Implementation
1. Normalized Execution Model:
   The `executions` table stores:
   - `framework` (e.g. `MAVEN_TESTNG`, `PLAYWRIGHT`)
   - `module_code` (e.g. `LAND`, `SURVEY`)
   - `status`, `pass_rate`, `total_test_cases`, `duration_ms`
2. Analytics Endpoints ([DashboardController.java](file:///d:/Testrix/products/automation-portal/backend/src/main/java/com/automationportal/dashboard/DashboardController.java)):
   - `/api/dashboard/summary`
   - `/api/dashboard/trends`
   - `/api/dashboard/module-health`
   All aggregate by standardized database columns.

#### Code Review Findings
* **DATA AGGREGATION HAZARD:**  
  Because `V14` permits identical `code` across different frameworks (e.g. `LAND` in Selenium and `LAND` in Playwright), the query in `DashboardRepository`:
  ```sql
  SELECT module_code, COUNT(*), AVG(pass_rate) FROM executions GROUP BY module_code;
  ```
  groups **both frameworks together under the same name**.  
  *Impact:* The dashboard cannot distinguish between Selenium's `LAND` pass rate and Playwright's `LAND` pass rate.

---

## 3. Inventory of Affected Components

The complete blast radius of the Framework $\to$ Module $\to$ Environment architecture encompasses:

```
Testrix Architecture Blast Radius
│
├── 1. Database Layer (MySQL: testrix_platform)
│   ├── modules (id, project_id, code, name, runner_type, visible, allowed_roles, parent_module_id, test_engine_id)
│   ├── environments (id, project_id, code, name, base_url, active)
│   ├── module_environments (id, module_id, environment_id, enabled, base_url, config_json, browsers, timeout_minutes)
│   └── executions (id, project_id, execution_code, execution_type, framework, module_code, requested_browser, tag_filter)
│
├── 2. Backend API Layer (Spring Boot: com.automationportal)
│   ├── frameworks/FrameworkRegistry.java              <-- In-memory framework descriptors
│   ├── modules/ModuleController.java                  <-- Public listing & wizard endpoints
│   ├── modules/ModuleAdminController.java             <-- Super-admin module CRUD
│   ├── moduleenvironments/ModuleEnvironmentResolver.java <-- Cascading config resolution
│   ├── moduleenvironments/ModuleEnvironmentAdminController.java <-- Overrides CRUD
│   ├── executions/ExecutionService.java               <-- Server-side validation pipeline
│   └── executions/ExecutionWorker.java                <-- Execution job dispatch
│
├── 3. Frontend Automation Portal (React / Vite)
│   ├── src/components/execution/ExecutionCenter.jsx   <-- Cascading dynamic execution flow
│   ├── src/components/environments/EnvironmentView.jsx <-- Disconnected environment manager
│   └── src/api.js                                     <-- API client endpoints
│
└── 4. Frontend Platform Shell (React / Vite)
    ├── src/components/admin/ModuleManagement.jsx      <-- Admin module grid
    ├── src/components/admin/ModuleEnvironmentMappingPanel.jsx <-- Per-module environment overrides
    └── src/constants.js                               <-- Navigation definitions
```

---

## 4. Prioritized Remediation & Implementation Plan

Before expanding functionality, execute the following technical fixes:

### Step 1: Fix Multi-Tenancy Module Collision (Immediate Bugfix)
* **File:** `products/automation-portal/backend/src/main/java/com/automationportal/modules/ModuleController.java`
* **Action:** Change line 84:
  ```java
  // BEFORE:
  if (repository.findByCodeAndRunnerType(body.getCode(), runnerType).isPresent())
  
  // AFTER:
  if (repository.findByProjectIdAndRunnerType(callerProjectId, runnerType).stream()
          .anyMatch(m -> m.getCode().equalsIgnoreCase(body.getCode())))
  ```

### Step 2: Fix Dashboard Framework Collision
* **File:** `products/automation-portal/backend/src/main/java/com/automationportal/dashboard/DashboardRepository.java`
* **Action:** Update all group-by queries to group by `(module_code, framework)` instead of `module_code` alone.

### Step 3: Wire Config Overrides into `ExecutionWorker`
* **File:** `products/automation-portal/backend/src/main/java/com/automationportal/executions/ExecutionWorker.java`
* **Action:** When dispatching jobs to `execution-manager`, load `ModuleEnvironmentEntity.configJson` and inject the parsed key-values into the execution payload's environment parameters.

### Step 4: Unify Module & Environment Admin Screen
* **Action:** Move the Environment creation/management capabilities directly into `platform/shell/src/components/admin/ModuleManagement.jsx` as a unified tabbed view:
  - Tab 1: **Modules & Framework Mapping**
  - Tab 2: **Environments & Base URLs**
  - Tab 3: **Matrix Mapping (Module $\leftrightarrow$ Environment Overrides)**

---
*Report compiled and archived in `docs/context/api.md`.*
