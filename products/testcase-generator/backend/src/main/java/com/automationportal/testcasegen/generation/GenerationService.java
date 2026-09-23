package com.automationportal.testcasegen.generation;

import com.automationportal.testcasegen.document.DocumentStatus;
import com.automationportal.testcasegen.document.DocumentTextExtractor;
import com.automationportal.testcasegen.document.SrsDocument;
import com.automationportal.testcasegen.document.SrsDocumentRepository;
import com.automationportal.testcasegen.document.SrsFileStore;
import com.automationportal.testcasegen.testcase.Priority;
import com.automationportal.testcasegen.testcase.ReviewStatus;
import com.automationportal.testcasegen.testcase.TestCase;
import com.automationportal.testcasegen.testcase.TestCaseCodeGenerator;
import com.automationportal.testcasegen.testcase.TestCaseRepository;
import com.automationportal.testcasegen.testcase.TestCaseStep;
import com.automationportal.testcasegen.testcase.TestType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Runs the SRS -> test cases pipeline in the background: extract, chunk, generate per chunk in
 * parallel, deduplicate, persist.
 *
 * Runs off the request thread because a large SRS takes minutes — well past the gateway's read
 * timeout — so the upload returns immediately and the UI polls the run for progress.
 *
 * Every method here takes projectId explicitly and never calls CurrentProjectService:
 * ProjectContextHolder is a ThreadLocal populated only by the JWT filter, so on these worker
 * threads it is null. The project is read from the document row instead.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GenerationService {

    private static final int DISPLAY_ORDER_GAP = 1000;

    private final SrsDocumentRepository documentRepository;
    private final SrsFileStore fileStore;
    private final DocumentTextExtractor textExtractor;
    private final SrsChunker chunker;
    private final TestCasePromptBuilder promptBuilder;
    private final GeminiClient geminiClient;
    private final TestCaseJsonParser jsonParser;
    private final TestCaseDeduplicator deduplicator;
    private final TestCaseRepository testCaseRepository;
    private final TestCaseCodeGenerator codeGenerator;
    private final AiTestGenerationRunRepository runRepository;
    private final ExecutorService geminiChunkExecutor;

    @Async("generationExecutor")
    public void generateAsync(Long documentId) {
        long startedAt = System.currentTimeMillis();
        SrsDocument document = documentRepository.findById(documentId).orElse(null);
        if (document == null) {
            log.warn("Generation requested for missing document {}", documentId);
            return;
        }

        AiTestGenerationRun run = runRepository.save(AiTestGenerationRun.builder()
                .projectId(document.getProjectId())
                .srsDocumentId(document.getId())
                .provider("GEMINI")
                .model(geminiClient.model())
                .status(GenerationStatus.STARTED)
                .build());

        try {
            markDocument(document, DocumentStatus.PROCESSING, null);

            byte[] bytes = fileStore.load(document.getStorageId());
            if (bytes == null) throw new IllegalStateException("Uploaded document is no longer available");

            List<SrsChunk> chunks = chunker.chunk(textExtractor.extract(bytes, document.getFileType()));
            if (chunks.isEmpty()) throw new IllegalStateException("No readable content found in the document");

            run.setTotalChunks(chunks.size());
            run.setStatus(GenerationStatus.PROCESSING);
            runRepository.save(run);

            List<GeneratedTestCase> generated = generateForChunks(chunks, run.getId());
            List<GeneratedTestCase> unique = deduplicator.deduplicate(generated);
            persist(document, unique);

            run.setGeneratedTestCases(generated.size());
            run.setDuplicateTestCases(generated.size() - unique.size());
            run.setFinalTestCases(unique.size());
            run.setProcessedChunks(chunks.size());
            run.setStatus(GenerationStatus.COMPLETED);
            run.setProcessingTimeMs(System.currentTimeMillis() - startedAt);
            run.setCompletedAt(Instant.now());
            runRepository.save(run);

            document.setTotalChunks(chunks.size());
            document.setTotalTestCases(unique.size());
            markDocument(document, DocumentStatus.COMPLETED, null);

        } catch (Exception e) {
            log.error("Generation failed for document {}: {}", documentId, e.getMessage());
            run.setStatus(GenerationStatus.FAILED);
            run.setErrorMessage(e.getMessage());
            run.setProcessingTimeMs(System.currentTimeMillis() - startedAt);
            run.setCompletedAt(Instant.now());
            runRepository.save(run);
            markDocument(document, DocumentStatus.FAILED, e.getMessage());
        }
    }

    private List<GeneratedTestCase> generateForChunks(List<SrsChunk> chunks, Long runId) {
        AtomicInteger processed = new AtomicInteger();

        List<CompletableFuture<List<GeneratedTestCase>>> futures = chunks.stream()
                .map(chunk -> CompletableFuture
                        .supplyAsync(() -> generateForChunk(chunk), geminiChunkExecutor)
                        .whenComplete((result, error) ->
                                runRepository.updateProgress(runId, processed.incrementAndGet())))
                .toList();

        List<GeneratedTestCase> all = new ArrayList<>();
        for (CompletableFuture<List<GeneratedTestCase>> future : futures) {
            all.addAll(future.join());
        }
        return all;
    }

    /** One failed chunk must not lose the other chunks' output — a partial suite is still useful,
     *  and the failure count is visible on the run. */
    private List<GeneratedTestCase> generateForChunk(SrsChunk chunk) {
        try {
            return jsonParser.parse(geminiClient.generate(promptBuilder.build(chunk)), chunk.section());
        } catch (Exception e) {
            log.warn("Chunk {} ({}) failed: {}", chunk.chunkIndex(), chunk.section(), e.getMessage());
            return List.of();
        }
    }

    // saveAll() is itself a single transaction, so the whole suite lands or none of it does.
    // Not annotated @Transactional: this is a self-invocation from generateAsync(), which
    // bypasses the Spring proxy and would silently do nothing.
    private void persist(SrsDocument document, List<GeneratedTestCase> generated) {
        if (generated.isEmpty()) return;

        List<String> codes = codeGenerator.nextCodes(document.getProjectId(), generated.size());
        List<TestCase> entities = new ArrayList<>(generated.size());

        for (int i = 0; i < generated.size(); i++) {
            GeneratedTestCase source = generated.get(i);
            TestCase testCase = TestCase.builder()
                    .projectId(document.getProjectId())
                    .srsDocumentId(document.getId())
                    .testCaseCode(codes.get(i))
                    .displayOrder((i + 1) * DISPLAY_ORDER_GAP)
                    .title(trim(source.title(), 500))
                    .description(source.description())
                    .testType(TestType.from(source.type()))
                    .priority(Priority.from(source.priority()))
                    .reviewStatus(ReviewStatus.AI_GENERATED)
                    .expectedResult(source.expectedResult())
                    .sourceSection(trim(source.sourceSection(), 500))
                    .sourceText(source.sourceText())
                    .createdBy(document.getUploadedBy())
                    .preconditions(new ArrayList<>(source.preconditions()))
                    .testData(new ArrayList<>(source.testData()))
                    .build();

            List<TestCaseStep> steps = new ArrayList<>();
            for (GeneratedTestCase.Step step : source.steps()) {
                TestCaseStep entity = new TestCaseStep();
                entity.setAction(step.action());
                entity.setExpectedResult(step.expectedResult());
                steps.add(entity);
            }
            testCase.replaceSteps(steps);
            entities.add(testCase);
        }

        testCaseRepository.saveAll(entities);
    }

    private void markDocument(SrsDocument document, DocumentStatus status, String error) {
        document.setStatus(status);
        document.setErrorMessage(error);
        documentRepository.save(document);
    }

    private String trim(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }
}
