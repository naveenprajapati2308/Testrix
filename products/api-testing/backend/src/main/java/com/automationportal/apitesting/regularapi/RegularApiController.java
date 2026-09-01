package com.automationportal.apitesting.regularapi;

import com.automationportal.apitesting.baseapi.ApiVariableBinding;
import com.automationportal.apitesting.baseapi.ApiVariableBindingRepository;
import com.automationportal.apitesting.baseapi.BaseApiRepository;
import com.automationportal.apitesting.common.RequestConfigMapper;
import com.automationportal.apitesting.history.ExecutionHistory;
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
@RequestMapping("/api/v1/regular-apis")
@RequiredArgsConstructor
public class RegularApiController {

    private final RegularApiRepository repository;
    private final ApiVariableBindingRepository bindingRepository;
    private final BaseApiRepository baseApiRepository;
    private final DependencyExecutionService dependencyExecutionService;
    private final com.automationportal.apitesting.audit.AuditService auditService;
    private final com.automationportal.apitesting.collections.ApiCollectionRepository collectionRepository;
    private final com.automationportal.apitesting.collections.CollectionRequestRepository collectionRequestRepository;
    private final RequestConfigMapper configMapper;
    private final CurrentProjectService currentProjectService;
    private final ApiModuleRepository moduleRepository;
    private final com.automationportal.apitesting.validation.BusinessValidationService businessValidationService;
    private final com.automationportal.apitesting.security.CurrentUserService currentUserService;

    @Data
    public static class RegularApiPayload {
        @NotBlank private String name;
        @NotBlank private String method;
        @NotBlank private String urlTemplate;
        private Long moduleId;
        private String headersTemplate;
        private String queryParamsTemplate;
        private String bodyType;
        private String bodyTemplate;
        private String formDataTemplate;   // JSON array of FormDataItem, only used when bodyType=FORM_DATA
        private String requiredPayloadFieldsTemplate;  // JSON array of {key,value,enabled,required}, only used when bodyType=JSON
        private String authType;
        private String authConfig;
        private boolean dynamic;
        private int timeoutMs = 15000;
        private boolean followRedirects = true;
        private boolean verifySsl = true;
    }

    @Data
    public static class BindingPayload {
        private Long baseApiId;
        private Long sourceRegularApiId;
        @NotBlank private String sourceJsonPath;
        @NotBlank private String variableName;
    }

    @GetMapping
    public List<RegularApi> list(@RequestParam(required = false) Long moduleId) {
        Long projectId = currentProjectService.requireProjectId();
        return moduleId == null
                ? repository.findByProjectId(projectId)
                : repository.findByProjectIdAndModuleId(projectId, moduleId);
    }

    @GetMapping("/{id}")
    public RegularApi get(@PathVariable Long id) {
        return find(id);
    }

    @PostMapping
    public RegularApi create(@Valid @RequestBody RegularApiPayload payload) {
        RegularApi api = new RegularApi();
        apply(api, payload);
        api.setProjectId(currentProjectService.requireProjectId());
        validateModule(api.getModuleId(), api.getProjectId());
        api = repository.save(api);
        audit(api.getId(), com.automationportal.apitesting.audit.AuditLog.Action.CREATE,
                "Created regular API '" + api.getName() + "'");
        return api;
    }

    @PutMapping("/{id}")
    public RegularApi update(@PathVariable Long id, @Valid @RequestBody RegularApiPayload payload) {
        RegularApi api = find(id);
        apply(api, payload);
        validateModule(api.getModuleId(), api.getProjectId());
        api = repository.save(api);
        audit(id, com.automationportal.apitesting.audit.AuditLog.Action.UPDATE,
                "Updated regular API '" + api.getName() + "'");
        return api;
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        RegularApi api = find(id);
        audit(id, com.automationportal.apitesting.audit.AuditLog.Action.DELETE,
                "Deleted regular API '" + api.getName() + "'");
        repository.deleteById(id);
    }

    /** Resolves dependencies, executes, auto-runs validation, records history. */
    @PostMapping("/{id}/execute")
    public DependencyExecutionService.RegularExecutionResult execute(@PathVariable Long id) {
        return dependencyExecutionService.execute(find(id), ExecutionHistory.TriggeredBy.MANUAL, null);
    }

    /**
     * On-demand only — never scheduled. Resolves this API's dependencies into a real,
     * otherwise-valid request, strips every field flagged Required, runs that variant
     * once, and records which of those fields the backend actually complained about.
     */
    @PostMapping("/{id}/validation-check")
    public com.automationportal.apitesting.validation.ValidationCheckResult runValidationCheck(@PathVariable Long id) {
        RegularApi api = find(id);
        try {
            var request = dependencyExecutionService.resolveRequest(api);
            return businessValidationService.check(request, api.getProjectId(),
                    com.automationportal.apitesting.validation.BusinessValidationRun.ApiType.REGULAR, id,
                    currentUserService.currentEmail());
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    @GetMapping("/{id}/validation-checks")
    public java.util.List<com.automationportal.apitesting.validation.ValidationCheckResult> validationCheckHistory(@PathVariable Long id) {
        RegularApi api = find(id);
        return businessValidationService.history(api.getProjectId(),
                com.automationportal.apitesting.validation.BusinessValidationRun.ApiType.REGULAR, id);
    }

    /** Copies this Regular API into a tester collection as a runnable request (mirrors Base API's convenience endpoint). */
    @PostMapping("/{id}/add-to-collection/{collectionId}")
    public com.automationportal.apitesting.collections.CollectionRequest addToCollection(
            @PathVariable Long id, @PathVariable Long collectionId) {
        RegularApi api = find(id);
        var collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Collection not found"));
        if (!currentProjectService.requireProjectId().equals(collection.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Collection not found");
        }

        java.util.Map<String, Object> config = new java.util.LinkedHashMap<>();
        config.put("method", api.getMethod());
        config.put("url", api.getUrlTemplate());
        config.put("queryParams", configMapper.keyValues(api.getQueryParamsTemplate()));
        config.put("headers", configMapper.keyValues(api.getHeadersTemplate()));
        config.put("bodyType", api.getBodyType() == null || api.getBodyType().isBlank() ? "NONE" : api.getBodyType());
        config.put("body", api.getBodyTemplate() == null ? "" : api.getBodyTemplate());
        config.put("requiredPayloadFields", configMapper.keyValues(api.getRequiredPayloadFieldsTemplate()));
        config.put("auth", configMapper.auth(api.getAuthConfig()));
        config.put("timeoutMs", api.getTimeoutMs());
        config.put("followRedirects", api.isFollowRedirects());
        config.put("verifySsl", api.isVerifySsl());

        var request = new com.automationportal.apitesting.collections.CollectionRequest();
        request.setCollectionId(collectionId);
        request.setName("[Regular] " + api.getName());
        request.setSeq((int) collectionRequestRepository.countByCollectionId(collectionId));
        request.setMethod(api.getMethod());
        request.setUrl(api.getUrlTemplate());
        request.setConfigJson(configMapper.toJson(config));
        request = collectionRequestRepository.save(request);
        audit(id, com.automationportal.apitesting.audit.AuditLog.Action.UPDATE,
                "Added regular API '" + api.getName() + "' to collection #" + collectionId);
        return request;
    }

    @GetMapping("/{id}/bindings")
    public List<ApiVariableBinding> bindings(@PathVariable Long id) {
        find(id);
        return bindingRepository.findByRegularApiId(id);
    }

    /** Bind a variable into this regular API, sourced from either a Base API or another Regular API. */
    @PostMapping("/{id}/bindings")
    public ApiVariableBinding addBinding(@PathVariable Long id, @Valid @RequestBody BindingPayload payload) {
        find(id);
        Long projectId = currentProjectService.requireProjectId();
        boolean hasBase = payload.getBaseApiId() != null;
        boolean hasRegular = payload.getSourceRegularApiId() != null;
        if (hasBase == hasRegular) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Provide exactly one source: baseApiId or sourceRegularApiId");
        }
        if (hasRegular && payload.getSourceRegularApiId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A regular API cannot bind to itself");
        }
        // A binding's source must belong to the same project — otherwise this Regular API's
        // execution would reach into (and actually invoke) another project's Base/Regular API.
        if (hasBase) {
            boolean owned = baseApiRepository.findById(payload.getBaseApiId())
                    .map(a -> projectId.equals(a.getProjectId())).orElse(false);
            if (!owned) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Base API does not exist");
            }
        } else {
            boolean owned = repository.findById(payload.getSourceRegularApiId())
                    .map(a -> projectId.equals(a.getProjectId())).orElse(false);
            if (!owned) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Regular API does not exist");
            }
        }
        ApiVariableBinding b = new ApiVariableBinding();
        b.setRegularApiId(id);
        b.setBaseApiId(payload.getBaseApiId());
        b.setSourceRegularApiId(payload.getSourceRegularApiId());
        b.setSourceJsonPath(payload.getSourceJsonPath());
        b.setVariableName(payload.getVariableName());
        try {
            b = bindingRepository.save(b);
            String sourceDescription = hasBase
                    ? "base API #" + payload.getBaseApiId()
                    : "regular API #" + payload.getSourceRegularApiId();
            auditService.record(currentProjectService.requireProjectId(),
                    com.automationportal.apitesting.audit.AuditLog.EntityType.BINDING, b.getId(),
                    com.automationportal.apitesting.audit.AuditLog.Action.CREATE,
                    "Bound {{" + payload.getVariableName() + "}} from " + sourceDescription
                            + " into regular API #" + id);
            return b;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Variable '" + payload.getVariableName() + "' is already bound for this API");
        }
    }

    @DeleteMapping("/{id}/bindings/{bindingId}")
    public void deleteBinding(@PathVariable Long id, @PathVariable Long bindingId) {
        find(id);
        ApiVariableBinding b = bindingRepository.findById(bindingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Binding not found"));
        if (b.getRegularApiId() == null || !b.getRegularApiId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Binding does not belong to this API");
        }
        bindingRepository.delete(b);
        auditService.record(currentProjectService.requireProjectId(),
                com.automationportal.apitesting.audit.AuditLog.EntityType.BINDING, bindingId,
                com.automationportal.apitesting.audit.AuditLog.Action.DELETE,
                "Removed binding {{" + b.getVariableName() + "}} from regular API #" + id);
    }

    private void validateModule(Long moduleId, Long projectId) {
        if (moduleId == null) return;
        boolean owned = moduleRepository.findById(moduleId).map(m -> projectId.equals(m.getProjectId())).orElse(false);
        if (!owned) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Module does not exist");
        }
    }

    private RegularApi find(Long id) {
        RegularApi api = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Regular API not found"));
        if (!currentProjectService.requireProjectId().equals(api.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Regular API not found");
        }
        return api;
    }

    private void audit(Long id, com.automationportal.apitesting.audit.AuditLog.Action action, String details) {
        auditService.record(currentProjectService.requireProjectId(),
                com.automationportal.apitesting.audit.AuditLog.EntityType.REGULAR_API, id, action, details);
    }

    private void apply(RegularApi api, RegularApiPayload p) {
        api.setName(p.getName());
        api.setMethod(p.getMethod().toUpperCase());
        api.setUrlTemplate(p.getUrlTemplate());
        api.setModuleId(p.getModuleId());
        api.setHeadersTemplate(p.getHeadersTemplate());
        api.setQueryParamsTemplate(p.getQueryParamsTemplate());
        api.setBodyType(p.getBodyType());
        api.setBodyTemplate(p.getBodyTemplate());
        api.setFormDataTemplate(p.getFormDataTemplate());
        api.setRequiredPayloadFieldsTemplate(p.getRequiredPayloadFieldsTemplate());
        api.setAuthType(p.getAuthType());
        api.setAuthConfig(p.getAuthConfig());
        api.setDynamic(p.isDynamic());
        api.setTimeoutMs(p.getTimeoutMs());
        api.setFollowRedirects(p.isFollowRedirects());
        api.setVerifySsl(p.isVerifySsl());
    }
}
