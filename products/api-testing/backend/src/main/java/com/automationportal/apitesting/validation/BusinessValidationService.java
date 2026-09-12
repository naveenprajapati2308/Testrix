package com.automationportal.apitesting.validation;

import com.automationportal.apitesting.execution.ExecutionEngineService;
import com.automationportal.apitesting.execution.dto.ExecutionRequest;
import com.automationportal.apitesting.execution.dto.ExecutionResponse;
import com.automationportal.apitesting.execution.dto.FormDataItem;
import com.automationportal.apitesting.execution.dto.KeyValueItem;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Strips the fields a user flagged as business-required from an otherwise-valid saved request,
 * runs that variant, and inspects the response to see whether the backend actually enforces them.
 *
 * Headers and data fields are stripped in two separate executions, each leaving the other group
 * valid: a missing Authorization token makes the backend reject before its own field validation,
 * which would falsely report every data field as "NOT enforced".
 */
@Service
@RequiredArgsConstructor
public class BusinessValidationService {

    private final ExecutionEngineService executionEngine;
    private final BusinessValidationRunRepository repository;
    private final ObjectMapper objectMapper;

    public ValidationCheckResult check(ExecutionRequest baseConfig, Long projectId,
                                       BusinessValidationRun.ApiType apiType, Long apiId,
                                       String triggeredByEmail) {
        return check(baseConfig, projectId, apiType, apiId, triggeredByEmail, null);
    }

    /** @param executionHistoryId links this check to the exact run it piggybacked on, so a report
     *  shows what was true for that run. Null for the manual "Run Validation Check" button. */
    public ValidationCheckResult check(ExecutionRequest baseConfig, Long projectId,
                                       BusinessValidationRun.ApiType apiType, Long apiId,
                                       String triggeredByEmail, Long executionHistoryId) {
        List<FieldRef> required = collectRequired(baseConfig);
        if (required.isEmpty()) {
            throw new IllegalArgumentException(
                    "No fields are marked as  Required — mark at least one field before running a validation check.");
        }

        List<FieldRef> headerFields = required.stream().filter(r -> "HEADER".equals(r.source)).toList();
        List<FieldRef> dataFields = required.stream().filter(r -> !"HEADER".equals(r.source)).toList();

        List<FieldValidationResult> results = new ArrayList<>();
        Integer lastStatusCode = null;

        if (!headerFields.isEmpty()) {
            ExecutionResponse response = executionEngine.execute(strip(baseConfig, headerFields));
            lastStatusCode = response.getStatusCode();
            results.addAll(evaluate(response, headerFields));
        }
        if (!dataFields.isEmpty()) {
            // Header fields stay valid here, or this run hits the same auth-layer rejection and
            // every data field is misreported as "NOT enforced" without ever being looked at.
            ExecutionResponse response = executionEngine.execute(strip(baseConfig, dataFields));
            lastStatusCode = response.getStatusCode();
            results.addAll(evaluate(response, dataFields));
        }

        int enforcedCount = (int) results.stream().filter(FieldValidationResult::isEnforced).count();

        BusinessValidationRun run = new BusinessValidationRun();
        run.setProjectId(projectId);
        run.setApiType(apiType);
        run.setApiId(apiId);
        run.setTotalRequired(required.size());
        run.setEnforcedCount(enforcedCount);
        run.setResponseStatusCode(lastStatusCode);
        run.setFieldResults(toJson(results));
        run.setTriggeredByEmail(triggeredByEmail);
        run.setExecutionHistoryId(executionHistoryId);
        run = repository.save(run);

        return ValidationCheckResult.builder()
                .id(run.getId())
                .totalRequired(run.getTotalRequired())
                .enforcedCount(run.getEnforcedCount())
                .responseStatusCode(run.getResponseStatusCode())
                .fields(results)
                .createdAt(run.getCreatedAt())
                .build();
    }

    private List<FieldValidationResult> evaluate(ExecutionResponse response, List<FieldRef> fields) {
        String haystack = (response.getBody() == null ? "" : response.getBody()).toLowerCase();
        List<FieldValidationResult> out = new ArrayList<>();
        for (FieldRef ref : fields) {
            // isSuccess() means "a response came back at all", not 2xx. False is a transport
            // failure, which must never count as enforced — that reports infra as a business rule.
            boolean enforced = response.isSuccess() && mentionsField(haystack, ref.key);
            FieldValidationResult r = new FieldValidationResult();
            r.setKey(ref.key);
            r.setSource(ref.source);
            r.setEnforced(enforced);
            out.add(r);
        }
        return out;
    }

    /** Non-throwing counterpart to {@link #check}'s upfront guard — lets an auto-run hook
     * silently skip APIs with nothing marked Required instead of raising. */
    public boolean hasRequiredFields(ExecutionRequest config) {
        return !collectRequired(config).isEmpty();
    }

    /** Wrapper for the execution paths that auto-run this check: skips when nothing is Required,
     * and never lets a failure here fail the real execution it piggybacks on.
     * @return null when there was nothing to check or the check itself failed. */
    public Boolean autoCheck(ExecutionRequest baseConfig, Long projectId, BusinessValidationRun.ApiType apiType,
                             Long apiId, String triggeredByEmail, Long executionHistoryId) {
        // Never for a write method: check() sends up to two extra live requests, which against a
        // real external system means duplicate writes on every execution. GET/HEAD are idempotent
        // so the extra calls are harmless; anything else is skipped rather than risk that.
        if (baseConfig.getMethod() != null && !"GET".equalsIgnoreCase(baseConfig.getMethod())
                && !"HEAD".equalsIgnoreCase(baseConfig.getMethod())) {
            return null;
        }
        if (!hasRequiredFields(baseConfig)) return null;
        try {
            ValidationCheckResult result = check(baseConfig, projectId, apiType, apiId, triggeredByEmail, executionHistoryId);
            return result.getFields().stream().allMatch(FieldValidationResult::isEnforced);
        } catch (Exception e) {
            return null;
        }
    }

    /** Combines two independent pass/fail signals (rule-based validation, business-required-field
     * validation) where either one can be "no signal" (null, meaning nothing was configured to
     * check). Null only when both are null; otherwise fails if either explicitly failed. */
    public static Boolean combine(Boolean a, Boolean b) {
        if (a == null && b == null) return null;
        boolean aOk = a == null || a;
        boolean bOk = b == null || b;
        return aOk && bOk;
    }

    /** Required-field results for one specific execution's auto-run, for report rendering.
     * Empty when that execution had nothing marked Required (nothing to show — not an error). */
    public List<FieldValidationResult> findByExecutionHistoryId(Long executionHistoryId) {
        return repository.findByExecutionHistoryId(executionHistoryId)
                .map(run -> this.<List<FieldValidationResult>>fromJson(run.getFieldResults(),
                        objectMapper.getTypeFactory().constructCollectionType(List.class, FieldValidationResult.class)))
                .filter(java.util.Objects::nonNull)
                .orElse(List.of());
    }

    public List<ValidationCheckResult> history(Long projectId, BusinessValidationRun.ApiType apiType, Long apiId) {
        return repository.findByProjectIdAndApiTypeAndApiIdOrderByCreatedAtDesc(projectId, apiType, apiId)
                .stream().map(this::toResult).toList();
    }

    public ValidationCheckResult latest(Long projectId, BusinessValidationRun.ApiType apiType, Long apiId) {
        return repository.findFirstByProjectIdAndApiTypeAndApiIdOrderByCreatedAtDesc(projectId, apiType, apiId)
                .map(this::toResult).orElse(null);
    }

    /** Raw key first, then looser variants: error text often names a field differently than the
     * request key ("district is required" for district_id). Without the fallbacks, a genuinely
     * rejected field is misreported as "NOT enforced" purely over wording. */
    private boolean mentionsField(String haystackLower, String key) {
        if (key == null || key.isBlank()) return false;
        for (String variant : fieldNameVariants(key.toLowerCase())) {
            if (variant.isBlank()) continue;
            Pattern p = Pattern.compile("\\b" + Pattern.quote(variant) + "\\b");
            if (p.matcher(haystackLower).find()) return true;
        }
        return false;
    }

    // Underscore-prefixed only — a bare "id"/"code" suffix would also strip words like
    // "valid" or "zipcode" that merely end in those letters, causing false matches.
    private static final List<String> ID_SUFFIXES = List.of("_id", "_code");

    private List<String> fieldNameVariants(String lowerKey) {
        List<String> variants = new ArrayList<>();
        variants.add(lowerKey);
        variants.add(lowerKey.replace('_', ' ').trim());
        for (String suffix : ID_SUFFIXES) {
            if (lowerKey.endsWith(suffix) && lowerKey.length() > suffix.length()) {
                String base = lowerKey.substring(0, lowerKey.length() - suffix.length());
                if (!base.isBlank()) {
                    variants.add(base);
                    variants.add(base.replace('_', ' ').trim());
                }
            }
        }
        return variants;
    }

    private record FieldRef(String key, String source) { }

    private List<FieldRef> collectRequired(ExecutionRequest config) {
        List<FieldRef> out = new ArrayList<>();
        for (KeyValueItem h : config.getHeaders()) {
            if (h.isRequired() && h.isEnabled() && h.getKey() != null && !h.getKey().isBlank()) {
                out.add(new FieldRef(h.getKey(), "HEADER"));
            }
        }
        for (KeyValueItem q : config.getQueryParams()) {
            if (q.isRequired() && q.isEnabled() && q.getKey() != null && !q.getKey().isBlank()) {
                out.add(new FieldRef(q.getKey(), "QUERY_PARAM"));
            }
        }
        if (config.getBodyType() == ExecutionRequest.BodyType.FORM_DATA) {
            for (FormDataItem f : config.getFormData()) {
                if (f.isRequired() && f.isEnabled() && f.getKey() != null && !f.getKey().isBlank()) {
                    out.add(new FieldRef(f.getKey(), "FORM_DATA"));
                }
            }
        }
        // The body is one free-text blob with no row-per-field structure, so required-ness is
        // tracked in requiredPayloadFields instead. JSON only — there is no safe generic way to
        // remove a single field from XML/TEXT/FORM_URLENCODED text.
        if (config.getBodyType() == ExecutionRequest.BodyType.JSON) {
            for (KeyValueItem p : config.getRequiredPayloadFields()) {
                if (p.isRequired() && p.isEnabled() && p.getKey() != null && !p.getKey().isBlank()) {
                    out.add(new FieldRef(p.getKey(), "BODY"));
                }
            }
        }
        return out;
    }

    /** Disables rather than removes, so list indices stay stable and the engine's existing
     * enabled-checks omit them exactly like a user unchecking a row. Fields outside {@code
     * toStrip} stay enabled so one group can be tested without the other masking the result. */
    private ExecutionRequest strip(ExecutionRequest baseConfig, List<FieldRef> toStrip) {
        String json = toJson(baseConfig);
        ExecutionRequest variant = fromJson(json, ExecutionRequest.class);

        java.util.Set<String> headerKeys = toStrip.stream().filter(r -> "HEADER".equals(r.source)).map(r -> r.key).collect(java.util.stream.Collectors.toSet());
        java.util.Set<String> queryKeys = toStrip.stream().filter(r -> "QUERY_PARAM".equals(r.source)).map(r -> r.key).collect(java.util.stream.Collectors.toSet());
        java.util.Set<String> formKeys = toStrip.stream().filter(r -> "FORM_DATA".equals(r.source)).map(r -> r.key).collect(java.util.stream.Collectors.toSet());

        for (KeyValueItem h : variant.getHeaders()) {
            if (h.isRequired() && headerKeys.contains(h.getKey())) h.setEnabled(false);
        }
        for (KeyValueItem q : variant.getQueryParams()) {
            if (q.isRequired() && queryKeys.contains(q.getKey())) q.setEnabled(false);
        }
        for (FormDataItem f : variant.getFormData()) {
            if (f.isRequired() && formKeys.contains(f.getKey())) f.setEnabled(false);
        }
        if (variant.getBodyType() == ExecutionRequest.BodyType.JSON && variant.getBody() != null
                && toStrip.stream().anyMatch(r -> "BODY".equals(r.source))) {
            variant.setBody(stripJsonFields(variant.getBody(), toStrip));
        }
        return variant;
    }

    /** Removes each required BODY field's key from a JSON object body, leaving a non-JSON body
     * untouched — that is the same "never got a chance to enforce it" case enforced=false
     * already reports correctly. */
    private String stripJsonFields(String body, List<FieldRef> required) {
        try {
            com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(body);
            if (!node.isObject()) return body;
            com.fasterxml.jackson.databind.node.ObjectNode obj = (com.fasterxml.jackson.databind.node.ObjectNode) node;
            for (FieldRef ref : required) {
                if ("BODY".equals(ref.source)) obj.remove(ref.key);
            }
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return body;
        }
    }

    private ValidationCheckResult toResult(BusinessValidationRun run) {
        List<FieldValidationResult> fields = fromJson(run.getFieldResults(),
                objectMapper.getTypeFactory().constructCollectionType(List.class, FieldValidationResult.class));
        return ValidationCheckResult.builder()
                .id(run.getId())
                .totalRequired(run.getTotalRequired())
                .enforcedCount(run.getEnforcedCount())
                .responseStatusCode(run.getResponseStatusCode())
                .fields(fields)
                .createdAt(run.getCreatedAt())
                .build();
    }

    private String toJson(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize validation check data", e);
        }
    }

    private <T> T fromJson(String json, Class<T> type) {
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to read validation check data", e);
        }
    }

    private <T> T fromJson(String json, com.fasterxml.jackson.databind.JavaType type) {
        try {
            if (json == null || json.isBlank()) return null;
            return objectMapper.readValue(json, type);
        } catch (Exception e) {
            return null;
        }
    }
}
