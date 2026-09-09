package com.automationportal.perftesting.results;

import com.automationportal.perftesting.common.ApiException;
import com.automationportal.perftesting.common.ApiResponse;
import com.automationportal.perftesting.common.SseEmitterManager;
import com.automationportal.perftesting.loadtest.LoadTestRepository;
import com.automationportal.perftesting.perftest.PerformanceTestRepository;
import com.automationportal.perftesting.security.CurrentProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ResultController {

    private final ResultService service;
    private final SseEmitterManager sseEmitterManager;
    private final PerformanceTestRepository performanceTestRepository;
    private final LoadTestRepository loadTestRepository;
    private final CurrentProjectService currentProjectService;

    @GetMapping("/runs")
    public ApiResponse<Page<PerfTestRun>> getRuns(
            @RequestParam(required = false) TestType testType,
            @RequestParam(required = false) RunStatus status,
            @RequestParam(required = false) RunTrigger trigger,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return ApiResponse.ok(service.getRuns(testType, status, trigger, pageRequest));
    }

    @GetMapping("/runs/{id}")
    public ApiResponse<PerfTestRun> getRunDetails(@PathVariable Long id) {
        return ApiResponse.ok(service.getRunDetails(id));
    }

    @GetMapping("/runs/{id}/metrics")
    public ApiResponse<List<PerfMetricSample>> getRunMetrics(@PathVariable Long id) {
        return ApiResponse.ok(service.getRunMetrics(id));
    }

    @PostMapping("/performance-tests/{id}/run")
    public ApiResponse<PerfTestRun> runPerformanceTest(@PathVariable Long id) {
        requireOwned(performanceTestRepository.findById(id).map(t -> t.getProjectId()).orElse(null), "Performance Test");
        return ApiResponse.ok(service.startPerformanceTest(id, RunTrigger.MANUAL));
    }

    @PostMapping("/load-tests/{id}/run")
    public ApiResponse<PerfTestRun> runLoadTest(@PathVariable Long id) {
        requireOwned(loadTestRepository.findById(id).map(t -> t.getProjectId()).orElse(null), "Load Test");
        return ApiResponse.ok(service.startLoadTest(id, RunTrigger.MANUAL));
    }

    @PostMapping("/runs/{id}/abort")
    public ApiResponse<Void> abortRun(@PathVariable Long id) {
        service.getRunDetails(id); // ownership check — abortRun() itself must stay reachable
                                    // from PerfJobWorker's background stale-job eviction
        service.abortRun(id);
        return ApiResponse.ok(null);
    }

    private void requireOwned(Long ownerProjectId, String entityName) {
        if (ownerProjectId == null || !ownerProjectId.equals(currentProjectService.requireProjectId())) {
            throw ApiException.notFound(entityName + " not found");
        }
    }

    @GetMapping(value = "/runs/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamRun(@PathVariable Long id) {
        service.getRunDetails(id); // ownership check before subscribing to this run's live events
        return sseEmitterManager.registerRunEmitter(id);
    }

    @GetMapping(value = "/runs/dashboard/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamGlobalDashboard() {
        return sseEmitterManager.registerDashboardEmitter(currentProjectService.requireProjectId());
    }
}
