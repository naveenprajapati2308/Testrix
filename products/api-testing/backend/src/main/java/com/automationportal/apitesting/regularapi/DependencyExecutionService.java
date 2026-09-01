package com.automationportal.apitesting.regularapi;

import com.automationportal.apitesting.baseapi.ApiVariableBinding;
import com.automationportal.apitesting.baseapi.ApiVariableBindingRepository;
import com.automationportal.apitesting.baseapi.BaseApi;
import com.automationportal.apitesting.baseapi.BaseApiExecutionService;
import com.automationportal.apitesting.baseapi.BaseApiRepository;
import com.automationportal.apitesting.execution.DynamicValueResolver;
import com.automationportal.apitesting.execution.ExecutionEngineService;
import com.automationportal.apitesting.execution.dto.ExecutionContext;
import com.automationportal.apitesting.execution.dto.ExecutionRequest;
import com.automationportal.apitesting.execution.dto.ExecutionResponse;
import com.automationportal.apitesting.history.ExecutionHistory;
import com.automationportal.apitesting.history.ExecutionHistoryService;
import com.automationportal.apitesting.validation.BusinessValidationRun;
import com.automationportal.apitesting.validation.BusinessValidationService;
import com.automationportal.apitesting.validation.ValidationEngine;
import com.jayway.jsonpath.Configuration;
import com.jayway.jsonpath.JsonPath;
import com.jayway.jsonpath.Option;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Executes a Regular API: resolves Base API dependencies (per cache strategy),
 * extracts bound variables via JSONPath, substitutes {{placeholders}} in the
 * templates, executes the resolved request, runs validation rules, and records
 * everything to history. Never sends a request containing an unresolved
 * {{placeholder}}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DependencyExecutionService {

    private static final Configuration JSONPATH_CONFIG = Configuration.builder()
            .options(Option.SUPPRESS_EXCEPTIONS).build();

    private final RegularApiRepository regularApiRepository;
    private final BaseApiRepository baseApiRepository;
    private final ApiVariableBindingRepository bindingRepository;
    private final BaseApiExecutionService baseApiExecutionService;
    private final ExecutionEngineService engine;
    private final ExecutionHistoryService historyService;
    private final ValidationEngine validationEngine;
    private final BusinessValidationService businessValidationService;
    private final DynamicValueResolver dynamicValueResolver;
    private final RegularApiRequestBuilder requestBuilder;
    private final KhasraPickerService khasraPickerService;

    @Data
    public static class RegularExecutionResult {
        private ExecutionResponse response;
        private Long executionHistoryId;
        private Boolean validationPassed;
        private Map<String, String> resolvedVariables = new HashMap<>();
    }

    public RegularExecutionResult execute(RegularApi api, ExecutionHistory.TriggeredBy trigger, Long scheduleId) {
        return execute(api, trigger, scheduleId, ExecutionContext.standalone());
    }

    public RegularExecutionResult execute(RegularApi api, ExecutionHistory.TriggeredBy trigger, Long scheduleId,
                                          ExecutionContext context) {
        RegularExecutionResult result = new RegularExecutionResult();
        ExecutionRequest request = requestBuilder.build(api);
        dynamicValueResolver.resolve(request, context.getDynamicValueCache());
        log.info("executing regular api id={} name='{}' trigger={} scheduleId={} correlationId={}",
                api.getId(), api.getName(), trigger, scheduleId, context.getCorrelationId());

        // 1. Resolve dependencies if dynamic
        if (api.isDynamic()) {
            try {
                Map<String, String> variables = resolveVariables(api, context);
                if ("KHASRA_PICKER".equals(api.getSpecialResolver())) {
                    variables.putAll(runKhasraPicker(request, api));
                }
                result.setResolvedVariables(maskValues(variables));
                requestBuilder.substitute(request, variables);
            } catch (DependencyResolutionException ex) {
                ExecutionResponse failed = ExecutionResponse.builder()
                        .success(false)
                        .errorMessage(ex.getMessage())
                        .durationMs(0)
                        .build();
                ExecutionHistory h = historyService.record(api.getProjectId(), ExecutionHistory.ApiType.REGULAR, api.getId(),
                        api.getName(), api.getModuleId(), scheduleId, trigger, request, failed,
                        context, result.getResolvedVariables());
                result.setResponse(failed);
                result.setExecutionHistoryId(h.getId());
                return result;
            }
        }

        // 2. Guard: no unresolved placeholders may leave the platform
        String unresolved = requestBuilder.firstUnresolvedPlaceholder(request);
        if (unresolved != null) {
            ExecutionResponse failed = ExecutionResponse.builder()
                    .success(false)
                    .errorMessage("Unresolved variable {{" + unresolved + "}} — no binding provides it. "
                            + (api.isDynamic() ? "Check the API's variable bindings." : "Enable dynamic data and bind it to a Base API."))
                    .durationMs(0)
                    .build();
            ExecutionHistory h = historyService.record(api.getProjectId(), ExecutionHistory.ApiType.REGULAR, api.getId(),
                    api.getName(), api.getModuleId(), scheduleId, trigger, request, failed,
                    context, result.getResolvedVariables());
            result.setResponse(failed);
            result.setExecutionHistoryId(h.getId());
            return result;
        }

        // 3. Execute + record
        ExecutionResponse response = engine.execute(request);
        ExecutionHistory history = historyService.record(api.getProjectId(), ExecutionHistory.ApiType.REGULAR, api.getId(),
                api.getName(), api.getModuleId(), scheduleId, trigger, request, response,
                context, result.getResolvedVariables());

        // 4. Auto-run validation rules
        Boolean passed = validationEngine.validate(ExecutionHistory.ApiType.REGULAR, api.getId(),
                history.getId(), response.getBody());

        // 5. Auto-run required-field business validation (silently skipped when the API has
        // nothing marked Required — most don't). Never for CHAIN_DEPENDENCY: this check sends
        // its own extra live request, and a dependency resolution is explicitly guaranteed to
        // execute the real target at most once per run (see resolveRegularApiForDependency /
        // BaseApiExecutionService#resolveForDependency) — for a Send-OTP style dependency, a
        // second live call here would silently invalidate the OTP the cached result depends on.
        Boolean businessOk = trigger == ExecutionHistory.TriggeredBy.CHAIN_DEPENDENCY ? null
                : businessValidationService.autoCheck(request, api.getProjectId(),
                        BusinessValidationRun.ApiType.REGULAR, api.getId(), "auto:" + trigger, history.getId());

        Boolean combined = BusinessValidationService.combine(passed, businessOk);
        if (combined != null) {
            historyService.markValidation(history, combined);
        }

        result.setResponse(response);
        result.setExecutionHistoryId(history.getId());
        result.setValidationPassed(combined);
        return result;
    }

    /**
     * Builds the same fully-resolved (dependencies substituted, no more
     * {{placeholders}}) request that {@link #execute} would send — used by
     * BusinessValidationService, which needs a real, otherwise-valid config to
     * then strip required fields from, without actually sending or recording
     * this exact call as a normal execution.
     */
    public ExecutionRequest resolveRequest(RegularApi api) {
        ExecutionRequest request = requestBuilder.build(api);
        dynamicValueResolver.resolve(request, new HashMap<>());
        if (api.isDynamic()) {
            Map<String, String> variables = resolveVariables(api, ExecutionContext.standalone());
            if ("KHASRA_PICKER".equals(api.getSpecialResolver())) {
                variables.putAll(runKhasraPicker(request, api));
            }
            requestBuilder.substitute(request, variables);
        }
        String unresolved = requestBuilder.firstUnresolvedPlaceholder(request);
        if (unresolved != null) {
            throw new IllegalArgumentException("Unresolved variable {{" + unresolved + "}} — no binding provides it.");
        }
        return request;
    }

    // ------------------------------------------------------------------

    private static class DependencyResolutionException extends RuntimeException {
        DependencyResolutionException(String message) {
            super(message);
        }
    }

    private Map<String, String> resolveVariables(RegularApi api, ExecutionContext context) {
        // A Regular API can now depend on another Regular API (not just a Base
        // API), which makes a cycle possible (A -> B -> A) where none was before
        // (Base APIs are always leaves). Guard against it explicitly.
        if (!context.getRegularApiCallStack().add(api.getId())) {
            throw new DependencyResolutionException(
                    "Circular dependency detected: Regular API '" + api.getName() + "' (#" + api.getId()
                            + "') depends on itself through its binding chain");
        }
        try {
            List<ApiVariableBinding> bindings = bindingRepository.findByRegularApiId(api.getId());
            Map<String, String> variables = new HashMap<>();

            // Group by source so each dependency executes at most once per run
            Set<Long> baseIds = new LinkedHashSet<>();
            Set<Long> regularIds = new LinkedHashSet<>();
            for (ApiVariableBinding b : bindings) {
                if (b.getBaseApiId() != null) baseIds.add(b.getBaseApiId());
                else if (b.getSourceRegularApiId() != null) regularIds.add(b.getSourceRegularApiId());
            }

            Map<Long, String> baseBodies = new HashMap<>();
            for (Long baseId : baseIds) {
                BaseApi base = baseApiRepository.findById(baseId)
                        .orElseThrow(() -> new DependencyResolutionException(
                                "Dependency Base API #" + baseId + " no longer exists"));
                BaseApiExecutionService.CachedResult cached = baseApiExecutionService.resolveForDependency(base, context);
                if (cached.body() == null) {
                    throw new DependencyResolutionException(
                            "Dependency Base API '" + base.getName() + "' could not be resolved (execution failed or no cached value)");
                }
                baseBodies.put(baseId, cached.body());
            }

            Map<Long, String> regularBodies = new HashMap<>();
            for (Long regularId : regularIds) {
                RegularApi source = regularApiRepository.findById(regularId)
                        .orElseThrow(() -> new DependencyResolutionException(
                                "Dependency Regular API #" + regularId + " no longer exists"));
                regularBodies.put(regularId, resolveRegularApiForDependency(source, context));
            }

            for (ApiVariableBinding b : bindings) {
                String sourceBody = b.getBaseApiId() != null
                        ? baseBodies.get(b.getBaseApiId())
                        : regularBodies.get(b.getSourceRegularApiId());
                Object value = JsonPath.using(JSONPATH_CONFIG).parse(sourceBody).read(b.getSourceJsonPath());
                if (value == null) {
                    String sourceName = b.getBaseApiId() != null
                            ? baseApiRepository.findById(b.getBaseApiId()).map(BaseApi::getName).orElse(String.valueOf(b.getBaseApiId()))
                            : regularApiRepository.findById(b.getSourceRegularApiId()).map(RegularApi::getName).orElse(String.valueOf(b.getSourceRegularApiId()));
                    throw new DependencyResolutionException(
                            "Dependency '" + b.getVariableName() + "' could not be resolved: path "
                                    + b.getSourceJsonPath() + " not found in '" + sourceName + "' response");
                }
                variables.put(b.getVariableName(), String.valueOf(value));
            }
            return variables;
        } finally {
            context.getRegularApiCallStack().remove(api.getId());
        }
    }

    /**
     * Resolves (executing at most once per run, same as a Base API dependency)
     * the response body of a Regular API this one's bindings source from.
     */
    private String resolveRegularApiForDependency(RegularApi source, ExecutionContext context) {
        String cached = context.getRegularApiCache().get(source.getId());
        if (cached != null) return cached;
        RegularExecutionResult nested = execute(source, ExecutionHistory.TriggeredBy.CHAIN_DEPENDENCY, null, context);
        if (nested.getResponse() == null || !nested.getResponse().isSuccess()) {
            String reason = nested.getResponse() != null ? nested.getResponse().getErrorMessage() : "no response";
            throw new DependencyResolutionException(
                    "Dependency Regular API '" + source.getName() + "' could not be resolved (" + reason + ")");
        }
        String body = nested.getResponse().getBody();
        context.getRegularApiCache().put(source.getId(), body);
        return body;
    }

    /**
     * Runs {@link KhasraPickerService} using the district_id/is_old_new values
     * already sitting in the (not-yet-substituted) form data of a
     * KHASRA_PICKER-flagged request, and returns the tehsil_id/village_ward_id/
     * khasra_no variables it found so they can be merged into the normal
     * variables map before substitution.
     */
    private Map<String, String> runKhasraPicker(ExecutionRequest request, RegularApi api) {
        String districtId = formValue(request, "district_id");
        String isOldNew = formValue(request, "is_old_new");
        if (districtId == null) {
            throw new DependencyResolutionException(
                    "KHASRA_PICKER on '" + api.getName() + "' requires a 'district_id' form field to know which district to search");
        }
        KhasraPickerService.Result picked;
        try {
            picked = khasraPickerService.pick(api.getProjectId(), districtId, isOldNew != null ? isOldNew : "New");
        } catch (KhasraPickerService.NoAvailableKhasraException ex) {
            throw new DependencyResolutionException(ex.getMessage());
        }
        Map<String, String> variables = new HashMap<>();
        variables.put("tehsil_id", String.valueOf(picked.tehsilId()));
        variables.put("village_ward_id", String.valueOf(picked.villageWardId()));
        variables.put("khasra_no", picked.khasraNo());
        return variables;
    }

    private String formValue(ExecutionRequest request, String key) {
        for (var f : request.getFormData()) {
            if (key.equals(f.getKey())) return f.getValue();
        }
        return null;
    }

    private Map<String, String> maskValues(Map<String, String> variables) {
        Map<String, String> masked = new HashMap<>();
        variables.forEach((k, v) -> masked.put(k,
                v == null || v.length() <= 4 ? "****" : "****" + v.substring(v.length() - 4)));
        return masked;
    }
}
