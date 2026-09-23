package com.automationportal.testcasegen.exchange;

import com.automationportal.testcasegen.common.ApiException;
import com.automationportal.testcasegen.testcase.Priority;
import com.automationportal.testcasegen.testcase.TestCaseDto;
import com.automationportal.testcasegen.testcase.TestCaseService;
import com.automationportal.testcasegen.testcase.TestType;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Reads back a .xlsx that was exported, edited in Excel and re-uploaded.
 *
 * Rows are matched on Code, never on position, so reordering or filtering rows in Excel can't
 * scramble which test case gets which edit. Preview and apply run the same comparison — apply
 * just persists the result — so what the user confirms is exactly what is written.
 */
@Service
@RequiredArgsConstructor
public class TestCaseImportService {

    private final TestCaseService testCaseService;

    public ImportResult importFile(MultipartFile file, Long documentId, boolean apply) {
        if (file == null || file.isEmpty()) throw ApiException.badRequest("A file is required");

        List<Map<String, String>> rows = readRows(file);
        Map<String, TestCaseDto> existingByCode = testCaseService.list(documentId).stream()
                .filter(testCase -> testCase.testCaseCode() != null)
                .collect(Collectors.toMap(TestCaseDto::testCaseCode, Function.identity(), (a, b) -> a));

        List<RowDiff> changed = new ArrayList<>();
        List<String> unmatched = new ArrayList<>();
        List<TestCaseDto> merged = new ArrayList<>();
        int unchanged = 0;

        for (Map<String, String> row : rows) {
            String code = row.get("Code");
            if (code == null || code.isBlank()) continue;

            TestCaseDto existing = existingByCode.get(code.trim());
            if (existing == null) {
                unmatched.add(code.trim());
                continue;
            }

            TestCaseDto candidate = merge(existing, row);
            List<FieldDiff> diffs = diff(existing, candidate);
            if (diffs.isEmpty()) {
                unchanged++;
                continue;
            }
            changed.add(new RowDiff(code.trim(), existing.title(), diffs));
            merged.add(candidate);
        }

        if (apply && !merged.isEmpty()) testCaseService.bulkUpdate(merged);

        return new ImportResult(apply, changed, unmatched, unchanged);
    }

    private List<Map<String, String>> readRows(MultipartFile file) {
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (!name.endsWith(".xlsx")) {
            throw ApiException.badRequest("Only .xlsx files can be imported. Export, edit, then upload that file.");
        }

        try (Workbook workbook = new XSSFWorkbook(new ByteArrayInputStream(file.getBytes()))) {
            Sheet sheet = workbook.getSheetAt(0);
            Row header = sheet.getRow(sheet.getFirstRowNum());
            if (header == null) throw ApiException.badRequest("The spreadsheet is empty");

            DataFormatter formatter = new DataFormatter();
            List<String> columns = new ArrayList<>();
            for (int i = 0; i < header.getLastCellNum(); i++) {
                columns.add(formatter.formatCellValue(header.getCell(i)).trim());
            }
            if (!columns.contains("Code")) {
                throw ApiException.badRequest("The spreadsheet has no 'Code' column — import the file exported from Testrix.");
            }

            List<Map<String, String>> rows = new ArrayList<>();
            for (int r = sheet.getFirstRowNum() + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;
                Map<String, String> values = new LinkedHashMap<>();
                for (int c = 0; c < columns.size(); c++) {
                    values.put(columns.get(c), formatter.formatCellValue(row.getCell(c)));
                }
                rows.add(values);
            }
            return rows;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.badRequest("Could not read the spreadsheet: " + e.getMessage());
        }
    }

    /** Only the editable columns are taken from the sheet; code, ordering and provenance stay
     *  as stored so an edited spreadsheet can't rewrite identity. */
    private TestCaseDto merge(TestCaseDto existing, Map<String, String> row) {
        return new TestCaseDto(
                existing.id(),
                existing.srsDocumentId(),
                existing.testCaseCode(),
                existing.displayOrder(),
                value(row, "Title", existing.title()),
                value(row, "Description", existing.description()),
                TestType.from(value(row, "Type", existing.testType() == null ? null : existing.testType().name())),
                Priority.from(value(row, "Priority", existing.priority() == null ? null : existing.priority().name())),
                existing.reviewStatus(),
                value(row, "Expected Result", existing.expectedResult()),
                value(row, "Source Section", existing.sourceSection()),
                existing.sourceText(),
                row.containsKey("Preconditions")
                        ? TestCaseSheet.splitLines(row.get("Preconditions")) : existing.preconditions(),
                row.containsKey("Test Data")
                        ? TestCaseSheet.splitLines(row.get("Test Data")) : existing.testData(),
                row.containsKey("Steps") ? TestCaseSheet.parseSteps(row.get("Steps")) : existing.steps(),
                existing.createdAt(),
                existing.updatedAt());
    }

    private List<FieldDiff> diff(TestCaseDto before, TestCaseDto after) {
        List<FieldDiff> diffs = new ArrayList<>();
        compare(diffs, "Title", before.title(), after.title());
        compare(diffs, "Description", before.description(), after.description());
        compare(diffs, "Type", before.testType(), after.testType());
        compare(diffs, "Priority", before.priority(), after.priority());
        compare(diffs, "Expected Result", before.expectedResult(), after.expectedResult());
        compare(diffs, "Source Section", before.sourceSection(), after.sourceSection());
        compare(diffs, "Preconditions", before.preconditions(), after.preconditions());
        compare(diffs, "Test Data", before.testData(), after.testData());
        compare(diffs, "Steps", stepText(before), stepText(after));
        return diffs;
    }

    private String stepText(TestCaseDto testCase) {
        return testCase.steps().stream()
                .map(step -> step.action() + TestCaseSheet.STEP_SEPARATOR + nullSafe(step.expectedResult()))
                .collect(Collectors.joining("\n"));
    }

    private void compare(List<FieldDiff> diffs, String field, Object before, Object after) {
        String oldValue = before == null ? "" : String.valueOf(before);
        String newValue = after == null ? "" : String.valueOf(after);
        if (!Objects.equals(oldValue, newValue)) diffs.add(new FieldDiff(field, oldValue, newValue));
    }

    private String value(Map<String, String> row, String column, String fallback) {
        if (!row.containsKey(column)) return fallback;
        String raw = row.get(column);
        return raw == null ? "" : raw.trim();
    }

    private String nullSafe(String value) {
        return value == null ? "" : value;
    }

    public record FieldDiff(String field, String oldValue, String newValue) {}

    public record RowDiff(String code, String title, List<FieldDiff> changes) {}

    public record ImportResult(boolean applied, List<RowDiff> changed, List<String> unmatchedCodes, int unchanged) {}
}
