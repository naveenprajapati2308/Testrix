---
name: testrix-guidelines
description: Testrix project rules — understand-before-implement, architecture preservation, reuse-first, security/DB/API discipline. Load before any non-trivial implementation task in this repo (backend, frontend, database, API, security, scheduler, reporting, or AI-integration changes), or when asked to follow Claude.md / project guidelines.
---

# Testrix - Claude Code Instructions

This file is the skill form of the repo's root `Claude.md` (kept in sync with it — if
`Claude.md` changes, update this copy too). It exists so these rules are reachable by name
(`/testrix-guidelines`) and by subagents that don't automatically inherit root project
instructions.

## 1. Project Context

This is the Testrix platform.

Testrix is an enterprise test automation and quality engineering platform.

The application is primarily built using:

- Backend: Java + Spring Boot
- Frontend: React
- Automation: Playwright and related automation frameworks
- Database: Use the existing database and persistence architecture already present in the project
- AI: Existing AI services/integrations must be respected and extended carefully
- Build/Dependency Management: Follow the existing project configuration

The project is an existing production-oriented application.

Do NOT treat this as a greenfield project.

Before making any implementation decision, understand the existing architecture, modules, naming conventions, security model, database model, service boundaries and existing workflows.

---

# 2. MOST IMPORTANT RULE

## Understand First, Implement Second

Before modifying code:

1. Inspect the relevant existing files.
2. Understand the current implementation.
3. Identify dependencies and affected modules.
4. Understand the existing business flow.
5. Determine whether the requested functionality already partially exists.
6. Identify the smallest correct change required.
7. Only then implement.

Never guess the implementation of a file that has not been inspected.

Never invent classes, methods, repositories, APIs, database tables, DTOs or configuration that may already exist.

If a referenced class/file exists, read it before modifying it.

---

# 3. Architecture Preservation

The existing architecture is authoritative.

Do not introduce a new architecture simply because another architecture is technically possible.

Do not:

- Rewrite existing modules unnecessarily.
- Introduce new frameworks without justification.
- Replace existing libraries without explicit approval.
- Move packages unnecessarily.
- Rename existing classes unnecessarily.
- Create duplicate services.
- Create duplicate repositories.
- Create duplicate utility classes.
- Create parallel implementations of existing functionality.

Prefer extending existing architecture over creating a parallel architecture.

If the existing architecture is problematic, explain the issue first and propose the change before performing a large refactor.

---

# 4. Planning Before Implementation

For medium or large tasks, follow this sequence:

### Step 1 - Understand

Inspect:

- Relevant controller(s)
- Service(s)
- Repository/repository implementation
- Entity/model
- DTOs
- Configuration
- Security/authentication
- Related frontend components
- Existing API contracts
- Existing tests

### Step 2 - Impact Analysis

Identify:

- Files that need modification
- Files that may be affected
- Database impact
- API impact
- Security impact
- Frontend impact
- Backward compatibility concerns
- Existing functionality that could break

### Step 3 - Implementation Plan

Create a concise implementation plan.

The plan should explain:

- What will change
- Why it needs to change
- Which existing components will be reused
- Which new components are actually required
- Potential risks

### Step 4 - Implement

Implement only after the approach is clear.

### Step 5 - Validate

Run appropriate:

- Compilation
- Unit tests
- Integration tests
- Existing relevant tests
- Frontend build
- Backend build

Fix issues caused by the implementation.

---

# 5. Do Not Over-Engineer

Always prefer the simplest production-quality solution.

Do not create abstractions for hypothetical future requirements.

Do not create:

- unnecessary interfaces
- unnecessary factories
- unnecessary wrappers
- unnecessary helper classes
- unnecessary configuration
- unnecessary generic frameworks
- unnecessary microservices
- unnecessary database tables

A feature should contain only the complexity required by the actual requirement.

However, do not sacrifice maintainability, security or correctness just to minimize lines of code.

---

# 6. Existing Code Comes First

Before creating a new:

- Service
- Utility
- Repository
- DTO
- Exception
- Validator
- Component
- Hook
- API
- Configuration

Search the project to determine whether an equivalent implementation already exists.

Reuse existing functionality whenever appropriate.

If an existing implementation is close but not suitable, evaluate whether it should be extended instead of creating another implementation.

---

# 7. Backend Rules

Backend implementation must follow the existing Spring Boot architecture.

Respect the current separation between:

- Controller
- Service
- Repository
- Entity
- DTO
- Mapper
- Validator
- Security
- Exception handling
- Audit/logging

Do not put business logic inside controllers unless the existing architecture explicitly follows that pattern.

Controllers should primarily handle:

- Request validation
- Authentication/authorization context
- Calling services
- Response creation

Business rules belong in the appropriate service/domain layer.

Repositories should focus on persistence operations.

---

# 8. API Rules

Before modifying an API:

1. Find the existing endpoint.
2. Understand request/response models.
3. Check frontend consumers.
4. Check other backend consumers.
5. Check tests.
6. Check backward compatibility.

Do not change an existing API contract unnecessarily.

If a breaking API change is required, clearly identify it before implementation.

Maintain consistent:

- HTTP methods
- HTTP status codes
- Response structures
- Error responses
- Validation behavior
- Naming conventions

Follow the project's existing `ApiResponse` or equivalent response pattern if one already exists.

---

# 9. Security Rules

Security is critical.

Never weaken:

- Authentication
- Authorization
- Role/permission checks
- Session handling
- Token validation
- OTP/security flows
- Password handling
- Input validation

Do not bypass security checks simply to make a feature work.

Never hardcode:

- passwords
- tokens
- API keys
- secrets
- private credentials

Use the existing configuration/environment/secret-management mechanism.

---

# 10. Database Rules

Before changing database-related code:

1. Inspect existing entities.
2. Inspect relationships.
3. Inspect repositories.
4. Inspect migrations/schema strategy.
5. Check whether the required field/table already exists.
6. Check existing data implications.

Never casually rename or remove database columns.

Never drop data to solve an implementation problem.

For database changes, consider:

- existing records
- nullability
- unique constraints
- foreign keys
- indexes
- migration compatibility
- rollback implications

---

# 11. Frontend Rules

Follow the existing React architecture.

Before creating a component:

- Search for similar components.
- Reuse existing UI patterns.
- Reuse existing API utilities.
- Reuse existing state-management patterns.
- Reuse existing validation mechanisms.

Do not introduce a new frontend library for a small requirement unless there is a clear reason.

Maintain:

- consistent UI
- existing routing
- existing authentication behavior
- existing API handling
- existing error handling
- existing loading states
- existing permission checks

---

# 12. AI Integration Rules

Testrix contains AI capabilities.

AI functionality must be treated as a platform capability, not as random feature-specific code.

Before implementing AI functionality:

1. Identify the existing AI architecture.
2. Identify the current AI service.
3. Identify API/client abstraction.
4. Identify prompt management.
5. Identify configuration.
6. Identify error handling.
7. Identify logging/auditing.
8. Identify security considerations.

Do not create a second AI integration if an existing integration can be extended.

AI-generated output must never blindly modify production data or execute destructive operations without appropriate validation and authorization.

---

# 13. Automation Framework Rules

Testrix is intended to support UI-driven test automation.

The long-term direction includes:

- Application configuration
- URL/credentials configuration
- User stories
- Requirements
- Test cases
- Documents
- AI-assisted test generation
- Executable automation
- Playwright-based execution
- Reusable custom validations
- AI-assisted custom method creation
- Framework-specific execution
- Execution reporting
- Scheduler/worker-based execution

When implementing automation-related features:

Do not tightly couple business logic to a single automation framework unless the existing architecture requires it.

Keep framework-specific logic isolated where possible.

Existing framework abstractions should be reused.

---

# 14. Scheduler and Execution Architecture

The platform may contain module-specific schedulers while moving toward a centralized Scheduler Management Console and worker-based execution architecture.

Do not remove or redesign scheduler architecture casually.

Before modifying scheduling:

- Understand existing schedulers.
- Understand execution lifecycle.
- Understand job persistence.
- Understand worker/executor architecture.
- Understand retry behavior.
- Understand concurrency.
- Understand execution status.
- Understand reporting linkage.

Do not create a completely new scheduler implementation for a single feature unless explicitly required.

---

# 15. Reporting Rules

Automation execution and reporting are separate concerns.

Do not mix execution logic unnecessarily with reporting logic.

Execution should produce appropriate execution results/events/data.

Reporting should consume that information according to the existing reporting architecture.

Before implementing reporting-related functionality, inspect:

- execution model
- execution status
- result persistence
- report generation
- existing report APIs
- frontend report components

---

# 16. Error Handling

Use the project's existing exception-handling architecture.

Do not introduce random try/catch blocks everywhere.

Handle errors at appropriate boundaries.

Do not silently swallow exceptions.

Do not log sensitive information.

Errors returned to clients should follow the existing API error format.

---

# 17. Logging and Audit

Follow the existing logging and audit architecture.

If an operation is security-sensitive, administrative, destructive or business-critical, determine whether an audit entry is required.

Do not add arbitrary logging everywhere.

Never log:

- passwords
- OTPs
- tokens
- API keys
- sensitive credentials

---

# 18. Validation

Validation should happen at the appropriate boundary.

Use existing:

- Bean Validation
- custom validators
- business validation
- frontend validation
- database constraints

Do not duplicate the same validation unnecessarily across multiple layers unless each layer has a legitimate responsibility.

---

# 19. Testing

Every meaningful backend change should be validated.

Prefer:

1. Existing tests
2. Targeted tests for the changed functionality
3. Integration tests where required
4. Full build when appropriate

Do not modify tests simply to make them pass if the implementation is incorrect.

Tests should validate actual business behavior.

Do not hardcode special cases just to satisfy tests.

---

# 20. Git Safety

Do not perform destructive Git operations without explicit permission.

Never automatically execute:

- `git reset --hard`
- `git clean -fd`
- force push
- branch deletion
- mass file deletion
- history rewriting

Do not discard changes that may belong to the user.

Before modifying files with existing uncommitted changes:

- inspect the current state
- preserve unrelated changes
- modify only what is required

---

# 21. File Modification Rules

When modifying an existing file:

- Preserve existing formatting where practical.
- Preserve unrelated functionality.
- Make the smallest correct change.
- Do not rewrite the entire file unnecessarily.
- Do not remove comments/code unless it is directly related to the task.
- Do not rename unrelated variables/classes.
- Do not perform unrelated cleanup.

Avoid "while I am here" refactoring.

---

# 22. Dependencies

Do not add a dependency unless necessary.

Before adding a dependency:

1. Search whether the functionality already exists.
2. Check whether an existing dependency can provide it.
3. Consider maintenance and security implications.
4. Use the project's existing version-management approach.

Never introduce multiple libraries for the same purpose.

---

# 23. Configuration

Respect the existing configuration structure.

Do not hardcode environment-specific values.

Use the existing:

- application configuration
- environment variables
- profiles
- secrets/configuration mechanism

When adding configuration, follow the existing naming and organization conventions.

---

# 24. Documentation

Update documentation only when the change genuinely affects:

- architecture
- public API
- configuration
- deployment
- developer workflow
- important business behavior

Do not create unnecessary documentation files.

---

# 25. When Requirements Are Ambiguous

Do not silently make a major architectural decision based on assumptions.

If ambiguity can be resolved by inspecting the existing code, inspect the code first.

If it cannot be resolved from the code, explain the ambiguity and present the smallest reasonable options.

For minor implementation details, choose a sensible solution and proceed.

For major architectural, database, security or breaking API decisions, ask before proceeding.

---

# 26. Response Style

When working on code:

1. Briefly state what you found.
2. Explain the implementation approach.
3. Make the changes.
4. Validate the changes.
5. Report:
   - files changed
   - important changes
   - validation performed
   - remaining issues, if any

Do not provide long explanations when a concise implementation summary is sufficient.

---

# 27. Default Working Mode

The default behavior should be:

INVESTIGATE -> UNDERSTAND -> PLAN -> IMPLEMENT -> VALIDATE -> SUMMARIZE

Do not skip investigation.

Do not implement based on assumptions.

Do not over-engineer.

Do not modify unrelated code.

Do not stop at suggestions when the user explicitly asks for implementation.

When implementation is requested and the required context is available, make the actual code changes.

---

# 28. Important Principle

Testrix is a long-term product.

Every implementation should consider:

- maintainability
- extensibility
- security
- backward compatibility
- modularity
- testability
- operational reliability

But do not build hypothetical future functionality unless it is part of the current requirement.

The goal is:

"Build the correct solution for today's requirement while preserving the architecture needed for Testrix's long-term evolution."
