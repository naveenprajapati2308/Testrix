package com.automationportal.testcasegen.generation;

import org.springframework.stereotype.Component;

/** Builds the per-chunk generation prompt. Ported from Archive's srs.utility.js. */
@Component
public class TestCasePromptBuilder {

    public String build(SrsChunk chunk) {
        String section = chunk.section() == null || chunk.section().isBlank() ? "General" : chunk.section();

        return """
                You are an expert QA engineer.

                Analyze the provided SRS section and generate comprehensive, executable software test cases.

                Instructions:
                1. Extract distinct, high-value test cases covering positive, negative, boundary, validation, \
                workflow, integration, security, and role-based scenarios explicitly supported by the SRS.
                2. Avoid repetitive or redundant test cases.
                3. Set "type" to one of: Functional, Negative, Boundary, Validation, Business Rule, Workflow, \
                Integration, Security, Notification, Error Handling, Usability, Compatibility.
                4. Set "priority" to "High", "Medium", or "Low" ONLY if explicitly specified in the SRS; \
                otherwise set priority to null.
                5. Provide clear action steps with expected results.
                6. Set "sourceText" to the exact supporting text from the SRS.
                7. Set "sourceSection" to "%s".
                8. Return ONLY valid JSON adhering to the format below.

                Output Format:
                {
                  "testCases": [
                    {
                      "title": "Verify Estate Officer can save valid Cost Fixation details",
                      "description": "Verify that valid Cost Fixation details can be saved successfully.",
                      "type": "Functional",
                      "priority": null,
                      "preconditions": ["Estate Officer is authenticated"],
                      "testData": ["Valid Cost Fixation details"],
                      "steps": [
                        {"step": 1, "action": "Navigate to Cost Fixation Management", "expectedResult": "Page is displayed"},
                        {"step": 2, "action": "Enter valid details and click Save", "expectedResult": "Details are saved successfully"}
                      ],
                      "expectedResult": "Cost Fixation details are successfully saved.",
                      "sourceText": "Exact supporting text from SRS",
                      "sourceSection": "%s"
                    }
                  ]
                }

                SRS SECTION CONTENT:
                %s""".formatted(section, section, chunk.text());
    }
}
