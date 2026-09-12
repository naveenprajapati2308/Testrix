package com.automationportal.apitesting.execution;

import com.automationportal.apitesting.execution.dto.AuthConfig;
import com.automationportal.apitesting.execution.dto.ExecutionRequest;
import com.automationportal.apitesting.execution.dto.ExecutionResponse;
import com.automationportal.apitesting.execution.dto.FormDataItem;
import com.automationportal.apitesting.execution.dto.KeyValueItem;
import com.automationportal.apitesting.formdata.FormDataFileStore;
import io.netty.handler.ssl.SslContextBuilder;
import io.netty.handler.ssl.util.InsecureTrustManagerFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;
import reactor.netty.http.client.HttpClient;
import reactor.netty.resources.ConnectionProvider;

import javax.net.ssl.SSLException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Executes user-built HTTP requests server-side, exactly like curl or Python
 * requests would: no browser, therefore no CORS. This is the architectural
 * heart of the platform.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ExecutionEngineService {

    /** Hard ceiling so one request can never pin a worker thread indefinitely. */
    private static final long MAX_TIMEOUT_MS = 120_000;
    private static final long MIN_TIMEOUT_MS = 100;

    private final FormDataFileStore formDataFileStore;
    private final ExecutionEngineProperties properties;

    /** How many times a single connect-level failure gets retried before giving up. */
    private static final int MAX_CONNECT_RETRIES = 3;

    public ExecutionResponse execute(ExecutionRequest request) {
        request.setTimeoutMs(Math.max(MIN_TIMEOUT_MS, Math.min(request.getTimeoutMs(), MAX_TIMEOUT_MS)));

        // Scheme guard: this platform executes arbitrary user URLs by design
        // (its core feature), but only over HTTP(S). Reject file://, gopher://,
        // ftp:// etc. so a request config can never read local files or reach
        // non-HTTP internal services.
        String schemeError = validateScheme(request.getUrl());
        if (schemeError != null) {
            return ExecutionResponse.builder()
                    .success(false).errorMessage(schemeError).durationMs(0).build();
        }

        // Some remote hosts intermittently fail a fresh TCP/TLS connection
        // attempt outright (reactor-netty reports it as "finishConnect(..)
        // failed: Connection refused", indistinguishable from the target
        // being down) even though the target is demonstrably reachable and
        // fast a moment later — confirmed live against godavari.mp.gov.in
        // 2026-08-21: plain curl to the identical URL at the identical moment
        // consistently succeeds in under 3s. Root cause not fully isolated;
        // retrying a genuinely fresh connection a few times is a pragmatic,
        // low-risk mitigation until it is.
        ExecutionResponse response = null;
        for (int attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
            response = attemptOnce(request);
            if (response.isSuccess() || !isTransientConnectFailure(response)) {
                break;
            }
            log.warn("Transient connect failure on attempt {}/{} for {} {}: {} — retrying",
                    attempt, MAX_CONNECT_RETRIES, request.getMethod(), request.getUrl(), response.getErrorMessage());
        }
        return curlRescueIfNeeded(request, response);
    }

    /**
     * Last resort for a target that WebClient specifically cannot satisfy. Every
     * project points API Testing at a different server, and some of them decide what
     * to serve based on the client's fingerprint rather than the request — that is
     * exactly how godavari.mp.gov.in behaved (429 for WebClient, 200 for curl from
     * the same container, same moment). Rather than require someone to notice that
     * and hand-maintain a host list, a request that fails in one of those two
     * fingerprint-shaped ways is retried once through curl, and the host is logged so
     * it can be added to {@code curl-hosts} and skip the wasted first attempt later.
     */
    private ExecutionResponse curlRescueIfNeeded(ExecutionRequest request, ExecutionResponse response) {
        if (response == null || requiresCurl(request)) return response;
        boolean fingerprintShaped = isTransientConnectFailure(response)
                || (response.isSuccess() && response.getStatusCode() != null && response.getStatusCode() == 429);
        if (!fingerprintShaped) return response;

        log.warn("{} {} failed via WebClient ({}) — retrying once via curl. Add '{}' to "
                        + "apitesting.execution.curl-hosts to skip this first attempt in future.",
                request.getMethod(), request.getUrl(),
                response.getStatusCode() != null ? "HTTP " + response.getStatusCode() : response.getErrorMessage(),
                hostOf(request.getUrl()));
        ExecutionResponse viaCurl = attemptOnceViaCurl(request);
        boolean better = viaCurl.isSuccess()
                && (viaCurl.getStatusCode() == null || viaCurl.getStatusCode() != 429);
        return better ? viaCurl : response;
    }

    private boolean isTransientConnectFailure(ExecutionResponse response) {
        String msg = response.getErrorMessage();
        return msg != null && (msg.contains("finishConnect") || msg.contains("Connection refused"));
    }

    private ExecutionResponse attemptOnce(ExecutionRequest request) {
        return requiresCurl(request) ? attemptOnceViaCurl(request) : attemptOnceViaWebClient(request);
    }

    /**
     * curl is the exception, not the default. Two cases genuinely need it, both
     * found live on 2026-08-21:
     * <ul>
     *   <li>Hosts that rate-limit (429) by client fingerprint — godavari.mp.gov.in
     *       let curl through while rejecting WebClient from the same container at
     *       the same moment. Listed in {@code apitesting.execution.curl-hosts}.</li>
     *   <li>Requests carrying an actual file upload, which hung on WebClient's
     *       multipart writer until the request timed out.</li>
     * </ul>
     * Everything else uses WebClient, because a process per request cannot scale to
     * scheduler-level concurrency, and the curl path also cannot report response
     * headers or TTFB (it only captures http_code and content_type via {@code -w}).
     */
    private boolean requiresCurl(ExecutionRequest request) {
        if (hasFileField(request)) return true;
        List<String> curlHosts = properties.getCurlHosts();
        if (curlHosts.contains("*")) return true;
        String host = hostOf(request.getUrl());
        if (host == null) return false;
        return curlHosts.stream()
                .map(h -> h.trim().toLowerCase())
                .filter(h -> !h.isEmpty())
                .anyMatch(h -> host.equals(h) || host.endsWith("." + h));
    }

    private String hostOf(String url) {
        try {
            String host = java.net.URI.create(url.trim()).getHost();
            return host == null ? null : host.toLowerCase();
        } catch (Exception ex) {
            return null;
        }
    }

    private boolean hasFileField(ExecutionRequest request) {
        return request.getFormData() != null && request.getFormData().stream()
                .anyMatch(f -> f.isEnabled() && f.getType() == FormDataItem.Type.FILE);
    }

    private ExecutionResponse attemptOnceViaWebClient(ExecutionRequest request) {
        long start = System.currentTimeMillis();
        // Time-to-first-byte: captured when response headers arrive, before the
        // body is read. Best-effort per spec; finer DNS/connect splits are not
        // exposed by WebClient without per-request Netty instrumentation.
        java.util.concurrent.atomic.AtomicLong ttfbAt = new java.util.concurrent.atomic.AtomicLong(-1);
        try {
            WebClient client = buildClient(request);
            String finalUrl = buildUrl(request);

            WebClient.RequestBodySpec spec = client
                    .method(HttpMethod.valueOf(request.getMethod().toUpperCase()))
                    .uri(finalUrl)
                    .headers(h -> applyHeaders(h, request));

            if (request.getBodyType() == ExecutionRequest.BodyType.FORM_DATA) {
                if (hasFormData(request)) {
                    String boundary = "TestrixBoundary" + UUID.randomUUID().toString().replace("-", "");
                    spec.header(HttpHeaders.CONTENT_TYPE, "multipart/form-data; boundary=" + boundary);
                    spec.bodyValue(buildMultipartBody(request, boundary));
                }
            } else if (hasBody(request)) {
                spec.contentType(resolveContentType(request));
                spec.bodyValue(request.getBody());
            }

            ResponseEntity<byte[]> entity = spec
                    .exchangeToMono(resp -> {
                        ttfbAt.set(System.currentTimeMillis());
                        return resp.toEntity(byte[].class);
                    })
                    .block(Duration.ofMillis(request.getTimeoutMs() + 5_000));

            long duration = System.currentTimeMillis() - start;
            byte[] bodyBytes = entity.getBody() == null ? new byte[0] : entity.getBody();

            Map<String, List<String>> headers = new LinkedHashMap<>();
            entity.getHeaders().forEach(headers::put);

            return ExecutionResponse.builder()
                    .success(true)
                    .statusCode(entity.getStatusCode().value())
                    .statusText(statusText(entity.getStatusCode().value()))
                    .headers(headers)
                    .contentType(entity.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE))
                    .body(new String(bodyBytes, StandardCharsets.UTF_8))
                    .durationMs(duration)
                    .ttfbMs(ttfbAt.get() > 0 ? ttfbAt.get() - start : null)
                    .sizeBytes(bodyBytes.length)
                    .build();

        } catch (Exception ex) {
            long duration = System.currentTimeMillis() - start;
            String msg = rootMessage(ex);
            boolean timedOut = ex instanceof io.netty.handler.timeout.ReadTimeoutException
                    || (msg != null && msg.toLowerCase().contains("timeout"));
            log.warn("Execution failed for {} {}: {}", request.getMethod(), request.getUrl(), msg);
            return ExecutionResponse.builder()
                    .success(false)
                    .errorMessage(msg)
                    .durationMs(duration)
                    .timedOut(timedOut)
                    .build();
        }
    }

    private static final String CURL_META_MARKER = "__TESTRIX_CURL_META__";

    /**
     * Parses curl's {@code -D} header dump. With {@code -L} the file holds one
     * block per hop, so only the last block (the final response) is kept —
     * matching what the WebClient path reports.
     */
    private Map<String, List<String>> parseHeaderDump(java.nio.file.Path dump) {
        Map<String, List<String>> headers = new LinkedHashMap<>();
        try {
            for (String line : java.nio.file.Files.readAllLines(dump, StandardCharsets.UTF_8)) {
                String trimmed = line.strip();
                if (trimmed.isEmpty()) continue;
                if (trimmed.regionMatches(true, 0, "HTTP/", 0, 5)) {
                    headers.clear(); // a new status line means a new hop — discard the previous one
                    continue;
                }
                int colon = trimmed.indexOf(':');
                if (colon <= 0) continue;
                headers.computeIfAbsent(trimmed.substring(0, colon).strip(), k -> new java.util.ArrayList<>())
                        .add(trimmed.substring(colon + 1).strip());
            }
        } catch (Exception ex) {
            log.warn("Could not read curl header dump: {}", ex.getMessage());
        }
        return headers;
    }

    private ExecutionResponse attemptOnceViaCurl(ExecutionRequest request) {
        long start = System.currentTimeMillis();
        List<java.nio.file.Path> tempFiles = new java.util.ArrayList<>();
        try {
            List<String> argv = new java.util.ArrayList<>();
            argv.add("curl");
            argv.add("-s"); // silent — no progress meter mixed into stdout
            argv.add("-S"); // still show real errors on stderr
            argv.add("-X");
            argv.add(request.getMethod().toUpperCase());
            long timeoutSeconds = Math.max(1, (request.getTimeoutMs() + 5_000) / 1000);
            argv.add("--max-time");
            argv.add(String.valueOf(timeoutSeconds));
            if (!request.isVerifySsl()) argv.add("-k");
            if (request.isFollowRedirects()) argv.add("-L");

            // Response headers go to their own file rather than into stdout (-i),
            // which would otherwise have to be separated from the body by hand and
            // would corrupt binary responses. Without this the curl path reports no
            // response headers at all, unlike the WebClient path.
            java.nio.file.Path headerDump = java.nio.file.Files.createTempFile("testrix-curl-hdr-", ".txt");
            tempFiles.add(headerDump);
            argv.add("-D");
            argv.add(headerDump.toString());

            HttpHeaders scratch = new HttpHeaders();
            applyHeaders(scratch, request);
            scratch.forEach((name, values) -> values.forEach(v -> {
                argv.add("-H");
                argv.add(name + ": " + v);
            }));

            if (request.getBodyType() == ExecutionRequest.BodyType.FORM_DATA) {
                for (FormDataItem item : request.getFormData()) {
                    if (!item.isEnabled() || item.getKey() == null || item.getKey().isBlank()) continue;
                    argv.add("-F");
                    if (item.getType() == FormDataItem.Type.FILE) {
                        if (item.getFileId() == null || item.getFileId().isBlank()) {
                            throw new IllegalArgumentException(
                                    "File field '" + item.getKey() + "' has no file attached — attach a file and try again.");
                        }
                        byte[] bytes = formDataFileStore.load(item.getFileId());
                        if (bytes == null) {
                            throw new IllegalArgumentException(
                                    "File field '" + item.getKey() + "' — the attached file could not be found, re-attach it and try again.");
                        }
                        String filename = item.getFileName() != null ? item.getFileName() : item.getKey();
                        java.nio.file.Path tmp = java.nio.file.Files.createTempFile("testrix-upload-", "-" + sanitizeFilename(filename));
                        java.nio.file.Files.write(tmp, bytes);
                        tempFiles.add(tmp);
                        argv.add(item.getKey() + "=@" + tmp + ";type=" + guessContentType(filename) + ";filename=" + filename);
                    } else {
                        argv.add(item.getKey() + "=" + (item.getValue() == null ? "" : item.getValue()));
                    }
                }
            } else if (hasBody(request)) {
                argv.add("-H");
                argv.add("Content-Type: " + resolveContentType(request).toString());
                argv.add("--data-raw");
                argv.add(request.getBody());
            }

            argv.add("-w");
            // time_starttransfer is curl's time-to-first-byte, in fractional seconds —
            // without it the curl path reports no TTFB at all, unlike WebClient.
            argv.add("\n" + CURL_META_MARKER + "%{http_code}|%{content_type}|%{time_starttransfer}\n");
            argv.add(buildUrl(request));

            ProcessBuilder pb = new ProcessBuilder(argv);
            pb.redirectErrorStream(false);
            Process process = pb.start();
            String stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            String stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = process.waitFor(timeoutSeconds + 5, java.util.concurrent.TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new IllegalStateException("curl process did not exit within " + (timeoutSeconds + 5) + "s");
            }
            int exitCode = process.exitValue();
            long duration = System.currentTimeMillis() - start;

            int markerAt = stdout.lastIndexOf(CURL_META_MARKER);
            if (exitCode != 0 || markerAt < 0) {
                String reason = !stderr.isBlank() ? stderr.trim() : ("curl exited " + exitCode);
                return ExecutionResponse.builder().success(false).errorMessage(reason).durationMs(duration).build();
            }

            String body = stdout.substring(0, markerAt);
            if (body.endsWith("\n")) body = body.substring(0, body.length() - 1);
            String meta = stdout.substring(markerAt + CURL_META_MARKER.length()).trim();
            String[] parts = meta.split("\\|", -1);
            int statusCode = parts.length > 0 && !parts[0].isBlank() ? Integer.parseInt(parts[0]) : 0;
            String contentType = parts.length > 1 ? parts[1] : null;
            Long ttfbMs = null;
            if (parts.length > 2 && !parts[2].isBlank()) {
                try {
                    ttfbMs = Math.round(Double.parseDouble(parts[2].trim()) * 1000);
                } catch (NumberFormatException ignored) {
                    // curl builds that don't support the variable emit it literally; no TTFB then.
                }
            }

            return ExecutionResponse.builder()
                    .success(true)
                    .statusCode(statusCode)
                    .statusText(statusText(statusCode))
                    .headers(parseHeaderDump(headerDump))
                    .contentType(contentType != null && !contentType.isBlank() ? contentType : null)
                    .body(body)
                    .durationMs(duration)
                    .ttfbMs(ttfbMs)
                    .sizeBytes(body.getBytes(StandardCharsets.UTF_8).length)
                    .build();

        } catch (Exception ex) {
            long duration = System.currentTimeMillis() - start;
            String msg = rootMessage(ex);
            log.warn("curl execution failed for {} {}: {}", request.getMethod(), request.getUrl(), msg);
            return ExecutionResponse.builder().success(false).errorMessage(msg).durationMs(duration).build();
        } finally {
            for (java.nio.file.Path tmp : tempFiles) {
                try {
                    java.nio.file.Files.deleteIfExists(tmp);
                } catch (Exception ignored) {
                    // best effort cleanup
                }
            }
        }
    }

    private String sanitizeFilename(String filename) {
        return filename.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    /**
     * A fresh, never-pooled connection per call. This engine hits a different
     * external host on effectively every request (that's the product), so
     * Netty's default shared connection pool buys little reuse benefit but
     * costs real reliability: a remote server that closes its end of an
     * idle keep-alive connection before our pool notices leaves the next
     * request writing to a dead socket, which reactor-netty reports as
     * "finishConnect(..) failed: Connection refused" only after the full
     * response timeout elapses — indistinguishable from the target actually
     * being down. A plain curl to the same URL at the same moment succeeds in
     * under 2s, proving it's pooled-connection staleness here, not the
     * network — confirmed live against godavari.mp.gov.in on 2026-08-21.
     */
    private static final ConnectionProvider NO_POOL = ConnectionProvider.newConnection();

    /**
     * Pooled provider replacing per-request connections for everything except an
     * explicit opt-out. The staleness problem described above is real, but the fix
     * for it is evicting our own idle connections before the server drops them
     * (maxIdleTime/maxLifeTime + background eviction), not giving up reuse — which
     * cost a full TCP+TLS handshake on every single request.
     */
    private ConnectionProvider pooledProvider;

    @jakarta.annotation.PostConstruct
    void initConnectionProvider() {
        ExecutionEngineProperties.Pool cfg = properties.getPool();
        if (!cfg.isEnabled()) {
            log.info("Execution connection pooling disabled — using a fresh connection per request");
            return;
        }
        pooledProvider = ConnectionProvider.builder("api-testing-exec")
                .maxConnections(cfg.getMaxConnections())
                .maxIdleTime(Duration.ofSeconds(cfg.getMaxIdleSeconds()))
                .maxLifeTime(Duration.ofSeconds(cfg.getMaxLifeSeconds()))
                .evictInBackground(Duration.ofSeconds(cfg.getEvictIntervalSeconds()))
                .pendingAcquireTimeout(Duration.ofSeconds(cfg.getPendingAcquireTimeoutSeconds()))
                .build();
        log.info("Execution connection pool ready: maxConnections={} maxIdle={}s maxLife={}s; curl-only hosts={}",
                cfg.getMaxConnections(), cfg.getMaxIdleSeconds(), cfg.getMaxLifeSeconds(), properties.getCurlHosts());
    }

    @jakarta.annotation.PreDestroy
    void disposeConnectionProvider() {
        if (pooledProvider != null) pooledProvider.dispose();
    }

    private WebClient buildClient(ExecutionRequest request) throws SSLException {
        HttpClient httpClient = HttpClient.create(pooledProvider != null ? pooledProvider : NO_POOL)
                .responseTimeout(Duration.ofMillis(request.getTimeoutMs()))
                .followRedirect(request.isFollowRedirects());

        if (!request.isVerifySsl()) {
            var sslContext = SslContextBuilder.forClient()
                    .trustManager(InsecureTrustManagerFactory.INSTANCE)
                    .build();
            httpClient = httpClient.secure(t -> t.sslContext(sslContext));
        }

        return WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                // Users may test APIs returning large payloads; 16MB cap.
                .codecs(c -> c.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
    }

    private String validateScheme(String url) {
        if (url == null || url.isBlank()) return "URL is required";
        String lower = url.trim().toLowerCase();
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            return "Only http:// and https:// URLs may be executed";
        }
        return null;
    }

    private String buildUrl(ExecutionRequest request) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(request.getUrl().trim());
        for (KeyValueItem p : request.getQueryParams()) {
            if (p.isEnabled() && p.getKey() != null && !p.getKey().isBlank()) {
                builder.queryParam(p.getKey(), p.getValue() == null ? "" : p.getValue());
            }
        }
        AuthConfig auth = request.getAuth();
        if (auth != null && auth.getType() == AuthConfig.Type.API_KEY
                && auth.getAddTo() == AuthConfig.ApiKeyLocation.QUERY
                && auth.getKeyName() != null && !auth.getKeyName().isBlank()) {
            builder.queryParam(auth.getKeyName(), auth.getKeyValue());
        }
        return builder.build().toUriString();
    }

    private void applyHeaders(HttpHeaders target, ExecutionRequest request) {
        for (KeyValueItem h : request.getHeaders()) {
            if (h.isEnabled() && h.getKey() != null && !h.getKey().isBlank()) {
                target.add(h.getKey(), h.getValue() == null ? "" : h.getValue());
            }
        }
        AuthConfig auth = request.getAuth();
        if (auth == null) {
            return;
        }
        switch (auth.getType()) {
            case BASIC -> {
                String creds = (auth.getUsername() == null ? "" : auth.getUsername())
                        + ":" + (auth.getPassword() == null ? "" : auth.getPassword());
                target.set(HttpHeaders.AUTHORIZATION,
                        "Basic " + Base64.getEncoder().encodeToString(creds.getBytes(StandardCharsets.UTF_8)));
            }
            case BEARER -> target.set(HttpHeaders.AUTHORIZATION, "Bearer " + (auth.getToken() == null ? "" : auth.getToken()));
            case API_KEY -> {
                if (auth.getAddTo() == AuthConfig.ApiKeyLocation.HEADER
                        && auth.getKeyName() != null && !auth.getKeyName().isBlank()) {
                    target.set(auth.getKeyName(), auth.getKeyValue());
                }
            }
            case NONE -> { /* nothing */ }
        }
    }

    private boolean hasBody(ExecutionRequest request) {
        return request.getBodyType() != ExecutionRequest.BodyType.NONE
                && request.getBody() != null
                && !request.getBody().isEmpty();
    }

    private boolean hasFormData(ExecutionRequest request) {
        return request.getFormData() != null && !request.getFormData().isEmpty();
    }

    /**
     * Builds the raw multipart/form-data body bytes ourselves instead of
     * handing a {@link MultipartBodyBuilder} to WebClient's reactive writer.
     * That writer streams parts without a known total length, so it sends
     * Transfer-Encoding: chunked — plain curl (which knows every part's size
     * upfront) never does. Confirmed live against godavari.mp.gov.in
     * (2026-08-21): the identical field set that curl completes in under 2s
     * consistently hung our client for ~20s before failing, but only when a
     * file part was included with enough other parts alongside it — pointing
     * at chunked-multipart handling on the remote (Apache/ModSecurity)
     * side, not our data or network reachability. Precomputing the full body
     * gives WebClient a real Content-Length, matching curl's wire behavior.
     */
    private byte[] buildMultipartBody(ExecutionRequest request, String boundary) {
        // ByteArrayOutputStream#write never actually throws IOException (it's a
        // no-op override) — swallow the checked signature rather than force
        // every caller to declare it.
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        try {
            String dashBoundary = "--" + boundary + "\r\n";
            for (FormDataItem item : request.getFormData()) {
                if (!item.isEnabled() || item.getKey() == null || item.getKey().isBlank()) continue;
                out.write(dashBoundary.getBytes(StandardCharsets.UTF_8));
                if (item.getType() == FormDataItem.Type.FILE) {
                    if (item.getFileId() == null || item.getFileId().isBlank()) {
                        throw new IllegalArgumentException(
                                "File field '" + item.getKey() + "' has no file attached — attach a file and try again.");
                    }
                    byte[] bytes = formDataFileStore.load(item.getFileId());
                    if (bytes == null) {
                        throw new IllegalArgumentException(
                                "File field '" + item.getKey() + "' — the attached file could not be found, re-attach it and try again.");
                    }
                    String filename = item.getFileName() != null ? item.getFileName() : item.getKey();
                    String contentType = guessContentType(filename);
                    out.write(("Content-Disposition: form-data; name=\"" + item.getKey() + "\"; filename=\""
                            + filename + "\"\r\n").getBytes(StandardCharsets.UTF_8));
                    out.write(("Content-Type: " + contentType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    out.write(bytes);
                } else {
                    out.write(("Content-Disposition: form-data; name=\"" + item.getKey() + "\"\r\n\r\n")
                            .getBytes(StandardCharsets.UTF_8));
                    out.write((item.getValue() == null ? "" : item.getValue()).getBytes(StandardCharsets.UTF_8));
                }
                out.write("\r\n".getBytes(StandardCharsets.UTF_8));
            }
            out.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        } catch (java.io.IOException impossible) {
            throw new IllegalStateException(impossible);
        }
        return out.toByteArray();
    }

    private String guessContentType(String filename) {
        try {
            String probed = java.nio.file.Files.probeContentType(java.nio.file.Path.of(filename));
            if (probed != null) return probed;
        } catch (Exception ignored) {
            // fall through to extension guess below
        }
        String lower = filename.toLowerCase();
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private MediaType resolveContentType(ExecutionRequest request) {
        return switch (request.getBodyType()) {
            case JSON -> MediaType.APPLICATION_JSON;
            case XML -> MediaType.APPLICATION_XML;
            case HTML -> MediaType.TEXT_HTML;
            case FORM_URLENCODED -> MediaType.APPLICATION_FORM_URLENCODED;
            default -> MediaType.TEXT_PLAIN;
        };
    }

    private String rootMessage(Throwable ex) {
        Throwable root = ex;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String msg = root.getMessage();
        return (msg == null || msg.isBlank()) ? root.getClass().getSimpleName() : msg;
    }

    private String statusText(int code) {
        try {
            return org.springframework.http.HttpStatus.valueOf(code).getReasonPhrase();
        } catch (IllegalArgumentException e) {
            return "";
        }
    }
}
