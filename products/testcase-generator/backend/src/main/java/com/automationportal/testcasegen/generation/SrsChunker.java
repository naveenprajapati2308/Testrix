package com.automationportal.testcasegen.generation;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Splits SRS text into section-aware chunks small enough for one AI call. Ported from Archive's
 * document.chunk.utility.js.
 *
 * Section-aware rather than fixed-size because a test case generated from half a requirement is
 * worse than one generated from a slightly larger chunk: headings are kept with their content,
 * and consecutive short sections are packed together up to the target size.
 */
@Component
public class SrsChunker {

    private static final int TARGET_CHUNK_SIZE = 30_000;
    private static final int MAX_CHUNK_SIZE = 40_000;
    private static final int OVERLAP_SIZE = 400;
    private static final int MAX_PARAGRAPH_SIZE = 6_000;

    // Numbered ("2.1 User Management"), markdown ("## Scope"), keyword ("SECTION 3:") and
    // all-caps ("FUNCTIONAL REQUIREMENTS") headings.
    private static final Pattern SECTION_HEADING = Pattern.compile(
            "^(?:#{1,4}\\s+|(?:\\d+\\.)+\\d*\\s+|SECTION\\s+\\d+[:.]?|MODULE\\s+\\d+[:.]?|[A-Z][A-Z0-9\\s\\-_]{3,50}:?$)");

    public List<SrsChunk> chunk(String text) {
        if (text == null || text.isBlank()) return List.of();
        String trimmed = text.trim();

        if (trimmed.length() <= TARGET_CHUNK_SIZE) {
            return List.of(new SrsChunk(1, "Full Document", trimmed));
        }

        List<Section> sections = extractSections(trimmed);
        List<Draft> drafts = sections.size() <= 1
                ? chunkParagraphs(trimmed, "General")
                : packSections(sections);

        List<SrsChunk> chunks = new ArrayList<>(drafts.size());
        for (int i = 0; i < drafts.size(); i++) {
            chunks.add(new SrsChunk(i + 1, drafts.get(i).section, drafts.get(i).text));
        }
        return chunks;
    }

    private List<Draft> packSections(List<Section> sections) {
        List<Draft> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        List<String> included = new ArrayList<>();

        for (Section section : sections) {
            String formatted = "[Section: " + section.title + "]\n\n" + section.content;

            // A single oversized section can't be packed with anything — flush, then split it alone.
            if (formatted.length() > MAX_CHUNK_SIZE) {
                if (current.length() > 0) {
                    chunks.add(new Draft(String.join(", ", included), current.toString()));
                    current.setLength(0);
                    included.clear();
                }
                chunks.addAll(chunkParagraphs(section.content, section.title));
                continue;
            }

            String candidate = current.length() == 0 ? formatted : current + "\n\n---\n\n" + formatted;
            if (candidate.length() <= TARGET_CHUNK_SIZE) {
                current.setLength(0);
                current.append(candidate);
                included.add(section.title);
            } else {
                if (current.length() > 0) chunks.add(new Draft(String.join(", ", included), current.toString()));
                current.setLength(0);
                current.append(formatted);
                included.clear();
                included.add(section.title);
            }
        }

        if (current.length() > 0) chunks.add(new Draft(String.join(", ", included), current.toString()));
        return chunks;
    }

    private List<Section> extractSections(String text) {
        List<Section> sections = new ArrayList<>();
        String currentTitle = "General";
        StringBuilder content = new StringBuilder();

        for (String line : text.split("\n")) {
            String trimmed = line.trim();
            if (!trimmed.isEmpty() && trimmed.length() < 120 && SECTION_HEADING.matcher(trimmed).find()) {
                if (content.length() > 0) {
                    sections.add(new Section(currentTitle, content.toString().trim()));
                    content.setLength(0);
                }
                currentTitle = trimmed.replaceAll("^#{1,4}\\s+", "");
            } else {
                content.append(line).append('\n');
            }
        }
        if (content.length() > 0) sections.add(new Section(currentTitle, content.toString().trim()));

        sections.removeIf(s -> s.content.isEmpty());
        return sections;
    }

    /** Paragraph-boundary packing with a small tail overlap, so a requirement split across a
     *  chunk boundary still has its lead-in context in the following chunk. */
    private List<Draft> chunkParagraphs(String text, String sectionTitle) {
        List<String> paragraphs = new ArrayList<>();
        for (String raw : text.split("\n\\s*\n")) {
            String paragraph = raw.trim();
            if (paragraph.isEmpty()) continue;
            if (paragraph.length() > MAX_PARAGRAPH_SIZE) {
                paragraphs.addAll(splitLargeParagraph(paragraph));
            } else {
                paragraphs.add(paragraph);
            }
        }
        if (paragraphs.isEmpty()) return List.of();

        List<String> texts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String paragraph : paragraphs) {
            String candidate = current.length() == 0 ? paragraph : current + "\n\n" + paragraph;
            if (candidate.length() <= TARGET_CHUNK_SIZE) {
                current.setLength(0);
                current.append(candidate);
                continue;
            }
            String overlap = current.length() > OVERLAP_SIZE
                    ? current.substring(current.length() - OVERLAP_SIZE)
                    : "";
            if (current.length() > 0) texts.add(current.toString());
            current.setLength(0);
            current.append(overlap.isEmpty() ? paragraph : overlap + "\n\n" + paragraph);
        }
        if (current.length() > 0) texts.add(current.toString());

        List<Draft> drafts = new ArrayList<>(texts.size());
        String header = "[Section: " + sectionTitle + "]";
        for (String body : texts) {
            drafts.add(new Draft(sectionTitle, body.startsWith(header) ? body : header + "\n\n" + body));
        }
        return drafts;
    }

    private List<String> splitLargeParagraph(String paragraph) {
        List<String> pieces = new ArrayList<>();
        StringBuilder current = new StringBuilder();

        for (String sentence : paragraph.split("(?<=[.?!])\\s+")) {
            if (current.length() + sentence.length() + 1 <= MAX_PARAGRAPH_SIZE) {
                if (current.length() > 0) current.append(' ');
                current.append(sentence);
            } else {
                if (current.length() > 0) {
                    pieces.add(current.toString());
                    current.setLength(0);
                }
                if (sentence.length() > MAX_PARAGRAPH_SIZE) {
                    for (int i = 0; i < sentence.length(); i += MAX_PARAGRAPH_SIZE) {
                        pieces.add(sentence.substring(i, Math.min(i + MAX_PARAGRAPH_SIZE, sentence.length())));
                    }
                } else {
                    current.append(sentence);
                }
            }
        }
        if (current.length() > 0) pieces.add(current.toString());
        return pieces;
    }

    private record Section(String title, String content) {}

    private record Draft(String section, String text) {}
}
