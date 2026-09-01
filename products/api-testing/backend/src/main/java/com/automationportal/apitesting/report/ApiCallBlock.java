package com.automationportal.apitesting.report;

import com.automationportal.apitesting.validation.FieldValidationResult;
import com.automationportal.apitesting.validation.ValidationResultView;
import lombok.Data;

import java.util.List;

/** One API call inside a report — every field that was asked for: endpoint, payload, rules, result. */
@Data
public class ApiCallBlock {
    private String name;
    private String method;
    private String url;
    private String requestHeaders;
    private String requestBody;
    private String injectedVariables;
    private Integer responseStatusCode;
    private String responseStatusMessage;
    private String responseHeaders;
    private String responseBody;
    private Long responseSizeBytes;
    private long totalTimeMs;
    private Boolean validationPassed;
    private String errorMessage;
    private List<ValidationResultView> validationResults;
    /** Which payload/header/query fields were flagged Required by business logic for this
     * specific run, and whether the backend actually enforced each one. Empty when nothing
     * was marked Required — not an error, just nothing to show. */
    private List<FieldValidationResult> requiredFieldResults;
}
