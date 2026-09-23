package com.automationportal.testcasegen.testcase;

import com.automationportal.testcasegen.common.ApiResponse;
import com.automationportal.testcasegen.history.TestCaseReviewHistory;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/test-cases")
@RequiredArgsConstructor
public class TestCaseController {

    private final TestCaseService service;

    @GetMapping
    public ApiResponse<List<TestCaseDto>> list(@RequestParam(required = false) Long documentId) {
        return ApiResponse.ok(service.list(documentId));
    }

    @GetMapping("/{id}")
    public ApiResponse<TestCaseDto> get(@PathVariable Long id) {
        return ApiResponse.ok(service.get(id));
    }

    @GetMapping("/{id}/history")
    public ApiResponse<List<TestCaseReviewHistory>> history(@PathVariable Long id) {
        return ApiResponse.ok(service.history(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<TestCaseDto> create(@Valid @RequestBody TestCaseDto dto,
                                           @RequestParam(required = false) Long insertAfterId) {
        return ApiResponse.created("Test case created", service.create(dto, insertAfterId));
    }

    @PutMapping("/{id}")
    public ApiResponse<TestCaseDto> update(@PathVariable Long id, @Valid @RequestBody TestCaseDto dto) {
        return ApiResponse.ok(service.update(id, dto));
    }

    @PutMapping("/bulk")
    public ApiResponse<List<TestCaseDto>> bulkUpdate(@RequestBody @Valid List<TestCaseDto> dtos) {
        return ApiResponse.ok(service.bulkUpdate(dtos));
    }

    @PutMapping("/reorder")
    public ApiResponse<Void> reorder(@RequestBody ReorderRequest request) {
        service.reorder(request.orderedIds());
        return ApiResponse.ok(null);
    }

    @PutMapping("/review-status")
    public ApiResponse<List<TestCaseDto>> updateReviewStatus(@RequestBody ReviewStatusRequest request) {
        return ApiResponse.ok(service.updateReviewStatus(request.ids(), request.reviewStatus()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }

    public record ReorderRequest(List<Long> orderedIds) {}

    public record ReviewStatusRequest(List<Long> ids, ReviewStatus reviewStatus) {}
}
