package com.automationportal.perftesting.engine;

import com.automationportal.perftesting.perftest.Assertion;
import com.automationportal.perftesting.perftest.HttpMethod;
import com.automationportal.perftesting.perftest.PerformanceTest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The generated script is executed by k6 as JavaScript, so a test field that reaches it
 * unescaped is remote code execution inside the backend container (k6 inherits its
 * environment, which holds PORTAL_JWT_SECRET and the DB password).
 */
class K6ScriptGeneratorTest {

    private final K6ScriptGenerator generator = new K6ScriptGenerator(null);

    private PerformanceTest baseTest() {
        PerformanceTest test = new PerformanceTest();
        test.setTargetUrl("https://example.test/api");
        test.setHttpMethod(HttpMethod.GET);
        test.setIterations(1);
        test.setTimeoutMs(1000);
        test.setThinkTimeMs(0);
        test.setFollowRedirects(true);
        return test;
    }

    @Test
    void numericAssertionRejectsAnExpression() {
        PerformanceTest test = baseTest();
        test.setAssertions(List.of(Assertion.builder()
                .type("STATUS").operator("EQ")
                .value("0 || (()=>{throw 'pwned'})()")
                .build()));

        assertThrows(IllegalArgumentException.class, () -> generator.generatePerformanceTestScript(test));
    }

    @Test
    void jsonPathRejectsAnExpression() {
        PerformanceTest test = baseTest();
        test.setAssertions(List.of(Assertion.builder()
                .type("JSON_PATH").operator("EQ")
                .path("$.a; __ENV.PORTAL_JWT_SECRET")
                .value("x")
                .build()));

        assertThrows(IllegalArgumentException.class, () -> generator.generatePerformanceTestScript(test));
    }

    @Test
    void trailingBackslashCannotCloseAStringLiteral() {
        PerformanceTest test = baseTest();
        // The old hand-rolled escaper turned \' into \\' — an escaped backslash followed by a
        // live quote, which ended the literal and ran whatever came next.
        test.setTargetUrl("https://example.test/\\");
        test.setAssertions(List.of(Assertion.builder()
                .type("BODY_CONTAINS").operator("CONTAINS")
                .value("\\' + (()=>{throw 'pwned'})() + '")
                .build()));

        String script = generator.generatePerformanceTestScript(test);
        // Both stay one balanced double-quoted literal, with the backslash doubled so it
        // escapes itself instead of the quote that ends the string.
        assertTrue(script.contains("const url = \"https://example.test/\\\\\""),
                "target URL escaped its string literal");
        assertTrue(script.contains("r.body.includes(\"\\\\' + (()=>{throw 'pwned'})() + '\")"),
                "assertion value escaped its string literal");
        assertFalse(script.contains("includes('"), "a single-quoted literal is still being emitted");
    }

    @Test
    void ordinaryAssertionsStillGenerate() {
        PerformanceTest test = baseTest();
        test.setAssertions(List.of(
                Assertion.builder().type("STATUS").operator("EQ").value("200").build(),
                Assertion.builder().type("STATUS").operator("IN").value("200, 201,204").build(),
                Assertion.builder().type("RESPONSE_TIME").operator("LT").value("500").build(),
                Assertion.builder().type("BODY_CONTAINS").operator("CONTAINS").value("ok").build(),
                Assertion.builder().type("HEADER_VALUE").operator("EQ").key("Content-Type").value("application/json").build(),
                Assertion.builder().type("JSON_PATH").operator("EQ").path("$.data.id").value("7").build()));

        String script = assertDoesNotThrow(() -> generator.generatePerformanceTestScript(test));
        assertTrue(script.contains("r.status == 200"));
        assertTrue(script.contains("[200, 201, 204].map(String)"));
        assertTrue(script.contains("r.timings.duration < 500"));
        assertTrue(script.contains("r.body.includes(\"ok\")"));
        assertTrue(script.contains("r.headers[\"Content-Type\"] === \"application/json\""));
        assertTrue(script.contains("json.data.id == \"7\""));
    }
}
