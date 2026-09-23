package com.automationportal.testcasegen.exchange;

import com.automationportal.testcasegen.testcase.TestCaseDto;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * The one definition of the spreadsheet layout, shared by export and import so a file exported
 * from Testrix, edited in Excel and imported back always lines up.
 *
 * Multi-value fields are newline-separated inside a single cell: that survives an Excel edit
 * (alt+enter) far better than one-column-per-step would, and keeps the sheet readable.
 */
final class TestCaseSheet {

    static final List<String> HEADERS = List.of(
            "Code", "Title", "Type", "Priority", "Review Status", "Description",
            "Preconditions", "Test Data", "Steps", "Expected Result", "Source Section");

    static final String STEP_SEPARATOR = " => ";

    private TestCaseSheet() {}

    static List<String> toRow(TestCaseDto testCase) {
        return List.of(
                nullSafe(testCase.testCaseCode()),
                nullSafe(testCase.title()),
                testCase.testType() == null ? "" : testCase.testType().name(),
                testCase.priority() == null ? "" : testCase.priority().name(),
                testCase.reviewStatus() == null ? "" : testCase.reviewStatus().name(),
                nullSafe(testCase.description()),
                String.join("\n", testCase.preconditions()),
                String.join("\n", testCase.testData()),
                testCase.steps().stream()
                        .map(step -> step.action() + STEP_SEPARATOR + nullSafe(step.expectedResult()))
                        .reduce((a, b) -> a + "\n" + b)
                        .orElse(""),
                nullSafe(testCase.expectedResult()),
                nullSafe(testCase.sourceSection()));
    }

    static List<String> splitLines(String cell) {
        if (cell == null || cell.isBlank()) return List.of();
        return Arrays.stream(cell.split("\\r?\\n"))
                .map(String::trim)
                .filter(line -> !line.isEmpty())
                .toList();
    }

    static List<TestCaseDto.StepDto> parseSteps(String cell) {
        List<TestCaseDto.StepDto> steps = new ArrayList<>();
        int number = 1;
        for (String line : splitLines(cell)) {
            int separator = line.indexOf(STEP_SEPARATOR);
            String action = separator < 0 ? line : line.substring(0, separator).trim();
            String expected = separator < 0 ? "" : line.substring(separator + STEP_SEPARATOR.length()).trim();
            if (action.isEmpty()) continue;
            steps.add(new TestCaseDto.StepDto(number++, action, expected));
        }
        return steps;
    }

    private static String nullSafe(String value) {
        return value == null ? "" : value;
    }
}
