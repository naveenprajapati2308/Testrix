package com.automationportal.perftesting.drift;

import com.automationportal.perftesting.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/drift-alerts")
@RequiredArgsConstructor
public class DriftController {

    private final DriftDetector detector;

    @GetMapping
    public ApiResponse<List<PerfDriftAlert>> getUnacknowledgedAlerts() {
        return ApiResponse.ok(detector.getUnacknowledgedAlerts());
    }

    @PostMapping("/{id}/acknowledge")
    public ApiResponse<Void> acknowledgeAlert(@PathVariable Long id) {
        detector.acknowledgeAlert(id);
        return ApiResponse.ok(null);
    }
}
