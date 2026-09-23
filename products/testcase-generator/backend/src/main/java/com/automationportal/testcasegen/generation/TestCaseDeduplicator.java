package com.automationportal.testcasegen.generation;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Removes duplicates produced across chunk boundaries. Ported from Archive's srs.utility.js.
 *
 * Chunks deliberately overlap, so the same requirement is often seen twice and yields near-identical
 * test cases. Two passes: an exact signature match (title + description + steps), then a title-only
 * match for titles long enough to be distinctive — a short title like "Verify login" can legitimately
 * recur across different sections, so matching on it alone would discard real test cases.
 */
@Component
public class TestCaseDeduplicator {

    private static final int DISTINCTIVE_TITLE_LENGTH = 20;

    public List<GeneratedTestCase> deduplicate(List<GeneratedTestCase> testCases) {
        Set<String> seenSignatures = new HashSet<>();
        Set<String> seenTitles = new HashSet<>();
        List<GeneratedTestCase> unique = new ArrayList<>();

        for (GeneratedTestCase testCase : testCases) {
            if (testCase == null) continue;

            String title = normalize(testCase.title());
            String description = normalize(testCase.description());
            if (title.isEmpty() && description.isEmpty()) continue;

            String steps = testCase.steps().stream()
                    .map(step -> normalize(step.action()))
                    .reduce((a, b) -> a + "|" + b)
                    .orElse("");

            String signature = title + "::" + description + "::" + steps;
            if (!seenSignatures.add(signature)) continue;

            boolean distinctive = title.length() > DISTINCTIVE_TITLE_LENGTH;
            if (distinctive && !seenTitles.add(title)) continue;

            unique.add(testCase);
        }
        return unique;
    }

    private String normalize(String value) {
        return value == null ? "" : value.toLowerCase().replaceAll("[^a-z0-9]", "");
    }
}
