package runner;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class FrameworkRunnerService {

    private static final Map<String, String> SUITE_NAMES = new ConcurrentHashMap<>();
    private static volatile boolean running = false;
    private static volatile String currentJobId = "";
    private static volatile Process currentProcess = null;
    private static String frameworkPath = "/app/framework";
    private static String playwrightFrameworkPath = "D:\\playwright-js";
    // Parent directory holding one subfolder per project-specific framework — a job carrying a
    // non-blank "frameworkPath" (its Test Engine's own test_engines.framework_path) resolves its
    // working directory as projectFrameworksRoot/<that value> instead of the static
    // playwrightFrameworkPath/frameworkPath above. Null/blank on the job means unchanged legacy
    // behavior — this is additive, not a replacement.
    private static String projectFrameworksRoot = "/app/project-frameworks";
    private static String runnerWorkspacesRoot = "runner-workspaces";
    private static String executionManagerUrl = "http://localhost:8090";
    private static final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    static {
        SUITE_NAMES.put("MPHIDB.xml", "Master Automation Suite");
        SUITE_NAMES.put("land.xml", "Land Management Suite");
        SUITE_NAMES.put("Emp_Arch.xml", "Architect Empanelment Suite");
        SUITE_NAMES.put("test.xml", "Test Suite");
    }

    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getProperty("runner.port", "9090"));

        // Allow path override via system property or env variable
        String envPath = System.getenv("FRAMEWORK_PATH");
        if (envPath != null && !envPath.isEmpty()) {
            frameworkPath = envPath;
        } else {
            String sysPath = System.getProperty("framework.path");
            if (sysPath != null && !sysPath.isEmpty()) {
                frameworkPath = sysPath;
            }
        }

        // Allow EM URL override via env variable
        String emUrl = System.getenv("EXECUTION_MANAGER_URL");
        if (emUrl != null && !emUrl.isEmpty()) {
            executionManagerUrl = emUrl;
        }

        // If path doesn't exist, fall back to "D:\\New folder\\MPHIDB" or current
        // directory
        if (!Files.exists(Paths.get(frameworkPath))) {
            if (Files.exists(Paths.get("D:\\New folder\\MPHIDB"))) {
                frameworkPath = "D:\\New folder\\MPHIDB";
            } else {
                frameworkPath = Paths.get("").toAbsolutePath().toString();
            }
        }

        // Allow the Playwright framework's checkout path to be overridden the same way
        // frameworkPath is above — so relocating that project only ever means changing
        // this one env var, never a code change.
        String pwEnvPath = System.getenv("PLAYWRIGHT_FRAMEWORK_PATH");
        if (pwEnvPath != null && !pwEnvPath.isEmpty()) {
            playwrightFrameworkPath = pwEnvPath;
        } else {
            String pwSysPath = System.getProperty("playwright.framework.path");
            if (pwSysPath != null && !pwSysPath.isEmpty()) {
                playwrightFrameworkPath = pwSysPath;
            }
        }
        if (!Files.exists(Paths.get(playwrightFrameworkPath))) {
            System.out.println("Playwright framework path not found at " + playwrightFrameworkPath
                    + " — Playwright runs will fail until PLAYWRIGHT_FRAMEWORK_PATH is set correctly.");
        }

        String pfrEnv = System.getenv("PROJECT_FRAMEWORKS_ROOT");
        if (pfrEnv != null && !pfrEnv.isEmpty()) {
            projectFrameworksRoot = pfrEnv;
        }

        String rwrEnv = System.getenv("RUNNER_WORKSPACES_ROOT");
        if (rwrEnv != null && !rwrEnv.isEmpty()) {
            runnerWorkspacesRoot = rwrEnv;
        }

        System.out.println("Starting Framework Runner Service using path: " + frameworkPath);
        System.out.println("Playwright framework path: " + playwrightFrameworkPath);
        System.out.println("Project frameworks root: " + projectFrameworksRoot);
        System.out.println("Runner workspaces root: " + runnerWorkspacesRoot);

        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);

        server.createContext("/runner/health", FrameworkRunnerService::handleHealth);
        server.createContext("/runner/status", FrameworkRunnerService::handleStatus);
        server.createContext("/runner/run", FrameworkRunnerService::handleRun);
        server.createContext("/runner/cancel", FrameworkRunnerService::handleCancel);
        server.createContext("/runner/suites", FrameworkRunnerService::handleSuites);
        server.createContext("/runner/tags", FrameworkRunnerService::handleTags);

        server.setExecutor(Executors.newCachedThreadPool());
        server.start();

        System.out.println("Framework Runner Service running on port " + port);
    }

    private static void handleHealth(HttpExchange exchange) throws IOException {
        send(exchange, 200, "{\"status\":\"UP\"}", "application/json");
    }

    private static void handleStatus(HttpExchange exchange) throws IOException {
        String json = String.format(
                "{\"running\":%b,\"currentJobId\":\"%s\"}",
                running, currentJobId);
        send(exchange, 200, json, "application/json");
    }

    private static void handleRun(HttpExchange exchange) throws IOException {
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            send(exchange, 405, "{\"error\":\"Method not allowed\"}", "application/json");
            return;
        }

        if (running) {
            send(exchange, 409, "{\"error\":\"Runner is busy\"}", "application/json");
            return;
        }

        // Read request body
        String body;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))) {
            body = reader.lines().collect(Collectors.joining("\n"));
        }

        String executionId = getJsonVal(body, "executionId");
        String suiteXml = getJsonVal(body, "suiteXml");
        String portalUrl = getJsonVal(body, "portalUrl");
        String apiKey = getJsonVal(body, "apiKey");
        String framework = getJsonVal(body, "framework");
        if (framework == null || framework.isEmpty()) {
            framework = "MAVEN_TESTNG";
        }
        String browser = getJsonVal(body, "browser");
        String tagFilter = getJsonVal(body, "tagFilter");
        String jobFrameworkPath = getJsonVal(body, "frameworkPath");
        Map<String, String> envConfig = parseFlatJsonObject(getJsonObjectVal(body, "envConfig"));

        if (executionId.isEmpty() || suiteXml.isEmpty()) {
            send(exchange, 400, "{\"error\":\"executionId and suiteXml are required\"}", "application/json");
            return;
        }

        running = true;
        currentJobId = executionId;

        String sourceType = getJsonVal(body, "sourceType");
        String gitRepoUrl = getJsonVal(body, "gitRepoUrl");
        String gitBranch = getJsonVal(body, "gitBranch");
        String gitAuthType = getJsonVal(body, "gitAuthType");
        String gitToken = getJsonVal(body, "gitToken");
        String gitUsername = getJsonVal(body, "gitUsername");

        // When sourceType is GIT_REMOTE, clone on-demand into an isolated ephemeral workspace.
        // Otherwise, resolve framework_path under projectFrameworksRoot (or static fallback).
        String resolvedCwd;
        if ("GIT_REMOTE".equalsIgnoreCase(sourceType) && gitRepoUrl != null && !gitRepoUrl.isBlank()) {
            try {
                resolvedCwd = prepareGitWorkspace(executionId, gitRepoUrl, gitBranch, gitToken, gitUsername, framework);
            } catch (Exception e) {
                System.err.println("Failed to prepare Git workspace for job " + executionId + ": " + e.getMessage());
                e.printStackTrace();
                running = false;
                currentJobId = "";
                send(exchange, 500, "{\"error\":\"Git workspace preparation failed: " + e.getMessage().replace("\"", "'") + "\"}", "application/json");
                return;
            }
        } else if (jobFrameworkPath != null && !jobFrameworkPath.isBlank()) {
            Path p = Paths.get(jobFrameworkPath.trim());
            if (p.isAbsolute()) {
                resolvedCwd = p.toString();
            } else {
                resolvedCwd = Paths.get(projectFrameworksRoot, jobFrameworkPath.trim()).toString();
            }
        } else {
            resolvedCwd = null;
        }

        // Dispatch to the right engine's strategy. Adding a future framework means adding
        // one more branch here (plus its own runXyz method) — nothing else in the pipeline
        // (QueueProcessor, RunnerClient, the DB threading) needs to change.
        if ("PLAYWRIGHT".equalsIgnoreCase(framework)) {
            String pwCwd = resolvedCwd != null ? resolvedCwd : playwrightFrameworkPath;
            new Thread(() -> runPlaywright(executionId, suiteXml, portalUrl, apiKey, envConfig, browser, tagFilter, pwCwd), "framework-playwright-executor").start();
        } else {
            String mvnCwd = resolvedCwd != null ? resolvedCwd : frameworkPath;
            new Thread(() -> runMaven(executionId, suiteXml, portalUrl, apiKey, envConfig, mvnCwd), "framework-maven-executor").start();
        }

        send(exchange, 202, "{\"status\":\"STARTING\",\"executionId\":\"" + executionId + "\"}", "application/json");
    }

    // Keys the runner already sets explicitly as its own -D flags below — an env config entry
    // reusing one of these names would silently override a required run parameter, so it's
    // skipped rather than applied. Lowercase because entry keys are lowercased before this
    // check runs (see the envConfig loop below).
    private static final java.util.Set<String> RESERVED_PROPERTY_KEYS = java.util.Set.of(
            "suitexmlfile", "executionid", "portalurl", "openreport", "usedefaultlisteners", "portalapikey");
    private static final Pattern SECRET_KEY_PATTERN = Pattern.compile("pass|secret|token|captcha|captch|key", Pattern.CASE_INSENSITIVE);

    private static void runMaven(String executionId, String suiteXml, String portalUrl, String apiKey, Map<String, String> envConfig, String cwd) {
        try {
            System.out.println("Starting Maven run for job " + executionId + ", suite: " + suiteXml + ", cwd: " + cwd);

            // TestNG writes to <cwd>/test-output, which sits outside Maven's
            // target/
            // directory, so "mvn clean" never touches it. Wipe it explicitly so a previous
            // run's
            // testng-results.xml can't bleed into this execution's parsed data.
            deleteStaleTestOutput(cwd);

            List<String> command = new ArrayList<>();
            String os = System.getProperty("os.name").toLowerCase();

            // Check if mvn command is provided as env
            String mavenCmd = System.getenv("MAVEN_CMD");
            if (mavenCmd == null || mavenCmd.isEmpty()) {
                mavenCmd = os.contains("win") ? "mvn.cmd" : "mvn";
            }

            command.add(mavenCmd);
            command.add("clean");
            command.add("test");
            command.add("-DsuiteXmlFile=" + suiteXml);
            command.add("-DexecutionId=" + executionId);
            command.add("-DportalUrl=" + portalUrl);
            command.add("-DopenReport=false");
            // Surefire's TestNG provider disables TestNG's own default listeners (including
            // its
            // native XMLReporter) unless told otherwise, so it never writes
            // test-output/testng-
            // results.xml — only its own JUnit-schema report. The portal's parser needs the
            // native
            // TestNG schema, so force it back on.
            command.add("-Dusedefaultlisteners=true");
            if (apiKey != null && !apiKey.isEmpty()) {
                command.add("-DportalApiKey=" + apiKey);
            }
            // Selected environment's saved config (base URLs, credentials, captcha keys, …) —
            // ConfigUtils.getPropertyData() prefers a matching System property over the
            // framework's checked-in properties file, so this is what actually switches the run
            // between QA/UAT/etc. without ever touching framework code.
            // Keys are lowercased here because they're typed by hand in the portal's Environment
            // config UI — a user saving "CMS_URL" should still match the framework's actual
            // "CMS_url" property lookup, which lowercases the same way (see ConfigUtils.getPropertyData).
            for (Map.Entry<String, String> entry : envConfig.entrySet()) {
                String key = entry.getKey().toLowerCase();
                if (RESERVED_PROPERTY_KEYS.contains(key)) {
                    System.out.println("Skipping env config key '" + entry.getKey() + "' — reserved for the runner's own parameters.");
                    continue;
                }
                command.add("-D" + key + "=" + entry.getValue());
            }

            System.out.println("Command: " + String.join(" ", maskSecrets(command)));

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(new File(cwd));
            pb.redirectErrorStream(true);

            currentProcess = pb.start();

            // Read output so process doesn't hang
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(currentProcess.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    // System print console output for Docker logs
                    System.out.println("[MAVEN] " + line);
                }
            }

            int exitCode = currentProcess.waitFor();
            System.out.println("Maven process completed with exit code: " + exitCode);

            // Notify Execution Manager that this job is complete
            notifyExecutionManagerCompleted(executionId);

        } catch (Exception e) {
            System.err.println("Exception running Maven process");
            e.printStackTrace();
            // Still notify EM even on exception so it can mark the job as ERROR
            notifyExecutionManagerCompleted(executionId);
        } finally {
            running = false;
            currentJobId = "";
            currentProcess = null;
        }
    }

    private static void runPlaywright(String executionId, String suiteTarget, String portalUrl, String apiKey, Map<String, String> envConfig, String browser, String tagFilter, String cwd) {
        try {
            String resolvedBrowser = (browser != null && !browser.isBlank()) ? browser : "chrome";
            System.out.println("Starting Playwright run for job " + executionId + ", target: " + suiteTarget + ", browser: " + resolvedBrowser
                    + (tagFilter != null && !tagFilter.isBlank() ? ", tagFilter: " + tagFilter : "") + ", cwd: " + cwd);

            deleteStalePlaywrightTestResults(cwd);

            List<String> command = new ArrayList<>();
            String os = System.getProperty("os.name").toLowerCase();

            String npxCmd = System.getenv("NPX_CMD");
            if (npxCmd == null || npxCmd.isEmpty()) {
                npxCmd = os.contains("win") ? "npx.cmd" : "npx";
            }

            command.add(npxCmd);
            command.add("playwright");
            command.add("test");
            boolean targetIsRawTag = suiteTarget != null && suiteTarget.startsWith("@");
            if (suiteTarget != null && !suiteTarget.isEmpty() && !targetIsRawTag) {
                command.add(suiteTarget);
            }
            // Run-scope filter: either a raw tag passed directly as the suite target (Advanced
            // mode), or a separate tagFilter alongside a module folder — never both at once.
            if (targetIsRawTag) {
                command.add("--grep");
                command.add(suiteTarget);
            } else if (tagFilter != null && !tagFilter.isBlank()) {
                command.add("--grep");
                command.add(tagFilter);
            }
            command.add("--project=" + resolvedBrowser);

            System.out.println("Command: " + String.join(" ", command));

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(new File(cwd));
            pb.redirectErrorStream(true);

            // Playwright reads process.env (see tests/utils/config.ts's dotenv usage), not
            // -D system properties, so both the portal-callback identity and the selected
            // environment's config land here as env vars instead. PORTAL_URL/EXECUTION_ID/
            // PORTAL_API_KEY are exactly what tests/reporter/testrix-reporter.ts already
            // expects, so its live event stream reaches the portal with no further wiring.
            Map<String, String> env = pb.environment();
            env.put("PORTAL_URL", portalUrl != null ? portalUrl : "");
            env.put("EXECUTION_ID", executionId);
            // A registered-engine dispatch passes an empty apiKey on purpose (docs/version2.3.md
            // Plan 2 — the engine already has its own key from registration). ProcessBuilder's
            // environment() starts as a copy of the parent's env, so setting PORTAL_API_KEY="" here
            // would permanently blank out whatever the framework's own dotenv/.env config already
            // provides (dotenv does not override an already-set variable) — so it must be left
            // untouched, not set to empty, exactly like the Maven path's `if (apiKey != null &&
            // !apiKey.isEmpty())` guard below already does for -DportalApiKey.
            if (apiKey != null && !apiKey.isEmpty()) {
                env.put("PORTAL_API_KEY", apiKey);
            }
            // testrix-reporter.ts can't reliably introspect which --project actually ran (Playwright's
            // FullConfig always lists every configured project, not just the invoked one) — so tell it
            // directly rather than have it guess from config.projects[0].
            env.put("PORTAL_REQUESTED_BROWSER", resolvedBrowser);
            for (Map.Entry<String, String> entry : envConfig.entrySet()) {
                String key = entry.getKey().toLowerCase();
                if (RESERVED_PROPERTY_KEYS.contains(key)) {
                    System.out.println("Skipping env config key '" + entry.getKey() + "' — reserved for the runner's own parameters.");
                    continue;
                }
                env.put(entry.getKey().toUpperCase().replace('.', '_'), entry.getValue());
            }

            currentProcess = pb.start();

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(currentProcess.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    System.out.println("[PLAYWRIGHT] " + line);
                }
            }

            int exitCode = currentProcess.waitFor();
            System.out.println("Playwright process completed with exit code: " + exitCode);

            notifyExecutionManagerCompleted(executionId);

        } catch (Exception e) {
            System.err.println("Exception running Playwright process");
            e.printStackTrace();
            notifyExecutionManagerCompleted(executionId);
        } finally {
            running = false;
            currentJobId = "";
            currentProcess = null;
        }
    }

    private static void deleteStaleTestOutput(String cwd) {
        Path testOutput = Paths.get(cwd, "test-output");
        if (!Files.exists(testOutput))
            return;
        try (Stream<Path> walk = Files.walk(testOutput)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                }
            });
        } catch (IOException e) {
            System.err.println("Failed to clear stale test-output directory: " + e.getMessage());
        }
    }

    // Playwright doesn't clear its own outputDir (test-results/) between runs by default, same
    // risk deleteStaleTestOutput() exists to prevent for Maven — a previous run's screenshots/
    // videos could otherwise get copied into a totally different execution's artifact folder.
    private static void deleteStalePlaywrightTestResults(String cwd) {
        Path testResults = Paths.get(cwd, "test-results");
        if (!Files.exists(testResults))
            return;
        try (Stream<Path> walk = Files.walk(testResults)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                }
            });
        } catch (IOException e) {
            System.err.println("Failed to clear stale Playwright test-results directory: " + e.getMessage());
        }
    }

    private static String prepareGitWorkspace(String executionId, String gitRepoUrl, String gitBranch,
                                              String gitToken, String gitUsername, String framework) throws Exception {
        Path workspaceDir = Paths.get(runnerWorkspacesRoot, executionId);
        if (Files.exists(workspaceDir)) {
            deleteDirectoryRecursively(workspaceDir);
        }
        Files.createDirectories(workspaceDir);

        String branch = (gitBranch != null && !gitBranch.isBlank()) ? gitBranch : "main";
        System.out.println("[GIT-CLONE] Cloning repo: " + sanitizeUrl(gitRepoUrl) + " (branch: " + branch + ") into " + workspaceDir);

        List<String> cloneCmd = new ArrayList<>();
        cloneCmd.add("git");

        // Authenticated clone using Authorization header without exposing token in git configs
        if (gitToken != null && !gitToken.isBlank() && !gitRepoUrl.startsWith("file:")) {
            if (gitUsername != null && !gitUsername.isBlank()) {
                String raw = gitUsername.trim() + ":" + gitToken.trim();
                String encoded = java.util.Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
                cloneCmd.add("-c");
                cloneCmd.add("http.extraHeader=Authorization: Basic " + encoded);
            } else {
                cloneCmd.add("-c");
                cloneCmd.add("http.extraHeader=Authorization: Bearer " + gitToken.trim());
            }
        }

        cloneCmd.add("clone");
        cloneCmd.add("--depth");
        cloneCmd.add("1");
        cloneCmd.add("-b");
        cloneCmd.add(branch);
        cloneCmd.add(gitRepoUrl);
        cloneCmd.add(workspaceDir.toAbsolutePath().toString());

        ProcessBuilder pb = new ProcessBuilder(cloneCmd);
        pb.redirectErrorStream(true);
        Process p = pb.start();
        StringBuilder gitOutput = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String l;
            while ((l = r.readLine()) != null) {
                System.out.println("[GIT] " + l);
                if (gitOutput.length() < 500) {
                    if (!gitOutput.isEmpty()) gitOutput.append(" ");
                    gitOutput.append(l);
                }
            }
        }
        int code = p.waitFor();
        if (code != 0) {
            String detail = gitOutput.isEmpty() ? "exit code " + code : gitOutput.toString();
            throw new RuntimeException("Git clone failed: " + detail);
        }

        // If Playwright framework, install dependencies if package.json exists in cloned repo
        if ("PLAYWRIGHT".equalsIgnoreCase(framework) && Files.exists(workspaceDir.resolve("package.json"))) {
            System.out.println("[GIT-CLONE] Installing Playwright dependencies in cloned workspace...");
            List<String> npmCmd = new ArrayList<>();
            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                npmCmd.addAll(List.of("cmd.exe", "/c", "npm", "install", "--no-audit", "--no-fund"));
            } else {
                npmCmd.addAll(List.of("npm", "install", "--no-audit", "--no-fund"));
            }
            ProcessBuilder npmPb = new ProcessBuilder(npmCmd);
            npmPb.directory(workspaceDir.toFile());
            npmPb.redirectErrorStream(true);
            Process npmProc = npmPb.start();
            StringBuilder npmOutput = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(npmProc.getInputStream(), StandardCharsets.UTF_8))) {
                String l;
                while ((l = r.readLine()) != null) {
                    System.out.println("[NPM] " + l);
                    if (npmOutput.length() < 300) {
                        if (!npmOutput.isEmpty()) npmOutput.append(" ");
                        npmOutput.append(l);
                    }
                }
            }
            int npmCode = npmProc.waitFor();
            if (npmCode != 0) {
                System.err.println("[NPM-WARN] npm install exited with code: " + npmCode + " (" + npmOutput + ")");
            }
        }

        System.out.println("[GIT-CLONE] Workspace ready at " + workspaceDir);
        return workspaceDir.toAbsolutePath().toString();
    }

    private static String sanitizeUrl(String url) {
        if (url == null) return "";
        return url.replaceAll("://[^@]+@", "://***@");
    }

    private static void deleteDirectoryRecursively(Path dir) {
        if (!Files.exists(dir)) return;
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (IOException ignored) {}
            });
        } catch (IOException e) {
            System.err.println("Failed to clean directory " + dir + ": " + e.getMessage());
        }
    }

    private static void notifyExecutionManagerCompleted(String jobId) {
        try {
            String url = executionManagerUrl + "/em/executions/" + jobId + "/completed";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .timeout(Duration.ofSeconds(10))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            System.out.println("Notified Execution Manager of job completion. jobId=" + jobId + ", status="
                    + response.statusCode());
        } catch (Exception e) {
            System.err.println("Failed to notify Execution Manager of job completion for jobId=" + jobId);
            e.printStackTrace();
        }
    }

    private static void handleCancel(HttpExchange exchange) throws IOException {
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            send(exchange, 405, "{\"error\":\"Method not allowed\"}", "application/json");
            return;
        }

        if (!running || currentProcess == null) {
            send(exchange, 200, "{\"status\":\"IDLE\",\"message\":\"No running job to cancel\"}", "application/json");
            return;
        }

        try {
            System.out.println("Cancelling job: " + currentJobId);
            currentProcess.descendants().forEach(ProcessHandle::destroyForcibly);
            currentProcess.destroyForcibly();
            send(exchange, 200, "{\"status\":\"CANCELLED\",\"message\":\"Job cancelled successfully\"}",
                    "application/json");
        } catch (Exception e) {
            send(exchange, 500, "{\"error\":\"" + e.getMessage() + "\"}", "application/json");
        }
    }

    private static void handleSuites(HttpExchange exchange) throws IOException {
        String framework = getQueryParam(exchange, "framework");
        if (framework != null && "PLAYWRIGHT".equalsIgnoreCase(framework)) {
            handlePlaywrightSuites(exchange);
            return;
        }
        try {
            List<String> files = new ArrayList<>();
            try (Stream<Path> stream = Files.list(Paths.get(frameworkPath))) {
                files = stream
                        .map(p -> p.getFileName().toString())
                        .filter(name -> name.endsWith(".xml"))
                        .collect(Collectors.toList());
            }

            StringBuilder json = new StringBuilder("[");
            for (int i = 0; i < files.size(); i++) {
                String fileName = files.get(i);
                String suiteName = SUITE_NAMES.getOrDefault(fileName, fileName.replace(".xml", "") + " Suite");
                String key = fileName.replace(".xml", "").toLowerCase();

                json.append(String.format(
                        "{\"key\":\"%s\",\"name\":\"%s\",\"xml\":\"%s\"}",
                        key, suiteName, fileName));
                if (i < files.size() - 1) {
                    json.append(",");
                }
            }
            json.append("]");

            send(exchange, 200, json.toString(), "application/json");
        } catch (Exception e) {
            send(exchange, 500, "{\"error\":\"" + e.getMessage() + "\"}", "application/json");
        }
    }

    // Lists Playwright spec files under <playwrightFrameworkPath>/tests/specs in the same
    // {key,name,xml} shape the Maven/XML suite list uses above — the "xml" field holds the
    // spec's path relative to playwrightFrameworkPath (directly usable as the CLI arg
    // runPlaywright() passes to `npx playwright test <target>`), so the frontend/JSON
    // contract needs no per-framework change.
    private static void handlePlaywrightSuites(HttpExchange exchange) throws IOException {
        try {
            Path baseDir = Paths.get(playwrightFrameworkPath);
            Path specsRoot = baseDir.resolve("tests").resolve("specs");
            List<String> specs = new ArrayList<>();
            if (Files.exists(specsRoot)) {
                try (Stream<Path> walk = Files.walk(specsRoot)) {
                    specs = walk.filter(p -> p.toString().endsWith(".spec.ts"))
                            .map(p -> baseDir.relativize(p).toString().replace("\\", "/"))
                            .sorted()
                            .collect(Collectors.toList());
                }
            }

            StringBuilder json = new StringBuilder("[");
            for (int i = 0; i < specs.size(); i++) {
                String relPath = specs.get(i);
                String baseName = relPath.substring(relPath.lastIndexOf('/') + 1).replace(".spec.ts", "");
                String key = relPath.replace(".spec.ts", "").replace("/", "-").toLowerCase();

                json.append(String.format(
                        "{\"key\":\"%s\",\"name\":\"%s\",\"xml\":\"%s\"}",
                        key, baseName, relPath));
                if (i < specs.size() - 1) {
                    json.append(",");
                }
            }
            json.append("]");

            send(exchange, 200, json.toString(), "application/json");
        } catch (Exception e) {
            send(exchange, 500, "{\"error\":\"" + e.getMessage() + "\"}", "application/json");
        }
    }

    // Matches a test/describe title string literal so tag tokens can be pulled from just the
    // title text — scanning the whole file for "@word" would also match unrelated "@" usages
    // (e.g. email addresses in test data) as false-positive tags.
    private static final Pattern TEST_TITLE_PATTERN = Pattern.compile("test(?:\\.describe)?\\s*\\(\\s*[`'\"]([^`'\"]*)[`'\"]");
    private static final Pattern TAG_TOKEN_PATTERN = Pattern.compile("@[A-Za-z0-9_]+");

    // Discovers run-scope tags (e.g. "@smoke", "@regression") already present in a Playwright
    // module's test/describe titles under the given folder — nothing is manually registered
    // anywhere; an empty result just means no tags exist yet, which the caller treats as "no
    // filter available", never an error.
    private static void handleTags(HttpExchange exchange) throws IOException {
        try {
            String relFolder = getQueryParam(exchange, "path");
            if (relFolder == null || relFolder.isBlank()) {
                send(exchange, 200, "[]", "application/json");
                return;
            }
            Path baseDir = Paths.get(playwrightFrameworkPath);
            Path folder = baseDir.resolve(relFolder).normalize();
            if (!folder.startsWith(baseDir) || !Files.exists(folder)) {
                send(exchange, 200, "[]", "application/json");
                return;
            }

            java.util.Set<String> tags = new java.util.TreeSet<>();
            try (Stream<Path> walk = Files.walk(folder)) {
                List<Path> tsFiles = walk.filter(p -> p.toString().endsWith(".ts")).collect(Collectors.toList());
                for (Path p : tsFiles) {
                    String content = Files.readString(p, StandardCharsets.UTF_8);
                    Matcher titleMatcher = TEST_TITLE_PATTERN.matcher(content);
                    while (titleMatcher.find()) {
                        Matcher tagMatcher = TAG_TOKEN_PATTERN.matcher(titleMatcher.group(1));
                        while (tagMatcher.find()) {
                            tags.add(tagMatcher.group());
                        }
                    }
                }
            }

            StringBuilder json = new StringBuilder("[");
            int i = 0;
            for (String tag : tags) {
                if (i++ > 0) json.append(",");
                json.append("\"").append(tag).append("\"");
            }
            json.append("]");
            send(exchange, 200, json.toString(), "application/json");
        } catch (Exception e) {
            send(exchange, 500, "{\"error\":\"" + e.getMessage() + "\"}", "application/json");
        }
    }

    // Reads a single query-string parameter from the request URI (com.sun.net.httpserver has
    // no built-in @RequestParam-style binding).
    private static String getQueryParam(HttpExchange exchange, String name) {
        String query = exchange.getRequestURI().getQuery();
        if (query == null || query.isEmpty()) return null;
        for (String pair : query.split("&")) {
            int idx = pair.indexOf('=');
            String key = idx == -1 ? pair : pair.substring(0, idx);
            if (!key.equals(name)) continue;
            if (idx == -1) return "";
            try {
                return java.net.URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return pair.substring(idx + 1);
            }
        }
        return null;
    }

    // Masks the value of any -D<key>=<value> command argument whose key looks secret-ish
    // (password/captcha/token/…), so it never lands in plaintext in process/console logs.
    private static List<String> maskSecrets(List<String> command) {
        List<String> masked = new ArrayList<>(command.size());
        for (String arg : command) {
            if (arg.startsWith("-D") && arg.contains("=")) {
                int eq = arg.indexOf('=');
                String key = arg.substring(2, eq);
                if (SECRET_KEY_PATTERN.matcher(key).find()) {
                    masked.add(arg.substring(0, eq + 1) + "****");
                    continue;
                }
            }
            masked.add(arg);
        }
        return masked;
    }

    // Extracts the raw substring (including braces) of a nested JSON object value for `key`,
    // e.g. getJsonObjectVal({"envConfig":{"a":"1"}}, "envConfig") -> {"a":"1"}. Returns "{}" if
    // the key or a balanced object isn't found.
    private static String getJsonObjectVal(String json, String key) {
        int idx = json.indexOf("\"" + key + "\"");
        if (idx == -1) return "{}";
        int brace = json.indexOf("{", idx);
        if (brace == -1) return "{}";
        int depth = 0;
        for (int i = brace; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '{') depth++;
            else if (c == '}') {
                depth--;
                if (depth == 0) return json.substring(brace, i + 1);
            }
        }
        return "{}";
    }

    // Parses a flat JSON object of string values (no nesting, no numbers/booleans expected —
    // every value coming from the portal's environment config editor is a string).
    private static Map<String, String> parseFlatJsonObject(String objJson) {
        Map<String, String> result = new LinkedHashMap<>();
        Matcher m = Pattern.compile("\"([^\"]+)\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(objJson);
        while (m.find()) {
            String value = m.group(2).replace("\\\"", "\"").replace("\\\\", "\\");
            result.put(m.group(1), value);
        }
        return result;
    }

    private static String getJsonVal(String json, String key) {
        int idx = json.indexOf("\"" + key + "\"");
        if (idx == -1)
            return "";
        int colon = json.indexOf(":", idx);
        if (colon == -1)
            return "";
        int startQuote = json.indexOf("\"", colon);
        if (startQuote == -1 || startQuote > json.indexOf(",", colon) && json.indexOf(",", colon) != -1
                || startQuote > json.indexOf("}", colon)) {
            // It's a boolean or number
            int end = json.indexOf(",", colon);
            if (end == -1)
                end = json.indexOf("}", colon);
            return json.substring(colon + 1, end).trim();
        }
        int endQuote = json.indexOf("\"", startQuote + 1);
        if (endQuote == -1)
            return "";
        return json.substring(startQuote + 1, endQuote);
    }

    private static void send(HttpExchange exchange, int statusCode, String body, String contentType)
            throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType + "; charset=utf-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "*");
        exchange.sendResponseHeaders(statusCode, bytes.length);

        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }
}
