package com.automationportal.perftesting.loadtest;

import com.automationportal.perftesting.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/load-tests")
@RequiredArgsConstructor
public class LoadTestController {

    private final LoadTestService service;

    @GetMapping
    public ApiResponse<List<LoadTestDto>> getAll() {
        return ApiResponse.ok(service.getAll());
    }

    @GetMapping("/{id}")
    public ApiResponse<LoadTestDto> getById(@PathVariable Long id) {
        return ApiResponse.ok(service.getById(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<LoadTestDto> create(@Valid @RequestBody LoadTestDto dto) {
        return ApiResponse.created("Load Test created successfully", service.create(dto));
    }

    @PutMapping("/{id}")
    public ApiResponse<LoadTestDto> update(@PathVariable Long id, @Valid @RequestBody LoadTestDto dto) {
        return ApiResponse.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }
}
