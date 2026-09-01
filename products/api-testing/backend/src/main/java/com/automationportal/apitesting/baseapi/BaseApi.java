package com.automationportal.apitesting.baseapi;

import com.automationportal.apitesting.common.EncryptedStringConverter;
import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Data
@Entity
@Table(name = "BASE_API_MASTER")
public class BaseApi {

    public enum CacheStrategy { PER_CALL, CACHED_TTL, SCHEDULED_REFRESH }

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

    @Column(nullable = false, length = 2048)
    private String url;

    /** JSON array of {key,value,enabled}. */
    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String headers;

    @Column(name = "body_type", length = 20)
    private String bodyType;

    @Column(columnDefinition = "TEXT")
    private String body;

    /** JSON array of FormDataItem — only used when bodyType=FORM_DATA. File rows carry a
     * fileId reference (FormDataFileStore), never raw bytes. */
    @Lob
    @Column(name = "form_data", columnDefinition = "LONGTEXT")
    private String formData;

    /** JSON array of {key,value,enabled,required} — JSON body field names flagged Required by
     * business logic. Same shape as headers; only meaningful when bodyType=JSON. */
    @Lob
    @Column(name = "required_payload_fields", columnDefinition = "LONGTEXT")
    private String requiredPayloadFields;

    @Column(name = "auth_type", length = 20)
    private String authType;

    /** Full AuthConfig JSON, encrypted at rest. */
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "auth_config", columnDefinition = "LONGTEXT")
    private String authConfig;

    @Column(name = "timeout_ms", nullable = false)
    private int timeoutMs = 15000;

    @Enumerated(EnumType.STRING)
    @Column(name = "cache_strategy", nullable = false, length = 20)
    private CacheStrategy cacheStrategy = CacheStrategy.PER_CALL;

    @Column(name = "cache_ttl_seconds")
    private Integer cacheTtlSeconds;

    @Column(name = "last_executed_at")
    private Instant lastExecutedAt;

    @Lob
    @Column(name = "last_response_snapshot", columnDefinition = "LONGTEXT")
    private String lastResponseSnapshot;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;
}
