package com.automationportal.testcasegen.exchange;

import com.automationportal.testcasegen.common.ApiException;
import com.automationportal.testcasegen.testcase.TestCaseDto;
import com.automationportal.testcasegen.testcase.TestCaseService;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.util.List;

/** Produces the .xlsx that closes the gap left by the grid's community licence: edit in real
 *  Excel or Sheets, then import the file back. CSV is offered for tools that prefer it. */
@Service
@RequiredArgsConstructor
public class TestCaseExportService {

    private static final int MAX_COLUMN_WIDTH = 60 * 256;

    private final TestCaseService testCaseService;

    public byte[] toXlsx(Long documentId) {
        List<TestCaseDto> testCases = testCaseService.list(documentId);

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Test Cases");

            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);

            CellStyle bodyStyle = workbook.createCellStyle();
            bodyStyle.setWrapText(true);
            bodyStyle.setVerticalAlignment(VerticalAlignment.TOP);

            Row header = sheet.createRow(0);
            for (int i = 0; i < TestCaseSheet.HEADERS.size(); i++) {
                Cell cell = header.createCell(i);
                cell.setCellValue(TestCaseSheet.HEADERS.get(i));
                cell.setCellStyle(headerStyle);
            }

            int rowIndex = 1;
            for (TestCaseDto testCase : testCases) {
                Row row = sheet.createRow(rowIndex++);
                List<String> values = TestCaseSheet.toRow(testCase);
                for (int i = 0; i < values.size(); i++) {
                    Cell cell = row.createCell(i);
                    cell.setCellValue(values.get(i));
                    cell.setCellStyle(bodyStyle);
                }
            }

            for (int i = 0; i < TestCaseSheet.HEADERS.size(); i++) {
                sheet.autoSizeColumn(i);
                // autoSizeColumn follows the longest cell, which for a steps column can be
                // thousands of characters wide and unusable.
                if (sheet.getColumnWidth(i) > MAX_COLUMN_WIDTH) sheet.setColumnWidth(i, MAX_COLUMN_WIDTH);
            }
            sheet.createFreezePane(0, 1);

            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw ApiException.internal("Failed to build the Excel export: " + e.getMessage());
        }
    }

    public byte[] toCsv(Long documentId) {
        StringBuilder csv = new StringBuilder();
        csv.append(String.join(",", TestCaseSheet.HEADERS.stream().map(this::quote).toList())).append('\n');

        for (TestCaseDto testCase : testCaseService.list(documentId)) {
            csv.append(String.join(",", TestCaseSheet.toRow(testCase).stream().map(this::quote).toList()))
               .append('\n');
        }
        return csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    private String quote(String value) {
        return '"' + (value == null ? "" : value.replace("\"", "\"\"")) + '"';
    }
}
