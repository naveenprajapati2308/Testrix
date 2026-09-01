package com.automationportal.apitesting.regularapi;

import com.automationportal.apitesting.common.RequestConfigMapper;
import com.automationportal.apitesting.execution.dto.ExecutionRequest;
import com.automationportal.apitesting.execution.dto.FormDataItem;
import com.automationportal.apitesting.execution.dto.KeyValueItem;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns a persisted {@link RegularApi} template into an {@link ExecutionRequest}
 * and substitutes {{placeholder}} variables into it. Shared by
 * {@link DependencyExecutionService} (normal binding-driven execution) and any
 * service that needs to run the same stored template with its own ad-hoc
 * variables (e.g. {@link KhasraPickerService} looping over candidate values).
 */
@Component
@RequiredArgsConstructor
public class RegularApiRequestBuilder {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*([a-zA-Z0-9_.-]+)\\s*}}");

    private final RequestConfigMapper configMapper;

    public ExecutionRequest build(RegularApi api) {
        ExecutionRequest req = new ExecutionRequest();
        req.setMethod(api.getMethod());
        req.setUrl(api.getUrlTemplate());
        req.setHeaders(configMapper.keyValues(api.getHeadersTemplate()));
        req.setQueryParams(configMapper.keyValues(api.getQueryParamsTemplate()));
        req.setBodyType(parseBodyType(api.getBodyType()));
        req.setBody(api.getBodyTemplate());
        req.setFormData(configMapper.formDataItems(api.getFormDataTemplate()));
        req.setRequiredPayloadFields(configMapper.keyValues(api.getRequiredPayloadFieldsTemplate()));
        req.setAuth(configMapper.auth(api.getAuthConfig()));
        req.setTimeoutMs(api.getTimeoutMs());
        req.setFollowRedirects(api.isFollowRedirects());
        req.setVerifySsl(api.isVerifySsl());
        return req;
    }

    public void substitute(ExecutionRequest req, Map<String, String> variables) {
        req.setUrl(substitute(req.getUrl(), variables));
        req.setBody(substitute(req.getBody(), variables));
        for (KeyValueItem h : req.getHeaders()) {
            h.setKey(substitute(h.getKey(), variables));
            h.setValue(substitute(h.getValue(), variables));
        }
        for (KeyValueItem q : req.getQueryParams()) {
            q.setKey(substitute(q.getKey(), variables));
            q.setValue(substitute(q.getValue(), variables));
        }
        for (FormDataItem f : req.getFormData()) {
            f.setKey(substitute(f.getKey(), variables));
            if (f.getType() == FormDataItem.Type.TEXT) {
                f.setValue(substitute(f.getValue(), variables));
            }
        }
        var auth = req.getAuth();
        if (auth != null) {
            auth.setToken(substitute(auth.getToken(), variables));
            auth.setUsername(substitute(auth.getUsername(), variables));
            auth.setPassword(substitute(auth.getPassword(), variables));
            auth.setKeyValue(substitute(auth.getKeyValue(), variables));
        }
    }

    public String firstUnresolvedPlaceholder(ExecutionRequest req) {
        for (String s : collectTemplates(req)) {
            if (s == null) continue;
            Matcher m = PLACEHOLDER.matcher(s);
            if (m.find()) return m.group(1);
        }
        return null;
    }

    private java.util.List<String> collectTemplates(ExecutionRequest req) {
        java.util.List<String> all = new java.util.ArrayList<>();
        all.add(req.getUrl());
        all.add(req.getBody());
        req.getHeaders().forEach(h -> { all.add(h.getKey()); all.add(h.getValue()); });
        req.getQueryParams().forEach(q -> { all.add(q.getKey()); all.add(q.getValue()); });
        if (req.getAuth() != null) {
            all.add(req.getAuth().getToken());
            all.add(req.getAuth().getUsername());
            all.add(req.getAuth().getPassword());
            all.add(req.getAuth().getKeyValue());
        }
        return all;
    }

    private String substitute(String template, Map<String, String> variables) {
        if (template == null || template.isEmpty()) return template;
        Matcher m = PLACEHOLDER.matcher(template);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String name = m.group(1);
            String replacement = variables.get(name);
            m.appendReplacement(sb, Matcher.quoteReplacement(replacement != null ? replacement : m.group(0)));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private ExecutionRequest.BodyType parseBodyType(String s) {
        if (s == null || s.isBlank()) return ExecutionRequest.BodyType.NONE;
        try {
            return ExecutionRequest.BodyType.valueOf(s);
        } catch (IllegalArgumentException e) {
            return ExecutionRequest.BodyType.NONE;
        }
    }
}
