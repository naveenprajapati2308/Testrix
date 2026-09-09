package com.automationportal.perftesting.perftest;

import com.automationportal.perftesting.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/performance-tests")
@RequiredArgsConstructor
public class PerformanceTestController {

    private final PerformanceTestService service;

    @GetMapping
    public ApiResponse<List<PerformanceTestDto>> getAll() {
        return ApiResponse.ok(service.getAll());
    }

    @GetMapping("/{id}")
    public ApiResponse<PerformanceTestDto> getById(@PathVariable Long id) {
        return ApiResponse.ok(service.getById(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<PerformanceTestDto> create(@Valid @RequestBody PerformanceTestDto dto) {
        return ApiResponse.created("Performance Test created successfully", service.create(dto));
    }

    @PutMapping("/{id}")
    public ApiResponse<PerformanceTestDto> update(@PathVariable Long id, @Valid @RequestBody PerformanceTestDto dto) {
        return ApiResponse.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }

    // Run trigger will be handled by the execution/run service in subsequent steps.
}
