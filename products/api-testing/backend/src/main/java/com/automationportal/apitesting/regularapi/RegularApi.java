package com.automationportal.apitesting.regularapi;

import com.automationportal.apitesting.common.EncryptedStringConverter;
import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Data
@Entity
@Table(name = "API_MASTER")
public class RegularApi {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "module_id")
    private Long moduleId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(nullable = false, length = 10)
    private String method;

    /** May contain {{variableName}} placeholders. */
    @Column(name = "url_template", nullable = false, length = 2048)
    private String urlTemplate;

    /** JSON array of {key,value,enabled}; values may contain {{variableName}}. */
    @Lob
    @Column(name = "headers_template", columnDefinition = "LONGTEXT")
    private String headersTemplate;

    @Lob
    @Column(name = "query_params_template", columnDefinition = "LONGTEXT")
    private String queryParamsTemplate;

    @Column(name = "body_type", length = 20)
    private String bodyType;

    @Column(name = "body_template", columnDefinition = "TEXT")
    private String bodyTemplate;

    /** JSON array of FormDataItem — only used when bodyType=FORM_DATA. File rows carry a
     * fileId reference (FormDataFileStore), never raw bytes. */
    @Lob
    @Column(name = "form_data_template", columnDefinition = "LONGTEXT")
    private String formDataTemplate;

    /** JSON array of {key,value,enabled,required} — JSON body field names flagged Required by
     * business logic. Same shape as headersTemplate; only meaningful when bodyType=JSON. */
    @Lob
    @Column(name = "required_payload_fields_template", columnDefinition = "LONGTEXT")
    private String requiredPayloadFieldsTemplate;

    @Column(name = "auth_type", length = 20)
    private String authType;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "auth_config", columnDefinition = "LONGTEXT")
    private String authConfig;

    @Column(name = "is_dynamic", nullable = false)
    private boolean isDynamic;

    /** Names a dedicated server-side resolver (e.g. "KHASRA_PICKER") that runs
     * alongside normal variable bindings to supply values plain bindings can't
     * express (multi-step lookups, retry-until-valid logic). Null for every
     * ordinary API. */
    @Column(name = "special_resolver", length = 30)
    private String specialResolver;

    @Column(name = "timeout_ms", nullable = false)
    private int timeoutMs = 15000;

    @Column(name = "follow_redirects", nullable = false)
    private boolean followRedirects = true;

    @Column(name = "verify_ssl", nullable = false)
    private boolean verifySsl = true;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;
}
