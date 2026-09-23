package com.automationportal.testcasegen.testcase;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "test_cases")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestCase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "srs_document_id")
    private Long srsDocumentId;

    @Column(name = "test_case_code", nullable = false, length = 100)
    private String testCaseCode;

    /** Position in the list, independent of testCaseCode so a row can be inserted between two
     *  others without renumbering (and invalidating) the codes after it. */
    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "test_type", nullable = false, length = 30)
    private TestType testType;

    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    private Priority priority;

    @Enumerated(EnumType.STRING)
    @Column(name = "review_status", nullable = false, length = 20)
    private ReviewStatus reviewStatus;

    @Column(name = "expected_result", columnDefinition = "TEXT")
    private String expectedResult;

    @Column(name = "source_section", length = 500)
    private String sourceSection;

    @Column(name = "source_text", columnDefinition = "TEXT")
    private String sourceText;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "testCase", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("stepNumber ASC")
    @Builder.Default
    private List<TestCaseStep> steps = new ArrayList<>();

    // Preconditions and test data are ordered lists of plain strings — an element collection
    // models that directly, without a near-empty entity class for each.
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "test_case_preconditions", joinColumns = @JoinColumn(name = "test_case_id"))
    @OrderColumn(name = "sequence_number")
    @Column(name = "precondition", nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private List<String> preconditions = new ArrayList<>();

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "test_case_test_data", joinColumns = @JoinColumn(name = "test_case_id"))
    @OrderColumn(name = "sequence_number")
    @Column(name = "data_value", nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private List<String> testData = new ArrayList<>();

    public void replaceSteps(List<TestCaseStep> replacements) {
        steps.clear();
        int number = 1;
        for (TestCaseStep step : replacements) {
            step.setTestCase(this);
            step.setStepNumber(number++);
            steps.add(step);
        }
    }
}
