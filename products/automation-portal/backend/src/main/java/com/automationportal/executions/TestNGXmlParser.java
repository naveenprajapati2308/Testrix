package com.automationportal.executions;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.HashSet;
import java.util.stream.Stream;

@Component
public class TestNGXmlParser {
    private static final Logger log = LoggerFactory.getLogger(TestNGXmlParser.class);

    /**
     * TestNG's results XML is written by whatever framework the run executed, so it is not
     * trusted input. A default DocumentBuilderFactory resolves DOCTYPEs and external entities,
     * which would turn a crafted results file into local-file disclosure, SSRF from inside the
     * backend, or entity-expansion DoS. TestNG results never use a DTD, so refusing one outright
     * is the safe setting rather than disabling the resolvers one by one.
     */
    private static DocumentBuilder secureBuilder() throws ParserConfigurationException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder();
    }

    public List<ExecutionTestCase> parse(File xmlFile, Long executionId, String executionCode, String artifactsRoot) {
        List<ExecutionTestCase> testCases = new ArrayList<>();
        try {
            DocumentBuilder builder = secureBuilder();
            Document doc = builder.parse(xmlFile);
            doc.getDocumentElement().normalize();

            NodeList suiteNodes = doc.getElementsByTagName("suite");
            for (int s = 0; s < suiteNodes.getLength(); s++) {
                Node suiteNode = suiteNodes.item(s);
                if (suiteNode.getNodeType() == Node.ELEMENT_NODE) {
                    Element suiteElement = (Element) suiteNode;
                    String suiteName = suiteElement.getAttribute("name");

                    NodeList testNodes = suiteElement.getElementsByTagName("test");
                    for (int t = 0; t < testNodes.getLength(); t++) {
                        Node testNode = testNodes.item(t);
                        if (testNode.getNodeType() == Node.ELEMENT_NODE) {
                            Element testElement = (Element) testNode;
                            String testName = testElement.getAttribute("name"); // e.g. "Land Management Suite"

                            // Resolve module code
                            String moduleCode = resolveModuleCode(testName);

                            NodeList classNodes = testElement.getElementsByTagName("class");
                            for (int c = 0; c < classNodes.getLength(); c++) {
                                Node classNode = classNodes.item(c);
                                if (classNode.getNodeType() == Node.ELEMENT_NODE) {
                                    Element classElement = (Element) classNode;
                                    String className = classElement.getAttribute("name");

                                    // Count non-config method occurrences in this class to determine retries
                                    Map<String, Integer> methodCounts = new HashMap<>();
                                    NodeList mNodesForCount = classElement.getElementsByTagName("test-method");
                                    for (int mi = 0; mi < mNodesForCount.getLength(); mi++) {
                                        Node mNode = mNodesForCount.item(mi);
                                        if (mNode.getNodeType() == Node.ELEMENT_NODE) {
                                            Element mEl = (Element) mNode;
                                            String mName = mEl.getAttribute("name");
                                            boolean isCfg = "true".equalsIgnoreCase(mEl.getAttribute("is-config"));
                                            if (!isCfg && mName != null && !mName.isEmpty()) {
                                                methodCounts.put(mName, methodCounts.getOrDefault(mName, 0) + 1);
                                            }
                                        }
                                    }

                                    NodeList methodNodes = classElement.getElementsByTagName("test-method");
                                    for (int m = 0; m < methodNodes.getLength(); m++) {
                                        Node methodNode = methodNodes.item(m);
                                        if (methodNode.getNodeType() == Node.ELEMENT_NODE) {
                                            Element methodElement = (Element) methodNode;

                                            // Configuration methods (@BeforeClass/@AfterMethod/... —
                                            // is-config="true") are not test cases: the live event
                                            // stream never reports them, and importing them inflates
                                            // the Test Logs list with PASS rows that the execution
                                            // totals (correctly) don't count.
                                            if ("true".equalsIgnoreCase(methodElement.getAttribute("is-config"))) {
                                                continue;
                                            }

                                            ExecutionTestCase tc = new ExecutionTestCase();
                                            tc.setExecutionId(executionId);
                                            tc.setSuiteName(suiteName);
                                            tc.setModuleCode(moduleCode);
                                            tc.setClassName(className);
                                            
                                            String methodName = methodElement.getAttribute("name");
                                            tc.setMethodName(methodName);
                                            tc.setTestName(testName);
                                            tc.setDisplayName(methodName);

                                            // Set retries based on occurrences
                                            int occurrences = methodCounts.getOrDefault(methodName, 1);
                                            tc.setRetries(occurrences - 1);

                                            String status = methodElement.getAttribute("status");
                                            tc.setStatus(status);

                                            String durationStr = methodElement.getAttribute("duration-ms");
                                            tc.setDurationMs(durationStr.isEmpty() ? 0L : Long.parseLong(durationStr));

                                            tc.setStartTime(parseDate(methodElement.getAttribute("started-at")));
                                            tc.setEndTime(parseDate(methodElement.getAttribute("finished-at")));

                                            String isConfigStr = methodElement.getAttribute("is-config");
                                            boolean isConfig = "true".equalsIgnoreCase(isConfigStr);
                                            tc.setConfigMethod(isConfig);

                                            // Extract parameters
                                            NodeList paramsNodes = methodElement.getElementsByTagName("params");
                                            if (paramsNodes.getLength() > 0) {
                                                List<String> paramValues = new ArrayList<>();
                                                NodeList paramList = ((Element) paramsNodes.item(0)).getElementsByTagName("param");
                                                for (int p = 0; p < paramList.getLength(); p++) {
                                                    NodeList valList = ((Element) paramList.item(p)).getElementsByTagName("value");
                                                    if (valList.getLength() > 0) {
                                                        paramValues.add(valList.item(0).getTextContent().trim());
                                                    }
                                                }
                                                if (!paramValues.isEmpty()) {
                                                    tc.setParameters(String.join(", ", paramValues));
                                                }
                                            }

                                            // Extract exceptions
                                            NodeList exceptionNodes = methodElement.getElementsByTagName("exception");
                                            if (exceptionNodes.getLength() > 0) {
                                                Element exceptionElement = (Element) exceptionNodes.item(0);
                                                tc.setExceptionType(exceptionElement.getAttribute("class"));

                                                NodeList messageNodes = exceptionElement.getElementsByTagName("message");
                                                if (messageNodes.getLength() > 0) {
                                                    tc.setFailureReason(messageNodes.item(0).getTextContent().trim());
                                                }

                                                NodeList traceNodes = exceptionElement.getElementsByTagName("full-stacktrace");
                                                if (traceNodes.getLength() > 0) {
                                                    tc.setStackTrace(traceNodes.item(0).getTextContent().trim());
                                                }
                                            }

                                            // Screenshot matching if failed
                                            if ("FAIL".equalsIgnoreCase(status)) {
                                                tc.setScreenshotPath(findMatchingScreenshot(artifactsRoot, executionCode, testName, methodName));
                                            }

                                            // Extract groups/tags
                                            NodeList groupsNodes = methodElement.getElementsByTagName("groups");
                                            if (groupsNodes.getLength() > 0) {
                                                NodeList groupList = ((Element) groupsNodes.item(0)).getElementsByTagName("group");
                                                for (int gp = 0; gp < groupList.getLength(); gp++) {
                                                    String groupName = ((Element) groupList.item(gp)).getAttribute("name");
                                                    if (groupName != null && !groupName.trim().isEmpty()) {
                                                        String norm = groupName.trim();
                                                        if (!norm.startsWith("@")) {
                                                            norm = "@" + norm;
                                                        }
                                                        tc.getTags().add(new Tag(norm));
                                                    }
                                                }
                                            }

                                            // Extract steps from reporter-output
                                            List<TestStep> steps = new ArrayList<>();
                                            NodeList reporterNodes = methodElement.getElementsByTagName("reporter-output");
                                            if (reporterNodes.getLength() > 0) {
                                                NodeList lineNodes = ((Element) reporterNodes.item(0)).getElementsByTagName("line");
                                                for (int l = 0; l < lineNodes.getLength(); l++) {
                                                    String lineVal = lineNodes.item(l).getTextContent().trim();
                                                    if (!lineVal.isEmpty()) {
                                                        TestStep step = new TestStep();
                                                        step.setStepName(lineVal);
                                                        step.setStepOrder(l);
                                                        if ("FAIL".equalsIgnoreCase(status) && l == lineNodes.getLength() - 1) {
                                                            step.setStatus("FAIL");
                                                            NodeList exNodes = methodElement.getElementsByTagName("exception");
                                                            if (exNodes.getLength() > 0) {
                                                                Element exEl = (Element) exNodes.item(0);
                                                                NodeList msgNodes = exEl.getElementsByTagName("message");
                                                                if (msgNodes.getLength() > 0) {
                                                                    step.setErrorMessage(msgNodes.item(0).getTextContent().trim());
                                                                }
                                                                NodeList trNodes = exEl.getElementsByTagName("full-stacktrace");
                                                                if (trNodes.getLength() > 0) {
                                                                    step.setStackTrace(trNodes.item(0).getTextContent().trim());
                                                                }
                                                            }
                                                        } else if ("SKIP".equalsIgnoreCase(status)) {
                                                            step.setStatus("SKIP");
                                                        } else {
                                                            step.setStatus("PASS");
                                                        }
                                                        steps.add(step);
                                                    }
                                                }
                                            }

                                            // Fallback: If no steps were found in reporter output, generate a default one
                                            if (steps.isEmpty()) {
                                                TestStep step = new TestStep();
                                                step.setStepName("Execute " + methodName);
                                                step.setStatus(status);
                                                step.setDurationMs(tc.getDurationMs());
                                                step.setStepOrder(0);
                                                if ("FAIL".equalsIgnoreCase(status)) {
                                                    step.setErrorMessage(tc.getFailureReason());
                                                    step.setStackTrace(tc.getStackTrace());
                                                }
                                                steps.add(step);
                                            }
                                            tc.setTransientSteps(steps);

                                            testCases.add(tc);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse TestNG results XML {}: {}", xmlFile, e.toString());
        }
        return testCases;
    }

    private String resolveModuleCode(String testName) {
        if (testName == null) return "LAND";
        String upper = testName.toUpperCase();
        if (upper.contains("LAND")) return "LAND";
        if (upper.contains("SURVEY")) return "SURVEY";
        if (upper.contains("GIS")) return "GIS";
        if (upper.contains("ARCHITECT")) return "ARCHITECT";
        return "LAND"; // Default fallback
    }

    private Instant parseDate(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) {
            return Instant.now();
        }
        try {
            return Instant.parse(dateStr);
        } catch (Exception e) {
            try {
                // Try format yyyy-MM-dd'T'HH:mm:ss z (e.g. 2026-06-22T10:47:50 IST)
                DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss z");
                return ZonedDateTime.parse(dateStr, formatter).toInstant();
            } catch (Exception ex) {
                try {
                    // Try alternate yyyy-MM-dd'T'HH:mm:ssZ
                    DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssZ");
                    return ZonedDateTime.parse(dateStr, formatter).toInstant();
                } catch (Exception ex2) {
                    try {
                        // Strip timezone suffix (e.g. IST or UTC) and parse
                        String clean = dateStr.replaceAll("\\s+[A-Z]{3,4}$", "");
                        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
                        return ZonedDateTime.parse(clean + "Z").toInstant();
                    } catch (Exception ex3) {
                        return Instant.now();
                    }
                }
            }
        }
    }

    private String findMatchingScreenshot(String artifactsRoot, String executionCode, String testName, String methodName) {
        try {
            Path screenshotsDir = Path.of(artifactsRoot, "executions", executionCode, "screenshots");
            if (!Files.exists(screenshotsDir)) {
                return null;
            }
            try (Stream<Path> walk = Files.walk(screenshotsDir)) {
                Path found = walk.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().toLowerCase().contains(methodName.toLowerCase())
                                && p.getFileName().toString().toLowerCase().endsWith(".png"))
                        .findFirst()
                        .orElse(null);
                if (found != null) {
                    // Return URL path relative to artifacts root: executions/<execution_code>/screenshots/...
                    Path relative = Path.of(artifactsRoot).toAbsolutePath().relativize(found.toAbsolutePath());
                    return relative.toString().replace("\\", "/");
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve screenshot path under {}: {}", artifactsRoot, e.toString());
        }
        return null;
    }
}
