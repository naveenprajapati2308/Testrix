package com.automationportal.apitesting.baseapi;

import com.automationportal.apitesting.execution.dto.ExecutionResponse;
import com.automationportal.apitesting.module.ApiModuleRepository;
import com.automationportal.apitesting.security.CurrentProjectService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/v1/base-apis")
@RequiredArgsConstructor
public class BaseApiController {

    private final BaseApiRepository repository;
    private final ApiVariableBindingRepository bindingRepository;
    private final BaseApiExecutionService executionService;
    private final com.automationportal.apitesting.audit.AuditService auditService;
    private final com.automationportal.apitesting.collections.ApiCollectionRepository collectionRepository;
    private final com.automationportal.apitesting.collections.CollectionRequestRepository collectionRequestRepository;
    private final com.automationportal.apitesting.common.RequestConfigMapper configMapper;
    private final CurrentProjectService currentProjectService;
    private final ApiModuleRepository moduleRepository;
    private final com.automationportal.apitesting.validation.BusinessValidationService businessValidationService;
    private final com.automationportal.apitesting.security.CurrentUserService currentUserService;

    @Data
    public static class BaseApiPayload {
        @NotBlank private String name;
        @NotBlank private String method;
        @NotBlank private String url;
        private Long moduleId;
        private String headers;        // JSON array of {key,value,enabled}
        private String bodyType;
        private String body;
        private String formData;       // JSON array of FormDataItem, only used when bodyType=FORM_DATA
        private String requiredPayloadFields;  // JSON array of {key,value,enabled,required}, only used when bodyType=JSON
        private String authType;
        private String authConfig;     // AuthConfig JSON (encrypted at rest)
        private int timeoutMs = 15000;
        private BaseApi.CacheStrategy cacheStrategy = BaseApi.CacheStrategy.PER_CALL;
        private Integer cacheTtlSeconds;
    }

    @Data
    public static class ExtractionPayload {
        @NotBlank private String sourceJsonPath;
        @NotBlank private String variableName;
    }

    @GetMapping
    public List<BaseApi> list(@RequestParam(required = false) Long moduleId) {
        Long projectId = currentProjectService.requireProjectId();
        List<BaseApi> apis = moduleId == null
                ? repository.findByProjectId(projectId)
                : repository.findByProjectIdAndModuleId(projectId, moduleId);
        // Snapshots can be large; the list view doesn't need them.
        apis.forEach(a -> a.setLastResponseSnapshot(null));
        return apis;
    }

    @GetMapping("/{id}")
    public BaseApi get(@PathVariable Long id) {
        return find(id);
    }

    @PostMapping
    public BaseApi create(@Valid @RequestBody BaseApiPayload payload) {
        BaseApi api = new BaseApi();
        apply(api, payload);
        api.setProjectId(currentProjectService.requireProjectId());
        validateModule(api.getModuleId(), api.getProjectId());
        api = repository.save(api);
        audit(api.getId(), com.automationportal.apitesting.audit.AuditLog.Action.CREATE,
                "Created base API '" + api.getName() + "'");
        return api;
    }

    @PutMapping("/{id}")
    public BaseApi update(@PathVariable Long id, @Valid @RequestBody BaseApiPayload payload) {
        BaseApi api = find(id);
        apply(api, payload);
        validateModule(api.getModuleId(), api.getProjectId());
        api = repository.save(api);
        audit(id, com.automationportal.apitesting.audit.AuditLog.Action.UPDATE,
                "Updated base API '" + api.getName() + "'");
        return api;
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        BaseApi api = find(id);
        audit(id, com.automationportal.apitesting.audit.AuditLog.Action.DELETE,
                "Deleted base API '" + api.getName() + "'");
        repository.deleteById(id);
    }

    /** Runs the base API now; refreshes snapshot + cache; records history. */
    @PostMapping("/{id}/execute")
    public ExecutionResponse execute(@PathVariable Long id) {
        return executionService.executeManually(find(id));
    }

    /**
     * On-demand only — never scheduled. Strips every field flagged Required from a
     * copy of this API's saved config, runs that variant once, and records which of
     * those fields the backend actually complained about being missing.
     */
    @PostMapping("/{id}/validation-check")
    public com.automationportal.apitesting.validation.ValidationCheckResult runValidationCheck(@PathVariable Long id) {
        BaseApi api = find(id);
        try {
            return businessValidationService.check(executionService.toExecutionRequest(api), api.getProjectId(),
                    com.automationportal.apitesting.validation.BusinessValidationRun.ApiType.BASE, id,
                    currentUserService.currentEmail());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    @GetMapping("/{id}/validation-checks")
    public java.util.List<com.automationportal.apitesting.validation.ValidationCheckResult> validationCheckHistory(@PathVariable Long id) {
        BaseApi api = find(id);
        return businessValidationService.history(api.getProjectId(),
                com.automationportal.apitesting.validation.BusinessValidationRun.ApiType.BASE, id);
    }

    /**
     * Copies this Base API into a tester collection as a runnable request, so
     * it shows up in the collection alongside regular requests (spec §1).
     */
    @PostMapping("/{id}/add-to-collection/{collectionId}")
    public com.automationportal.apitesting.collections.CollectionRequest addToCollection(
            @PathVariable Long id, @PathVariable Long collectionId) {
        BaseApi api = find(id);
        var collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Collection not found"));
        if (!currentProjectService.requireProjectId().equals(collection.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Collection not found");
        }

        java.util.Map<String, Object> config = new java.util.LinkedHashMap<>();
        config.put("method", api.getMethod());
        config.put("url", api.getUrl());
        config.put("queryParams", java.util.List.of());
        config.put("headers", configMapper.keyValues(api.getHeaders()));
        config.put("bodyType", api.getBodyType() == null || api.getBodyType().isBlank() ? "NONE" : api.getBodyType());
        config.put("body", api.getBody() == null ? "" : api.getBody());
        config.put("requiredPayloadFields", configMapper.keyValues(api.getRequiredPayloadFields()));
        config.put("auth", configMapper.auth(api.getAuthConfig()));
        config.put("timeoutMs", api.getTimeoutMs());
        config.put("followRedirects", true);
        config.put("verifySsl", true);

        var request = new com.automationportal.apitesting.collections.CollectionRequest();
        request.setCollectionId(collectionId);
        request.setName("[Base] " + api.getName());
        request.setSeq((int) collectionRequestRepository.countByCollectionId(collectionId));
        request.setMethod(api.getMethod());
        request.setUrl(api.getUrl());
        request.setConfigJson(configMapper.toJson(config));
        request = collectionRequestRepository.save(request);
        audit(id, com.automationportal.apitesting.audit.AuditLog.Action.UPDATE,
                "Added base API '" + api.getName() + "' to collection #" + collectionId);
        return request;
    }

    /** Latest raw response for the field-picker UI (frontend renders the tree). */
    @GetMapping("/{id}/response-tree")
    public ResponseTree responseTree(@PathVariable Long id) {
        BaseApi api = find(id);
        ResponseTree t = new ResponseTree();
        t.setBaseApiId(id);
        t.setLastExecutedAt(api.getLastExecutedAt() == null ? null : api.getLastExecutedAt().toString());
        t.setSnapshot(api.getLastResponseSnapshot());
        t.setExtractions(bindingRepository.findByBaseApiIdAndRegularApiIdIsNull(id));
        return t;
    }

    @Data
    public static class ResponseTree {
        private Long baseApiId;
        private String lastExecutedAt;
        private String snapshot;
        private List<ApiVariableBinding> extractions;
    }

    /** "+ Extract as variable": declares a variable available from this base API. */
    @PostMapping("/{id}/bindings")
    public ApiVariableBinding addExtraction(@PathVariable Long id, @Valid @RequestBody ExtractionPayload payload) {
        find(id);
        boolean duplicate = bindingRepository.findByBaseApiIdAndRegularApiIdIsNull(id).stream()
                .anyMatch(b -> b.getVariableName().equals(payload.getVariableName()));
        if (duplicate) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Variable '" + payload.getVariableName() + "' already defined on this base API");
        }
        ApiVariableBinding b = new ApiVariableBinding();
        b.setBaseApiId(id);
        b.setSourceJsonPath(payload.getSourceJsonPath());
        b.setVariableName(payload.getVariableName());
        return bindingRepository.save(b);
    }

    @DeleteMapping("/{id}/bindings/{bindingId}")
    public void deleteExtraction(@PathVariable Long id, @PathVariable Long bindingId) {
        find(id);
        ApiVariableBinding b = bindingRepository.findById(bindingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Binding not found"));
        if (b.getBaseApiId() == null || !b.getBaseApiId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Binding does not belong to this base API");
        }
        bindingRepository.delete(b);
    }

    private void validateModule(Long moduleId, Long projectId) {
        if (moduleId == null) return;
        boolean owned = moduleRepository.findById(moduleId).map(m -> projectId.equals(m.getProjectId())).orElse(false);
        if (!owned) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Module does not exist");
        }
    }

    private BaseApi find(Long id) {
        BaseApi api = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Base API not found"));
        if (!currentProjectService.requireProjectId().equals(api.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Base API not found");
        }
        return api;
    }

    private void audit(Long id, com.automationportal.apitesting.audit.AuditLog.Action action, String details) {
        auditService.record(currentProjectService.requireProjectId(),
                com.automationportal.apitesting.audit.AuditLog.EntityType.BASE_API, id, action, details);
    }

    private void apply(BaseApi api, BaseApiPayload p) {
        api.setName(p.getName());
        api.setMethod(p.getMethod().toUpperCase());
        api.setUrl(p.getUrl());
        api.setModuleId(p.getModuleId());
        api.setHeaders(p.getHeaders());
        api.setBodyType(p.getBodyType());
        api.setBody(p.getBody());
        api.setFormData(p.getFormData());
        api.setRequiredPayloadFields(p.getRequiredPayloadFields());
        api.setAuthType(p.getAuthType());
        api.setAuthConfig(p.getAuthConfig());
        api.setTimeoutMs(p.getTimeoutMs());
        api.setCacheStrategy(p.getCacheStrategy());
        api.setCacheTtlSeconds(p.getCacheTtlSeconds());
    }
}
