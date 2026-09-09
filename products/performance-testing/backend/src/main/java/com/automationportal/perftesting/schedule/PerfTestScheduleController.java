package com.automationportal.perftesting.schedule;

import com.automationportal.perftesting.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/schedules")
@RequiredArgsConstructor
public class PerfTestScheduleController {

    private final PerfTestScheduleService service;

    @GetMapping
    public ApiResponse<List<PerfTestScheduleDto>> getAll() {
        return ApiResponse.ok(service.getAll());
    }

    @GetMapping("/{id}")
    public ApiResponse<PerfTestScheduleDto> getById(@PathVariable Long id) {
        return ApiResponse.ok(service.getById(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<PerfTestScheduleDto> create(@Valid @RequestBody PerfTestSchedule dto) {
        return ApiResponse.created("Schedule created successfully", service.create(dto));
    }

    @PutMapping("/{id}")
    public ApiResponse<PerfTestScheduleDto> update(@PathVariable Long id, @Valid @RequestBody PerfTestSchedule dto) {
        return ApiResponse.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/toggle")
    public ApiResponse<PerfTestScheduleDto> toggle(@PathVariable Long id) {
        return ApiResponse.ok(service.toggle(id));
    }
}
