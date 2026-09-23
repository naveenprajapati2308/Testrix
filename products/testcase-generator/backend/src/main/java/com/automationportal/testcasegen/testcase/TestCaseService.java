package com.automationportal.testcasegen.testcase;

import com.automationportal.testcasegen.common.ApiException;
import com.automationportal.testcasegen.history.ReviewAction;
import com.automationportal.testcasegen.history.TestCaseHistoryRecorder;
import com.automationportal.testcasegen.history.TestCaseHistoryRecorder.FieldChange;
import com.automationportal.testcasegen.history.TestCaseReviewHistory;
import com.automationportal.testcasegen.history.TestCaseReviewHistoryRepository;
import com.automationportal.testcasegen.security.CurrentProjectService;
import com.automationportal.testcasegen.security.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TestCaseService {

    private static final int DISPLAY_ORDER_GAP = 1000;

    private final TestCaseRepository repository;
    private final TestCaseCodeGenerator codeGenerator;
    private final TestCaseHistoryRecorder history;
    private final TestCaseReviewHistoryRepository historyRepository;
    private final CurrentProjectService currentProjectService;
    private final CurrentUserService currentUserService;

    @Transactional(readOnly = true)
    public List<TestCaseDto> list(Long documentId) {
        Long projectId = currentProjectService.requireProjectId();
        List<TestCase> testCases = documentId == null
                ? repository.findByProjectIdOrderByDisplayOrderAsc(projectId)
                : repository.findByProjectIdAndSrsDocumentIdOrderByDisplayOrderAsc(projectId, documentId);
        return testCases.stream().map(TestCaseDto::fromEntity).toList();
    }

    @Transactional(readOnly = true)
    public TestCaseDto get(Long id) {
        return TestCaseDto.fromEntity(find(id));
    }

    /** History rows carry no project id of their own — the parent is ownership-checked first. */
    @Transactional(readOnly = true)
    public List<TestCaseReviewHistory> history(Long id) {
        find(id);
        return historyRepository.findByTestCaseIdOrderByCreatedAtDesc(id);
    }

    /** insertAfterId places the new row directly below an existing one; null appends. */
    @Transactional
    public TestCaseDto create(TestCaseDto dto, Long insertAfterId) {
        Long projectId = currentProjectService.requireProjectId();
        Long documentId = dto.srsDocumentId();

        TestCase testCase = TestCase.builder()
                .projectId(projectId)
                .srsDocumentId(documentId)
                .testCaseCode(codeGenerator.nextCode(projectId))
                .displayOrder(nextDisplayOrder(projectId, documentId, insertAfterId))
                .reviewStatus(ReviewStatus.AI_GENERATED)
                .createdBy(currentUserService.currentUserId())
                .build();

        apply(testCase, dto);
        TestCase saved = repository.save(testCase);
        history.record(saved.getId(), ReviewAction.CREATED);
        return TestCaseDto.fromEntity(saved);
    }

    @Transactional
    public TestCaseDto update(Long id, TestCaseDto dto) {
        TestCase existing = find(id);
        history.recordFieldChanges(id, changesBetween(existing, dto));
        apply(existing, dto);
        return TestCaseDto.fromEntity(repository.save(existing));
    }

    /** The grid saves every edited row in one request — one round trip instead of N, and one
     *  transaction so a partial save can't leave the list half-updated. */
    @Transactional
    public List<TestCaseDto> bulkUpdate(List<TestCaseDto> dtos) {
        if (dtos == null || dtos.isEmpty()) return List.of();

        List<TestCase> saved = new ArrayList<>(dtos.size());
        for (TestCaseDto dto : dtos) {
            if (dto.id() == null) throw ApiException.badRequest("Every test case in a bulk save needs an id");
            TestCase existing = find(dto.id());
            history.recordFieldChanges(existing.getId(), changesBetween(existing, dto));
            apply(existing, dto);
            saved.add(existing);
        }
        return repository.saveAll(saved).stream().map(TestCaseDto::fromEntity).toList();
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(find(id));
    }

    /** Drag-reorder: the client sends the ids in their new visual order and the server reassigns
     *  evenly-gapped positions, so ordering never depends on client-side arithmetic. */
    @Transactional
    public void reorder(List<Long> orderedIds) {
        if (orderedIds == null || orderedIds.isEmpty()) return;

        Long projectId = currentProjectService.requireProjectId();
        List<TestCase> testCases = repository.findAllById(orderedIds);
        Map<Long, TestCase> byId = testCases.stream()
                .collect(Collectors.toMap(TestCase::getId, Function.identity()));

        List<TestCase> updated = new ArrayList<>(orderedIds.size());
        int position = 1;
        for (Long id : orderedIds) {
            TestCase testCase = byId.get(id);
            if (testCase == null || !projectId.equals(testCase.getProjectId())) {
                throw ApiException.notFound("Test case not found with ID: " + id);
            }
            testCase.setDisplayOrder(position++ * DISPLAY_ORDER_GAP);
            updated.add(testCase);
        }
        repository.saveAll(updated);
    }

    @Transactional
    public List<TestCaseDto> updateReviewStatus(List<Long> ids, ReviewStatus status) {
        if (ids == null || ids.isEmpty()) return List.of();

        List<TestCase> updated = new ArrayList<>(ids.size());
        for (Long id : ids) {
            TestCase testCase = find(id);
            if (testCase.getReviewStatus() != status) {
                history.recordFieldChange(id, "reviewStatus", testCase.getReviewStatus(), status);
                history.record(id, actionFor(status));
                testCase.setReviewStatus(status);
            }
            updated.add(testCase);
        }
        return repository.saveAll(updated).stream().map(TestCaseDto::fromEntity).toList();
    }

    private ReviewAction actionFor(ReviewStatus status) {
        return switch (status) {
            case APPROVED -> ReviewAction.APPROVED;
            case REJECTED -> ReviewAction.REJECTED;
            default -> ReviewAction.RESTORED;
        };
    }

    private List<FieldChange> changesBetween(TestCase existing, TestCaseDto dto) {
        return List.of(
                new FieldChange("title", existing.getTitle(), dto.title()),
                new FieldChange("description", existing.getDescription(), dto.description()),
                new FieldChange("testType", existing.getTestType(), dto.testType()),
                new FieldChange("priority", existing.getPriority(), dto.priority()),
                new FieldChange("expectedResult", existing.getExpectedResult(), dto.expectedResult()),
                new FieldChange("preconditions", existing.getPreconditions(), dto.preconditions()),
                new FieldChange("testData", existing.getTestData(), dto.testData()));
    }

    private void apply(TestCase testCase, TestCaseDto dto) {
        // Bean validation does not cascade into a List<T> request body, so the bulk-save path
        // would otherwise accept a blank title that the single-update path rejects.
        if (dto.title() == null || dto.title().isBlank()) {
            throw ApiException.badRequest("Title is required");
        }
        testCase.setTitle(dto.title());
        testCase.setDescription(dto.description());
        testCase.setTestType(dto.testType() == null ? TestType.FUNCTIONAL : dto.testType());
        testCase.setPriority(dto.priority());
        testCase.setExpectedResult(dto.expectedResult());
        testCase.setSourceSection(dto.sourceSection());
        testCase.setSourceText(dto.sourceText());
        if (dto.reviewStatus() != null) testCase.setReviewStatus(dto.reviewStatus());

        testCase.setPreconditions(new ArrayList<>(dto.preconditions() == null ? List.of() : dto.preconditions()));
        testCase.setTestData(new ArrayList<>(dto.testData() == null ? List.of() : dto.testData()));

        List<TestCaseStep> steps = new ArrayList<>();
        for (TestCaseDto.StepDto step : dto.steps() == null ? List.<TestCaseDto.StepDto>of() : dto.steps()) {
            if (step.action() == null || step.action().isBlank()) continue;
            TestCaseStep entity = new TestCaseStep();
            entity.setAction(step.action());
            entity.setExpectedResult(step.expectedResult());
            steps.add(entity);
        }
        testCase.replaceSteps(steps);
    }

    private int nextDisplayOrder(Long projectId, Long documentId, Long insertAfterId) {
        if (insertAfterId == null) {
            return repository.maxDisplayOrder(projectId, documentId) + DISPLAY_ORDER_GAP;
        }

        TestCase after = find(insertAfterId);
        List<TestCase> siblings =
                repository.findByProjectIdAndSrsDocumentIdOrderByDisplayOrderAsc(projectId, documentId);

        Integer nextOrder = siblings.stream()
                .map(TestCase::getDisplayOrder)
                .filter(order -> order > after.getDisplayOrder())
                .findFirst()
                .orElse(null);

        if (nextOrder == null) return after.getDisplayOrder() + DISPLAY_ORDER_GAP;

        int midpoint = after.getDisplayOrder() + (nextOrder - after.getDisplayOrder()) / 2;
        // Gap exhausted after repeated inserts in the same spot — respread, then retry.
        if (midpoint == after.getDisplayOrder()) {
            reorder(siblings.stream().map(TestCase::getId).toList());
            return nextDisplayOrder(projectId, documentId, insertAfterId);
        }
        return midpoint;
    }

    /** Ownership guard: a test case in another project is reported as missing rather than
     *  forbidden, so ids cannot be probed to discover what exists elsewhere. */
    private TestCase find(Long id) {
        TestCase testCase = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Test case not found with ID: " + id));
        if (!currentProjectService.requireProjectId().equals(testCase.getProjectId())) {
            throw ApiException.notFound("Test case not found with ID: " + id);
        }
        return testCase;
    }
}
