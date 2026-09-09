package com.automationportal.perftesting.group;

import com.automationportal.perftesting.common.ApiResponse;
import com.automationportal.perftesting.results.PerfTestRun;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/test-groups")
@RequiredArgsConstructor
public class TestGroupController {

    private final TestGroupService service;

    @GetMapping
    public ApiResponse<List<TestGroup>> getAll() {
        return ApiResponse.ok(service.getAll());
    }

    @GetMapping("/{id}")
    public ApiResponse<TestGroup> getById(@PathVariable Long id) {
        return ApiResponse.ok(service.getById(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<TestGroup> create(@Valid @RequestBody TestGroup dto) {
        return ApiResponse.created("Test Group created successfully", service.create(dto));
    }

    @PutMapping("/{id}")
    public ApiResponse<TestGroup> update(@PathVariable Long id, @Valid @RequestBody TestGroup dto) {
        return ApiResponse.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/run")
    public ApiResponse<PerfTestRun> runGroup(@PathVariable Long id) {
        service.getById(id); // ownership check — triggerGroupRun() itself must stay reachable
                              // from the background scheduler/job-worker, which has no project context
        return ApiResponse.ok(service.triggerGroupRun(id));
    }
}
