package com.automationportal.apitesting.execution.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * The request configuration built in the browser. The frontend never calls the
 * target API itself — it sends this config here and the backend executes it.
 */
@Data
public class ExecutionRequest {

    public enum BodyType { NONE, JSON, XML, TEXT, HTML, FORM_URLENCODED, FORM_DATA }

    @NotBlank(message = "HTTP method is required")
    private String method;

    @NotBlank(message = "URL is required")
    private String url;

    private List<KeyValueItem> queryParams = new ArrayList<>();
    private List<KeyValueItem> headers = new ArrayList<>();

    private BodyType bodyType = BodyType.NONE;
    private String body;
    private List<FormDataItem> formData = new ArrayList<>();

    /** JSON-body field names manually flagged Required by business logic — same "Required"
     * concept as headers/query params, just for the raw JSON payload (which has no natural
     * row-per-field structure of its own). Only meaningful when bodyType == JSON. */
    private List<KeyValueItem> requiredPayloadFields = new ArrayList<>();

    private AuthConfig auth = new AuthConfig();

    private long timeoutMs = 30_000;
    private boolean followRedirects = true;
    private boolean verifySsl = true;
}
