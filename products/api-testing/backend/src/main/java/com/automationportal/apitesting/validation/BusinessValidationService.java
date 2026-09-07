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
 * Runs a "Business Validation Check": fields the user has manually flagged as
 * business-required (independent of whatever the backend actually enforces) are
 * stripped from an otherwise-valid, already-saved request config, that variant is
 * executed, and the response is inspected for each field's key to see whether the
 * backend actually complained about it being missing.
 *
 * Required HEADER fields (Authorization, API keys, ...) are stripped and checked in
 * a separate execution from required QUERY_PARAM/FORM_DATA/BODY fields, with the
 * other group left valid in each. A header that gates the request (e.g. a missing
 * Authorization token) otherwise gets the backend to reject before it ever reaches
 * its own field validation, which would falsely report every data field as "NOT
 * enforced" regardless of whether the backend actually requires it — see
 * project_business_validation_masking_2026-09-03 memory for the demo case that
 * surfaced this (16 required fields, only Authorization ever showed enforced).
 *
 * Deliberately NOT wired into ScheduleWorker or any recurring run — this is an
 * on-demand check the user triggers manually, kept separate so it never adds
 * extra load to a live/production target on every scheduled cycle.
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

    /** @param executionHistoryId set only when this check is an auto-run triggered alongside a
     *  real execution (Regular/Base/Collection/Group member) — links the saved run to that exact
     *  ExecutionHistory row so a report always shows what was true for that specific run. Pass
     *  null for the manual on-demand "Run Validation Check" button. */
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
            // Header-required fields (e.g. Authorization) stay valid/enabled here — otherwise
            // this execution would hit the same auth-layer rejection as above and every data
            // field would be misreported as "NOT enforced" without the backend ever having
            // looked at them.
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
            // response.isSuccess() means "a real HTTP response came back" (any status code —
            // even 400/503 count), not "status was 2xx". A false here is a transport-level
            // failure (network/timeout/DNS), which never counts as "enforced" — that would
            // misreport an unrelated infra issue as a passing business rule.
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

    /** Convenience wrapper for the three execution paths (Regular/Base/Collection) that now
     * auto-run this check alongside every real execution: skips silently when nothing is marked
     * Required, and never lets a hiccup in the check itself (e.g. the stripped variant times out)
     * fail the real execution it's piggybacking on — worst case, this contributes no signal.
     * @return null when there was nothing to check or the check itself failed to run; true/false
     * (whether every required field was actually enforced by the backend) otherwise. */
    public Boolean autoCheck(ExecutionRequest baseConfig, Long projectId, BusinessValidationRun.ApiType apiType,
                             Long apiId, String triggeredByEmail, Long executionHistoryId) {
        // Never for a write method: check() sends its own extra live request(s) (up to two —
        // one per stripped-fields group), and for POST/PUT/PATCH/DELETE against a real external
        // system that's an extra live write on every single execution — e.g. a second "Add
        // Khasra"/draft-creation attempt against godavari.mp.gov.in alongside the real one.
        // GET/HEAD are idempotent, so the extra calls are harmless there; anything else is
        // skipped outright rather than risking a duplicate write. See
        // project_required_field_report_fix_deployed_2026-08-31 memory.
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

    /** Matches the field's raw key first, then falls back to looser variants — a backend's
     * error text often names the field differently than the request key (e.g. "district is
     * required" for a key of district_id): spaces instead of underscores, and/or the id/code
     * suffix dropped. Without these fallbacks, a field the backend genuinely rejected still
     * gets misreported as "NOT enforced" just because the wording didn't match verbatim. */
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
        // JSON body fields have no natural row-per-field structure of their own (the body is a
        // single free-text blob), so required-ness is tracked separately in requiredPayloadFields
        // rather than derived from parsing the live body. Only JSON is supported — there's no
        // safe generic way to remove one field from XML/TEXT/FORM_URLENCODED body text.
        if (config.getBodyType() == ExecutionRequest.BodyType.JSON) {
            for (KeyValueItem p : config.getRequiredPayloadFields()) {
                if (p.isRequired() && p.isEnabled() && p.getKey() != null && !p.getKey().isBlank()) {
                    out.add(new FieldRef(p.getKey(), "BODY"));
                }
            }
        }
        return out;
    }

    /** Disables (never removes — keeps list indices stable) only the fields named in {@code
     * toStrip}, so the existing enabled-checks already in ExecutionEngineService naturally omit
     * them from the outgoing request, exactly like a user manually unchecking a row. Required
     * fields NOT in {@code toStrip} are left enabled/valid — {@link #check} relies on this to
     * test one group (header vs. data) at a time without the other group's absence masking the
     * result. */
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

    /** Removes each required BODY-source field's key from a JSON object body. Silently leaves
     * the body untouched if it doesn't parse as a JSON object — a malformed/non-object body is
     * the same "backend never got a chance to enforce it" situation the enforced=false result
     * already reports correctly, so there's nothing extra to do here. */
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
