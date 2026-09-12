package com.automationportal.perftesting.schedule;

import com.automationportal.perftesting.common.ApiException;
import com.automationportal.perftesting.perftest.PerformanceTestRepository;
import com.automationportal.perftesting.loadtest.LoadTestRepository;
import com.automationportal.perftesting.group.TestGroupRepository;
import com.automationportal.perftesting.security.CurrentProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PerfTestScheduleService {

    private final PerfTestScheduleRepository repository;
    private final PerformanceTestRepository perfTestRepository;
    private final LoadTestRepository loadTestRepository;
    private final TestGroupRepository testGroupRepository;
    private final CurrentProjectService currentProjectService;

    /** Hard cap on schedules per project (paused ones counted too, otherwise pausing would
     *  free a slot and the cap could be walked straight past). 0 or less means no limit. */
    @Value("${perf.scheduler.max-schedules-per-project:100}")
    private int maxSchedulesPerProject;

    @Transactional(readOnly = true)
    public List<PerfTestScheduleDto> getAll() {
        return repository.findByProjectId(currentProjectService.requireProjectId()).stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PerfTestScheduleDto getById(Long id) {
        return toDto(find(id));
    }

    @Transactional
    public PerfTestScheduleDto create(PerfTestSchedule dto) {
        Long projectId = currentProjectService.requireProjectId();
        if (maxSchedulesPerProject > 0 && repository.countByProjectId(projectId) >= maxSchedulesPerProject) {
            throw ApiException.conflict("This workspace already has its maximum of " + maxSchedulesPerProject
                    + " schedules. Delete or replace an existing schedule before adding another.");
        }
        // Validate Cron Expression
        if (!CronExpression.isValidExpression(dto.getCronExpression())) {
            throw ApiException.badRequest("Invalid CRON expression: " + dto.getCronExpression());
        }
        validateTargetOwnership(dto.getTargetType(), dto.getTargetId(), projectId);

        LocalDateTime nextRun = calculateNextRun(dto.getCronExpression(), dto.getTimezone());

        PerfTestSchedule entity = PerfTestSchedule.builder()
                .targetType(dto.getTargetType())
                .targetId(dto.getTargetId())
                .projectId(projectId)
                .cronExpression(dto.getCronExpression())
                .timezone(dto.getTimezone() != null ? dto.getTimezone() : "Asia/Kolkata")
                .isEnabled(dto.getIsEnabled() != null ? dto.getIsEnabled() : true)
                .nextRunAt(nextRun)
                .lastStatus(ScheduleLastStatus.NEVER_RUN)
                .build();

        return toDto(repository.save(entity));
    }

    @Transactional
    public PerfTestScheduleDto update(Long id, PerfTestSchedule dto) {
        PerfTestSchedule existing = find(id);

        if (!CronExpression.isValidExpression(dto.getCronExpression())) {
            throw ApiException.badRequest("Invalid CRON expression: " + dto.getCronExpression());
        }

        existing.setCronExpression(dto.getCronExpression());
        existing.setTimezone(dto.getTimezone() != null ? dto.getTimezone() : "Asia/Kolkata");
        existing.setIsEnabled(dto.getIsEnabled() != null ? dto.getIsEnabled() : true);
        existing.setNextRunAt(calculateNextRun(dto.getCronExpression(), existing.getTimezone()));

        return toDto(repository.save(existing));
    }

    @Transactional
    public void delete(Long id) {
        PerfTestSchedule existing = find(id);
        repository.delete(existing);
    }

    @Transactional
    public PerfTestScheduleDto toggle(Long id) {
        PerfTestSchedule existing = find(id);

        existing.setIsEnabled(!existing.getIsEnabled());
        if (existing.getIsEnabled()) {
            existing.setNextRunAt(calculateNextRun(existing.getCronExpression(), existing.getTimezone()));
        } else {
            existing.setNextRunAt(null);
        }

        return toDto(repository.save(existing));
    }

    private PerfTestSchedule find(Long id) {
        PerfTestSchedule entity = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Schedule not found with ID: " + id));
        if (!currentProjectService.requireProjectId().equals(entity.getProjectId())) {
            throw ApiException.notFound("Schedule not found with ID: " + id);
        }
        return entity;
    }

    /** The scheduled target must belong to the same project — otherwise this schedule would
     * fire and run another project's test on a cron. */
    private void validateTargetOwnership(ScheduleTargetType targetType, Long targetId, Long projectId) {
        boolean owned = switch (targetType) {
            case PERF_TEST -> perfTestRepository.findById(targetId).map(t -> projectId.equals(t.getProjectId())).orElse(false);
            case LOAD_TEST -> loadTestRepository.findById(targetId).map(t -> projectId.equals(t.getProjectId())).orElse(false);
            case GROUP -> testGroupRepository.findById(targetId).map(g -> projectId.equals(g.getProjectId())).orElse(false);
        };
        if (!owned) {
            throw ApiException.badRequest("Schedule target does not exist: " + targetType + " #" + targetId);
        }
    }

    public LocalDateTime calculateNextRun(String cronExpression, String timezone) {
        try {
            CronExpression cron = CronExpression.parse(cronExpression);
            ZonedDateTime next = cron.next(ZonedDateTime.now(ZoneId.of(timezone)));
            return next != null ? next.toLocalDateTime() : null;
        } catch (Exception e) {
            return null;
        }
    }

    public PerfTestScheduleDto toDto(PerfTestSchedule entity) {
        if (entity == null) return null;
        String name = "Unknown Target";
        String type = "PERF";

        if (entity.getTargetType() == ScheduleTargetType.PERF_TEST) {
            type = "PERF";
            name = perfTestRepository.findById(entity.getTargetId())
                    .map(com.automationportal.perftesting.perftest.PerformanceTest::getName)
                    .orElse("Deleted Performance Test");
        } else if (entity.getTargetType() == ScheduleTargetType.LOAD_TEST) {
            type = "LOAD";
            name = loadTestRepository.findById(entity.getTargetId())
                    .map(com.automationportal.perftesting.loadtest.LoadTest::getName)
                    .orElse("Deleted Load Test");
        } else if (entity.getTargetType() == ScheduleTargetType.GROUP) {
            type = "GROUP";
            name = testGroupRepository.findById(entity.getTargetId())
                    .map(com.automationportal.perftesting.group.TestGroup::getName)
                    .orElse("Deleted Test Group");
        }

        return PerfTestScheduleDto.builder()
                .id(entity.getId())
                .name(name)
                .type(type)
                .refId(entity.getTargetId())
                .cronExpression(entity.getCronExpression())
                .timezone(entity.getTimezone())
                .isActive(entity.getIsEnabled())
                .lastRunAt(entity.getLastRunAt())
                .nextRunAt(entity.getNextRunAt())
                .lastRunStatus(entity.getLastStatus() != null ? entity.getLastStatus().name() : "NEVER_RUN")
                .build();
    }
}
