package com.automationportal.dashboard;

import com.automationportal.executions.*;
import com.automationportal.modules.ModuleEntity;
import com.automationportal.modules.ModuleRepository;
import com.automationportal.testcasecatalog.TestCaseCatalogService;
import com.automationportal.security.CurrentProjectService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class DashboardService {

    private final ExecutionRepository executionRepository;
    private final ExecutionTestCaseRepository testCaseRepository;
    private final TestCaseCatalogService testCaseCatalogService;
    private final ModuleRepository moduleRepository;
    private final CurrentProjectService currentProjectService;

    public DashboardService(ExecutionRepository executionRepository,
            ExecutionTestCaseRepository testCaseRepository,
            TestCaseCatalogService testCaseCatalogService,
            ModuleRepository moduleRepository,
            CurrentProjectService currentProjectService) {
        this.executionRepository = executionRepository;
        this.testCaseRepository = testCaseRepository;
        this.testCaseCatalogService = testCaseCatalogService;
        this.moduleRepository = moduleRepository;
        this.currentProjectService = currentProjectService;
    }

    // docs/version2.2.md: this is the Automation product's own operational dashboard — Super
    // Admin (no project context) is rejected rather than shown a cross-project blend; their
    // "Global Dashboard" is the separate, platform-level Admin Dashboard instead.
    private Long projectIdOrNull() {
        return currentProjectService.requireProjectId();
    }

    public Map<String, Object> getSummary(String range) {
        Instant since = getSinceInstant(range);
        Long projectId = projectIdOrNull();
        List<Execution> executions = executionRepository.findAll().stream()
                .filter(e -> projectId == null || projectId.equals(e.getProjectId()))
                .filter(e -> e.getCreatedAt() != null && e.getCreatedAt().isAfter(since))
                .collect(Collectors.toList());

        long totalExecutions = executions.size();
        long runningExecutions = executions.stream().filter(e -> e.getStatus() == ExecutionStatus.RUNNING).count();
        long queuedExecutions = executions.stream().filter(e -> e.getStatus() == ExecutionStatus.QUEUED).count();
        long totalTests = 0;
        long passedTests = 0;
        long failedTests = 0;
        long skippedTests = 0;
        long durationSum = 0;
        long durationCount = 0;

        String lastStatus = null;
        Instant latestTime = null;

        for (Execution e : executions) {
            if (e.getStatus() != ExecutionStatus.QUEUED && e.getStatus() != ExecutionStatus.RUNNING) {
                totalTests += e.getTotalTests();
                passedTests += e.getPassedTests();
                failedTests += e.getFailedTests();
                skippedTests += e.getSkippedTests();
                if (e.getDurationSeconds() != null && e.getDurationSeconds() > 0) {
                    durationSum += e.getDurationSeconds();
                    durationCount++;
                }
            }
            if (e.getCreatedAt() != null && (latestTime == null || e.getCreatedAt().isAfter(latestTime))) {
                latestTime = e.getCreatedAt();
                lastStatus = e.getStatus().toString();
            }
        }

        double passRate = totalTests > 0 ? (passedTests * 100.0) / totalTests : 0.0;
        double failRate = totalTests > 0 ? (failedTests * 100.0) / totalTests : 0.0;
        long avgDuration = durationCount > 0 ? durationSum / durationCount : 0;

        Map<String, Object> summary = new HashMap<>();
        summary.put("totalExecutions", totalExecutions);
        summary.put("totalTests", totalTests);
        summary.put("passedTests", passedTests);
        summary.put("failedTests", failedTests);
        summary.put("skippedTests", skippedTests);
        summary.put("passRate", BigDecimal.valueOf(passRate).setScale(1, RoundingMode.HALF_UP));
        summary.put("failRate", BigDecimal.valueOf(failRate).setScale(1, RoundingMode.HALF_UP));
        summary.put("averageDuration", avgDuration);
        summary.put("lastExecutionStatus", lastStatus);
        summary.put("runningExecutions", runningExecutions);
        summary.put("queuedExecutions", queuedExecutions);

        return summary;
    }

    /**
     * Bucketed trend series. The bucket size follows the range so the x-axis stays
     * readable: today = hourly, 7d = daily, 30d = every 3 days, 90d = every 9 days.
     * Empty buckets are included so the axis always spans the full range.
     */
    public List<Map<String, Object>> getTrends(String range) {
        ZoneId zone = ZoneId.systemDefault();
        Instant now = Instant.now();

        Instant start;
        Duration bucketSize;
        DateTimeFormatter labelFmt;
        if ("today".equalsIgnoreCase(range)) {
            start = LocalDate.now(zone).atStartOfDay(zone).toInstant();
            bucketSize = Duration.ofHours(1);
            labelFmt = DateTimeFormatter.ofPattern("HH:00").withZone(zone);
        } else if ("30d".equalsIgnoreCase(range)) {
            start = LocalDate.now(zone).minusDays(29).atStartOfDay(zone).toInstant();
            bucketSize = Duration.ofDays(3);
            labelFmt = DateTimeFormatter.ofPattern("MM-dd").withZone(zone);
        } else if ("90d".equalsIgnoreCase(range)) {
            start = LocalDate.now(zone).minusDays(89).atStartOfDay(zone).toInstant();
            bucketSize = Duration.ofDays(9);
            labelFmt = DateTimeFormatter.ofPattern("MM-dd").withZone(zone);
        } else { // 7d default
            start = LocalDate.now(zone).minusDays(6).atStartOfDay(zone).toInstant();
            bucketSize = Duration.ofDays(1);
            labelFmt = DateTimeFormatter.ofPattern("MM-dd").withZone(zone);
        }
        final Instant rangeStart = start;
        Long projectId = projectIdOrNull();

        List<Execution> executions = executionRepository.findAll().stream()
                .filter(e -> projectId == null || projectId.equals(e.getProjectId()))
                .filter(e -> e.getCreatedAt() != null && !e.getCreatedAt().isBefore(rangeStart))
                .sorted(Comparator.comparing(Execution::getCreatedAt))
                .collect(Collectors.toList());

        DateTimeFormatter dateFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(zone);
        List<Map<String, Object>> trends = new ArrayList<>();

        for (Instant bucketStart = start; !bucketStart.isAfter(now); bucketStart = bucketStart.plus(bucketSize)) {
            Instant bucketEnd = bucketStart.plus(bucketSize);
            final Instant bs = bucketStart;
            List<Execution> bucketExecs = executions.stream()
                    .filter(e -> !e.getCreatedAt().isBefore(bs) && e.getCreatedAt().isBefore(bucketEnd))
                    .collect(Collectors.toList());

            long tests = 0;
            long passed = 0;
            long failed = 0;
            long skipped = 0;
            for (Execution e : bucketExecs) {
                if (e.getStatus() != ExecutionStatus.QUEUED && e.getStatus() != ExecutionStatus.RUNNING) {
                    tests += e.getTotalTests();
                    passed += e.getPassedTests();
                    failed += e.getFailedTests();
                    skipped += e.getSkippedTests();
                }
            }
            double passRate = tests > 0 ? (passed * 100.0) / tests : 0.0;

            Map<String, Object> bucketMap = new HashMap<>();
            bucketMap.put("date", dateFmt.format(bucketStart));
            bucketMap.put("label", labelFmt.format(bucketStart));
            bucketMap.put("executions", bucketExecs.size());
            bucketMap.put("totalTests", tests);
            bucketMap.put("passed", passed);
            bucketMap.put("failed", failed);
            bucketMap.put("skipped", skipped);
            bucketMap.put("passRate", BigDecimal.valueOf(passRate).setScale(1, RoundingMode.HALF_UP));
            trends.add(bucketMap);
        }

        return trends;
    }

    // TOTAL comes from the permanent test_case_catalog inventory (range/environment independent —
    // running a module again never changes how many test cases it has). PASSED/FAILED/SKIPPED come
    // from each catalog test case's latest qualifying result within the selected range/environment,
    // so re-execution moves those counts around without ever inflating TOTAL. Grouped by
    // (moduleCode, framework) rather than moduleCode alone — the same module code can exist once
    // per framework (e.g. LAND under both Selenium and Playwright). Parent workflow modules (e.g.
    // "Architect Empanelment") are synthesized by summing their children's rows below, since a
    // parent is never itself executed and so never has its own catalog/execution rows.
    public List<Map<String, Object>> getModuleHealth(String range, Long environmentId) {
        Instant since = getSinceInstant(range);
        Long projectId = projectIdOrNull();

        // lastExecutionStatus keeps its original algorithm/semantics untouched — it's not part of
        // the TOTAL-inflation bug this method is otherwise being rewritten to fix.
        List<Execution> executions = executionRepository.findAll().stream()
                .filter(e -> projectId == null || projectId.equals(e.getProjectId()))
                .filter(e -> e.getCreatedAt() != null && e.getCreatedAt().isAfter(since))
                .filter(e -> environmentId == null || environmentId.equals(e.getEnvironmentId()))
                .collect(Collectors.toList());

        Map<String, List<Execution>> groupedExecs = executions.stream()
                .filter(e -> e.getModuleCode() != null)
                .collect(Collectors.groupingBy(e -> e.getModuleCode() + "::" + e.getFramework()));

        Map<String, String> lastStatusByKey = new HashMap<>();
        for (Map.Entry<String, List<Execution>> entry : groupedExecs.entrySet()) {
            String lastStatus = "UNKNOWN";
            Instant latestTime = null;
            for (Execution e : entry.getValue()) {
                if (e.getCreatedAt() != null && (latestTime == null || e.getCreatedAt().isAfter(latestTime))) {
                    latestTime = e.getCreatedAt();
                    lastStatus = e.getStatus().toString();
                }
            }
            lastStatusByKey.put(entry.getKey(), lastStatus);
        }

        // TOTAL: fixed catalog inventory, independent of range/environment.
        Map<String, Long> totalByKey = testCaseCatalogService.countActiveByModuleAndFramework();

        // PASSED/FAILED/SKIPPED: reduce the FK-joined raw rows (ordered ASC by execution time) to
        // the latest status per catalog test case, then tally per moduleCode::framework.
        List<Object[]> raw = testCaseRepository.findModuleHealthResultsRaw(since, environmentId, projectId);
        Map<Long, String> latestStatusByCatalogId = new LinkedHashMap<>();
        Map<Long, String> keyByCatalogId = new HashMap<>();
        for (Object[] row : raw) {
            Long catalogId = ((Number) row[0]).longValue();
            String moduleCode = (String) row[1];
            String framework = (String) row[2];
            String status = (String) row[3];
            latestStatusByCatalogId.put(catalogId, status);
            keyByCatalogId.put(catalogId, moduleCode + "::" + framework);
        }

        Map<String, long[]> tallyByKey = new HashMap<>(); // [passed, failed, skipped]
        for (Map.Entry<Long, String> entry : latestStatusByCatalogId.entrySet()) {
            String key = keyByCatalogId.get(entry.getKey());
            long[] tally = tallyByKey.computeIfAbsent(key, k -> new long[3]);
            String status = entry.getValue();
            if ("PASS".equalsIgnoreCase(status)) tally[0]++;
            else if ("FAIL".equalsIgnoreCase(status)) tally[1]++;
            else if ("SKIP".equalsIgnoreCase(status)) tally[2]++;
        }

        Set<String> allKeys = new HashSet<>();
        allKeys.addAll(totalByKey.keySet());
        allKeys.addAll(tallyByKey.keySet());
        allKeys.addAll(lastStatusByKey.keySet());

        Map<String, Map<String, Object>> rowsByKey = new HashMap<>();
        for (String key : allKeys) {
            int sep = key.indexOf("::");
            String moduleCode = sep >= 0 ? key.substring(0, sep) : key;
            String framework = sep >= 0 ? key.substring(sep + 2) : "";

            long total = totalByKey.getOrDefault(key, 0L);
            long[] tally = tallyByKey.getOrDefault(key, new long[3]);
            long passed = tally[0], failed = tally[1], skipped = tally[2];
            long executedCount = passed + failed + skipped;
            long notExecuted = total - executedCount;
            double passRate = executedCount > 0 ? (passed * 100.0) / executedCount : 0.0;

            Map<String, Object> moduleMap = new HashMap<>();
            moduleMap.put("moduleCode", moduleCode);
            moduleMap.put("framework", framework);
            moduleMap.put("moduleName", getModuleName(moduleCode));
            moduleMap.put("totalTests", total);
            moduleMap.put("passed", passed);
            moduleMap.put("failed", failed);
            moduleMap.put("skipped", skipped);
            moduleMap.put("executed", executedCount);
            moduleMap.put("notExecuted", notExecuted);
            moduleMap.put("passRate", BigDecimal.valueOf(passRate).setScale(1, RoundingMode.HALF_UP));
            moduleMap.put("lastExecutionStatus", lastStatusByKey.getOrDefault(key, "UNKNOWN"));
            rowsByKey.put(key, moduleMap);
        }

        addParentAggregateRows(rowsByKey, projectId);

        return new ArrayList<>(rowsByKey.values());
    }

    // Parent workflow modules (parent_module_id IS NULL, with children pointing at them) never
    // have their own execution/catalog rows — only their children are ever run — so their totals
    // are synthesized by summing every child's already-computed row above. Deliberately sums ALL
    // children under a given parent id rather than filtering by "child framework == parent
    // framework": each parent row already scopes to one framework by construction (e.g. "Architect
    // Empanelment" has two separate parent ModuleEntity rows, one MAVEN_TESTNG one PLAYWRIGHT, each
    // with its own child set via parent_module_id — verified against real data), so an extra
    // equality filter here could only ever silently under-count if a child were ever mis-linked,
    // which is worse than the alternative of over-counting under a wrong parent (visible/obvious)
    // instead of quietly missing tests (invisible). Two-level only, matching buildHierarchyRows.js
    // (shared/ui/hierarchyRows.js), which never renders a grandchild either.
    private void addParentAggregateRows(Map<String, Map<String, Object>> rowsByKey, Long projectId) {
        List<ModuleEntity> modules = projectId != null
                ? moduleRepository.findByProjectId(projectId)
                : moduleRepository.findAll();
        Map<Long, List<ModuleEntity>> childrenByParentId = modules.stream()
                .filter(m -> m.getParentModuleId() != null)
                .collect(Collectors.groupingBy(ModuleEntity::getParentModuleId));

        for (ModuleEntity parent : modules) {
            if (parent.getParentModuleId() != null) continue;
            List<ModuleEntity> children = childrenByParentId.get(parent.getId());
            if (children == null || children.isEmpty()) continue;

            long pTotal = 0, pPassed = 0, pFailed = 0, pSkipped = 0, pExecuted = 0, pNotExecuted = 0;
            for (ModuleEntity child : children) {
                if (!child.isActive() || !child.isVisible()) continue;
                Map<String, Object> childRow = rowsByKey.get(child.getCode() + "::" + child.getRunnerType());
                if (childRow == null) continue;
                pTotal += ((Number) childRow.get("totalTests")).longValue();
                pPassed += ((Number) childRow.get("passed")).longValue();
                pFailed += ((Number) childRow.get("failed")).longValue();
                pSkipped += ((Number) childRow.get("skipped")).longValue();
                pExecuted += ((Number) childRow.get("executed")).longValue();
                pNotExecuted += ((Number) childRow.get("notExecuted")).longValue();
            }

            double pPassRate = pExecuted > 0 ? (pPassed * 100.0) / pExecuted : 0.0;
            String pLastStatus;
            if (pExecuted == 0) {
                pLastStatus = "UNKNOWN";
            } else if (pFailed == 0 && pSkipped == 0) {
                pLastStatus = "PASSED";
            } else if (pFailed > 0 && pPassed == 0) {
                pLastStatus = "FAILED";
            } else {
                pLastStatus = "PARTIAL";
            }

            Map<String, Object> parentMap = new HashMap<>();
            parentMap.put("moduleCode", parent.getCode());
            parentMap.put("framework", parent.getRunnerType());
            parentMap.put("moduleName", parent.getName() != null ? parent.getName() : getModuleName(parent.getCode()));
            parentMap.put("totalTests", pTotal);
            parentMap.put("passed", pPassed);
            parentMap.put("failed", pFailed);
            parentMap.put("skipped", pSkipped);
            parentMap.put("executed", pExecuted);
            parentMap.put("notExecuted", pNotExecuted);
            parentMap.put("passRate", BigDecimal.valueOf(pPassRate).setScale(1, RoundingMode.HALF_UP));
            parentMap.put("lastExecutionStatus", pLastStatus);
            rowsByKey.put(parent.getCode() + "::" + parent.getRunnerType(), parentMap);
        }
    }

    public List<Execution> getRecentActivity() {
        Long projectId = projectIdOrNull();
        return projectId != null
                ? executionRepository.findTop25ByProjectIdOrderByCreatedAtDesc(projectId)
                : executionRepository.findTop25ByOrderByCreatedAtDesc();
    }

    public List<Map<String, Object>> getFailureAnalysis(String range) {
        Instant since = getSinceInstant(range);
        List<Object[]> raw = testCaseRepository.findFailureAnalysisRaw(since, projectIdOrNull());

        List<Map<String, Object>> analysis = new ArrayList<>();
        for (Object[] row : raw) {
            Map<String, Object> item = new HashMap<>();
            item.put("exceptionType", row[0]);
            item.put("count", row[1]);
            item.put("topTest", row[2]);
            item.put("latestExecution", row[3]);
            analysis.add(item);
        }

        // Sort by failure count desc
        analysis.sort((a, b) -> Long.compare((Long) b.get("count"), (Long) a.get("count")));
        return analysis;
    }

    public List<Map<String, Object>> getSlowTests(String range) {
        Instant since = getSinceInstant(range);
        List<ExecutionTestCase> raw = testCaseRepository.findSlowTestsRaw(since, projectIdOrNull());

        List<Map<String, Object>> slow = new ArrayList<>();
        // Group by class and method name to get distinct slowest cases
        Set<String> uniqueKeys = new HashSet<>();
        for (ExecutionTestCase tc : raw) {
            String key = tc.getClassName() + "." + tc.getMethodName();
            if (uniqueKeys.add(key)) {
                Map<String, Object> item = new HashMap<>();
                item.put("methodName", tc.getMethodName());
                item.put("className", tc.getClassName());
                item.put("duration", tc.getDurationMs() != null ? tc.getDurationMs() / 1000.0 : 0.0);
                item.put("module", tc.getModuleCode());
                slow.add(item);
                if (slow.size() >= 10)
                    break;
            }
        }
        return slow;
    }

    public List<Map<String, Object>> getFlakyTests(String range) {
        Instant since = getSinceInstant(range);
        List<Object[]> raw = testCaseRepository.findFlakyTestsRaw(since, projectIdOrNull());
        List<Map<String, Object>> flaky = new ArrayList<>();

        for (Object[] row : raw) {
            String className = (String) row[0];
            String methodName = (String) row[1];
            long totalRuns = ((Number) row[2]).longValue();
            long failureCount = ((Number) row[3]).longValue();
            long passCount = ((Number) row[4]).longValue();
            long totalRetries = row[5] != null ? ((Number) row[5]).longValue() : 0L;
            String moduleCode = (String) row[6];

            if ((failureCount > 0 && passCount > 0) || totalRetries > 0) {
                Map<String, Object> item = new HashMap<>();
                item.put("methodName", methodName);
                item.put("className", className);
                item.put("totalRuns", totalRuns);
                item.put("failureCount", failureCount);
                item.put("retriesCount", totalRetries);
                double rate = totalRuns > 0 ? ((failureCount + totalRetries) * 100.0) / totalRuns : 0.0;
                item.put("flakinessRate", BigDecimal.valueOf(rate).setScale(1, RoundingMode.HALF_UP));
                item.put("module", moduleCode);
                flaky.add(item);
            }
        }

        flaky.sort((a, b) -> {
            int comp = Double.compare(Double.parseDouble(b.get("flakinessRate").toString()),
                    Double.parseDouble(a.get("flakinessRate").toString()));
            if (comp == 0) {
                return Long.compare((Long) b.get("totalRuns"), (Long) a.get("totalRuns"));
            }
            return comp;
        });

        return flaky;
    }

    public List<Map<String, Object>> getPassRateTrend(String range) {
        Instant since = getSinceInstant(range);
        List<Object[]> raw = executionRepository.findDailyTrend(since, projectIdOrNull());
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object[] row : raw) {
            Map<String, Object> map = new HashMap<>();
            map.put("date", row[0] != null ? row[0].toString() : "");
            map.put("passRate",
                    row[1] != null
                            ? BigDecimal.valueOf(Double.parseDouble(row[1].toString())).setScale(2,
                                    RoundingMode.HALF_UP)
                            : BigDecimal.ZERO);
            map.put("failRate",
                    row[2] != null
                            ? BigDecimal.valueOf(Double.parseDouble(row[2].toString())).setScale(2,
                                    RoundingMode.HALF_UP)
                            : BigDecimal.ZERO);
            map.put("execCount", row[3] != null ? Long.parseLong(row[3].toString()) : 0L);
            result.add(map);
        }
        return result;
    }

    public List<Map<String, Object>> getDurationTrend(String range) {
        Instant since = getSinceInstant(range);
        List<Object[]> raw = executionRepository.findDurationTrend(since, projectIdOrNull());
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object[] row : raw) {
            Map<String, Object> map = new HashMap<>();
            map.put("date", row[0] != null ? row[0].toString() : "");
            double avgDurationMs = row[1] != null ? Double.parseDouble(row[1].toString()) : 0.0;
            map.put("avgDuration", BigDecimal.valueOf(avgDurationMs / 1000.0).setScale(2, RoundingMode.HALF_UP));
            map.put("execCount", row[2] != null ? Long.parseLong(row[2].toString()) : 0L);
            result.add(map);
        }
        return result;
    }

    public List<Map<String, Object>> getRunHeatmap(String range) {
        Instant since = getSinceInstant(range);
        List<Object[]> raw = executionRepository.findRunHeatmap(since, projectIdOrNull());
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object[] row : raw) {
            Map<String, Object> map = new HashMap<>();
            map.put("dow", row[0] != null ? Integer.parseInt(row[0].toString()) : 0);
            map.put("hour", row[1] != null ? Integer.parseInt(row[1].toString()) : 0);
            map.put("count", row[2] != null ? Long.parseLong(row[2].toString()) : 0L);
            result.add(map);
        }
        return result;
    }

    public List<Map<String, Object>> getEnvDistribution(String range) {
        Instant since = getSinceInstant(range);
        List<Object[]> raw = executionRepository.findEnvDistribution(since, projectIdOrNull());
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object[] row : raw) {
            Map<String, Object> map = new HashMap<>();
            map.put("envId", row[0]);
            map.put("count", row[1]);
            result.add(map);
        }
        return result;
    }

    public List<Map<String, Object>> getRegressionAlerts() {
        Long projectId = projectIdOrNull();
        List<Execution> all = executionRepository.findAll();
        Map<String, List<Execution>> grouped = all.stream()
                .filter(e -> projectId == null || projectId.equals(e.getProjectId()))
                .filter(e -> e.getModuleCode() != null && e.getStatus() != ExecutionStatus.QUEUED
                        && e.getStatus() != ExecutionStatus.RUNNING)
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .collect(Collectors.groupingBy(Execution::getModuleCode));

        List<Map<String, Object>> alerts = new ArrayList<>();
        for (Map.Entry<String, List<Execution>> entry : grouped.entrySet()) {
            String moduleCode = entry.getKey();
            List<Execution> execs = entry.getValue();
            if (execs.size() >= 2) {
                Execution latest = execs.get(0);
                Execution previous = execs.get(1);
                if ((latest.getStatus() == ExecutionStatus.FAILED || latest.getStatus() == ExecutionStatus.PARTIAL)
                        && previous.getStatus() == ExecutionStatus.PASSED) {
                    Map<String, Object> alert = new HashMap<>();
                    alert.put("moduleCode", moduleCode);
                    alert.put("moduleName", getModuleName(moduleCode));
                    alert.put("latestExecutionCode", latest.getExecutionCode());
                    alert.put("latestExecutionId", latest.getId());
                    alert.put("previousExecutionCode", previous.getExecutionCode());
                    alert.put("previousExecutionId", previous.getId());
                    alert.put("passRate", latest.getPassRate());
                    alert.put("previousPassRate", previous.getPassRate());
                    alert.put("timestamp", latest.getCreatedAt() != null ? latest.getCreatedAt() : Instant.now());
                    alerts.add(alert);
                }
            }
        }
        return alerts;
    }

    private Instant getSinceInstant(String range) {
        if ("today".equalsIgnoreCase(range))
            return LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant();
        int days = 7;
        if ("30d".equalsIgnoreCase(range))
            days = 30;
        else if ("90d".equalsIgnoreCase(range))
            days = 90;
        return Instant.now().minus(days, ChronoUnit.DAYS);
    }

    private String getModuleName(String code) {
        if ("LAND".equalsIgnoreCase(code))
            return "Land Management";
        if ("SURVEY".equalsIgnoreCase(code))
            return "Survey Management";
        if ("GIS".equalsIgnoreCase(code))
            return "GIS System";
        if ("ARCHITECT".equalsIgnoreCase(code))
            return "Architect Empanelment";
        return code;
    }
}
