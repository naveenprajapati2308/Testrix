package com.automationportal.perftesting.results;

import com.automationportal.perftesting.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService service;

    @GetMapping("/stats")
    public ApiResponse<DashboardStatsDto> getStats(@RequestParam(required = false) String range) {
        return ApiResponse.ok(service.getStats(range));
    }

    @GetMapping("/trend")
    public ApiResponse<List<PerfTrendPoint>> getTrend(@RequestParam(required = false) String range) {
        return ApiResponse.ok(service.getTrend(range));
    }
}
