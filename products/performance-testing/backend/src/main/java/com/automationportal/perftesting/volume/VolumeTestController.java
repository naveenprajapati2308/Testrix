package com.automationportal.perftesting.volume;

import com.automationportal.perftesting.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/volume-tests")
@RequiredArgsConstructor
public class VolumeTestController {

    private final VolumeTestService service;

    @PostMapping("/run")
    public ApiResponse<List<Map<String, Object>>> runVolumeTest(@RequestBody VolumeTestConfig config) {
        return ApiResponse.ok(service.runVolumeTest(config));
    }
}
