package com.automationportal.testcasegen.generation;

import java.util.List;

/** One test case as returned by the model, after normalisation into a predictable shape. */
public record GeneratedTestCase(
        String title,
        String description,
        String type,
        String priority,
        List<String> preconditions,
        List<String> testData,
        List<Step> steps,
        String expectedResult,
        String sourceText,
        String sourceSection) {

    public record Step(String action, String expectedResult) {}
}
