package com.automationportal.testcasegen.testcase;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public record TestCaseDto(
        Long id,
        Long srsDocumentId,
        String testCaseCode,
        int displayOrder,
        @NotBlank(message = "Title is required")
        @Size(max = 500, message = "Title must be 500 characters or fewer")
        String title,
        String description,
        TestType testType,
        Priority priority,
        ReviewStatus reviewStatus,
        String expectedResult,
        String sourceSection,
        String sourceText,
        List<String> preconditions,
        List<String> testData,
        List<StepDto> steps,
        Instant createdAt,
        Instant updatedAt) {

    public record StepDto(int stepNumber, String action, String expectedResult) {}

    public static TestCaseDto fromEntity(TestCase entity) {
        return new TestCaseDto(
                entity.getId(),
                entity.getSrsDocumentId(),
                entity.getTestCaseCode(),
                entity.getDisplayOrder(),
                entity.getTitle(),
                entity.getDescription(),
                entity.getTestType(),
                entity.getPriority(),
                entity.getReviewStatus(),
                entity.getExpectedResult(),
                entity.getSourceSection(),
                entity.getSourceText(),
                List.copyOf(entity.getPreconditions()),
                List.copyOf(entity.getTestData()),
                entity.getSteps().stream()
                        .map(step -> new StepDto(step.getStepNumber(), step.getAction(), step.getExpectedResult()))
                        .toList(),
                entity.getCreatedAt(),
                entity.getUpdatedAt());
    }
}
