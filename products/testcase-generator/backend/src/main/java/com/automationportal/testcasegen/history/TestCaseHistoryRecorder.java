package com.automationportal.testcasegen.history;

import com.automationportal.testcasegen.security.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Writes the audit trail for a test case. One row per changed field, so a reviewer can see
 *  exactly what was altered rather than just that "something" changed. */
@Component
@RequiredArgsConstructor
public class TestCaseHistoryRecorder {

    private final TestCaseReviewHistoryRepository repository;
    private final CurrentUserService currentUserService;

    public void record(Long testCaseId, ReviewAction action) {
        repository.save(entry(testCaseId, action, null, null, null));
    }

    /** No row is written when the value is unchanged — a grid save posts every field, not just
     *  the edited ones, and logging all of them would bury the real edits. */
    public void recordFieldChange(Long testCaseId, String field, Object oldValue, Object newValue) {
        if (Objects.equals(asString(oldValue), asString(newValue))) return;
        repository.save(entry(testCaseId, ReviewAction.EDITED, field, asString(oldValue), asString(newValue)));
    }

    public void recordFieldChanges(Long testCaseId, List<FieldChange> changes) {
        List<TestCaseReviewHistory> entries = new ArrayList<>();
        for (FieldChange change : changes) {
            if (Objects.equals(asString(change.oldValue()), asString(change.newValue()))) continue;
            entries.add(entry(testCaseId, ReviewAction.EDITED, change.field(),
                    asString(change.oldValue()), asString(change.newValue())));
        }
        if (!entries.isEmpty()) repository.saveAll(entries);
    }

    private TestCaseReviewHistory entry(Long testCaseId, ReviewAction action,
                                        String field, String oldValue, String newValue) {
        return TestCaseReviewHistory.builder()
                .testCaseId(testCaseId)
                .action(action)
                .fieldName(field)
                .oldValue(oldValue)
                .newValue(newValue)
                .changedBy(currentUserService.currentUserId())
                .changedEmail(currentUserService.currentEmail())
                .build();
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    public record FieldChange(String field, Object oldValue, Object newValue) {}
}
