package com.automationportal.testcasegen.generation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Turns a model response into test cases. Ported from Archive's ai.utility.js.
 *
 * Models drift from the requested schema in small ways — wrapping JSON in markdown fences, using
 * test_cases instead of testCases, returning a bare array, or a single object. Every recovery here
 * exists because the alternative is discarding a whole chunk's worth of usable output. A chunk that
 * genuinely can't be parsed yields an empty list rather than failing the run.
 */
@Slf4j
@Component
public class TestCaseJsonParser {

    private final ObjectMapper mapper = new ObjectMapper();

    public List<GeneratedTestCase> parse(String raw, String defaultSection) {
        if (raw == null || raw.isBlank()) return List.of();

        String cleaned = raw.trim()
                .replaceAll("^```(?:json)?\\s*", "")
                .replaceAll("\\s*```$", "")
                .trim();

        List<GeneratedTestCase> direct = extract(readTree(cleaned), defaultSection);
        if (direct != null) return direct;

        // The model sometimes wraps valid JSON in prose; take the widest brace/bracket span.
        List<GeneratedTestCase> fromObject = extract(readTree(span(cleaned, '{', '}')), defaultSection);
        if (fromObject != null) return fromObject;

        List<GeneratedTestCase> fromArray = extract(readTree(span(cleaned, '[', ']')), defaultSection);
        if (fromArray != null) return fromArray;

        log.warn("Could not parse model output for section '{}'", defaultSection);
        return List.of();
    }

    private JsonNode readTree(String text) {
        if (text == null || text.isBlank()) return null;
        try {
            return mapper.readTree(text);
        } catch (Exception e) {
            return null;
        }
    }

    private String span(String text, char open, char close) {
        int first = text.indexOf(open);
        int last = text.lastIndexOf(close);
        return first >= 0 && last > first ? text.substring(first, last + 1) : null;
    }

    /** Null means "this wasn't test-case shaped", so the caller can try the next recovery. */
    private List<GeneratedTestCase> extract(JsonNode root, String defaultSection) {
        if (root == null) return null;

        if (root.isArray()) return mapAll(root, defaultSection);

        for (String field : List.of("testCases", "test_cases")) {
            if (root.path(field).isArray()) return mapAll(root.get(field), defaultSection);
        }

        if (root.isObject()) {
            for (JsonNode value : root) {
                if (value.isArray() && !value.isEmpty() && value.get(0).isObject()) {
                    return mapAll(value, defaultSection);
                }
            }
            if (root.hasNonNull("title") || root.hasNonNull("description") || root.path("steps").isArray()) {
                GeneratedTestCase single = normalize(root, defaultSection);
                return single == null ? List.of() : List.of(single);
            }
        }
        return null;
    }

    private List<GeneratedTestCase> mapAll(JsonNode array, String defaultSection) {
        List<GeneratedTestCase> result = new ArrayList<>();
        for (JsonNode node : array) {
            GeneratedTestCase testCase = normalize(node, defaultSection);
            if (testCase != null) result.add(testCase);
        }
        return result;
    }

    private GeneratedTestCase normalize(JsonNode node, String defaultSection) {
        if (node == null || !node.isObject()) return null;

        String title = text(node, "title", "name", "testCaseTitle");
        String description = text(node, "description", "summary");
        if (title.isEmpty() && description.isEmpty()) return null;

        List<GeneratedTestCase.Step> steps = steps(node.path("steps"));
        String expected = text(node, "expectedResult", "expected_result", "expected");
        if (expected.isEmpty() && !steps.isEmpty()) {
            expected = steps.get(steps.size() - 1).expectedResult();
        }

        return new GeneratedTestCase(
                title.isEmpty() ? description : title,
                description.isEmpty() ? title : description,
                text(node, "type"),
                text(node, "priority"),
                strings(node.path("preconditions")),
                strings(node.path("testData")),
                steps,
                expected,
                text(node, "sourceText", "source_text", "source"),
                firstNonBlank(text(node, "sourceSection", "source_section", "section"), defaultSection));
    }

    private List<GeneratedTestCase.Step> steps(JsonNode node) {
        if (!node.isArray()) return List.of();
        List<GeneratedTestCase.Step> steps = new ArrayList<>();
        for (JsonNode step : node) {
            if (step.isTextual()) {
                steps.add(new GeneratedTestCase.Step(step.asText().trim(), ""));
            } else if (step.isObject()) {
                String action = text(step, "action");
                if (action.isEmpty()) continue;
                steps.add(new GeneratedTestCase.Step(action,
                        text(step, "expectedResult", "expected_result")));
            }
        }
        return steps;
    }

    private List<String> strings(JsonNode node) {
        if (node.isTextual()) {
            String single = node.asText().trim();
            return single.isEmpty() ? List.of() : List.of(single);
        }
        if (!node.isArray()) return List.of();
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            String value = item.isTextual() ? item.asText().trim() : item.toString().trim();
            if (!value.isEmpty()) values.add(value);
        }
        return values;
    }

    private String text(JsonNode node, String... fields) {
        for (String field : fields) {
            JsonNode value = node.get(field);
            if (value != null && value.isTextual() && !value.asText().isBlank()) {
                return value.asText().trim();
            }
        }
        return "";
    }

    private String firstNonBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
