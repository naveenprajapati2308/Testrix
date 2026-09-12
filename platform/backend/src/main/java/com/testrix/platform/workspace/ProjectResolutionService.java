package com.testrix.platform.workspace;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Resolves which active Projects a user belongs to, and with which role(s) in each — the
 * "same user, different role per project" model. A user can have several {@link ProjectUser}
 * rows pointing at the same project (one per role grant), so rows are grouped by project before
 * being handed back.
 */
@Service
public class ProjectResolutionService {
    private final ProjectUserRepository projectUserRepository;
    private final ProjectModuleRepository projectModuleRepository;

    public ProjectResolutionService(ProjectUserRepository projectUserRepository,
                                    ProjectModuleRepository projectModuleRepository) {
        this.projectUserRepository = projectUserRepository;
        this.projectModuleRepository = projectModuleRepository;
    }

    /** tenantId is resolved eagerly here (not left as a lazy Project.tenant touch) since callers
     * commonly use ResolvedProject outside this method's transaction/session. */
    public record ResolvedProject(Project project, Long tenantId, List<String> roleCodes) {}

    @Transactional(readOnly = true)
    public List<ResolvedProject> activeProjects(Long userId) {
        List<ProjectUser> rows = projectUserRepository.findByUserIdAndStatus(userId, ProjectUserStatus.ACTIVE);
        Map<Long, List<ProjectUser>> byProject = rows.stream()
            // A suspended/archived workspace must not be selectable or auto-selected — this is
            // the one place login, /my-projects, and /select-project all resolve through, so
            // filtering here is enough to lock every one of them out at once.
            .filter(pu -> pu.getProject().getStatus() == ProjectStatus.ACTIVE)
            .collect(Collectors.groupingBy(pu -> pu.getProject().getId()));
        return byProject.values().stream()
            .map(group -> new ResolvedProject(
                group.get(0).getProject(),
                group.get(0).getProject().getTenant().getId(),
                group.stream().map(pu -> pu.getRole().getCode()).distinct().toList()
            ))
            .sorted(Comparator.comparing(rp -> rp.project().getName()))
            .toList();
    }

    /** True if the user has at least one membership whose project is currently non-ACTIVE —
     * lets a caller give a specific "your workspace was suspended" message instead of the
     * generic "not assigned to any workspace" one when {@link #activeProjects} comes back empty. */
    @Transactional(readOnly = true)
    public boolean hasAnySuspendedMembership(Long userId) {
        return projectUserRepository.findByUserIdAndStatus(userId, ProjectUserStatus.ACTIVE).stream()
            .anyMatch(pu -> pu.getProject().getStatus() != ProjectStatus.ACTIVE);
    }

    public ProjectDtos.MyProjectSummary toSummary(ResolvedProject resolved) {
        List<String> modules = projectModuleRepository.findByProjectIdAndEnabledTrue(resolved.project().getId())
            .stream().map(m -> m.getModuleType().name()).toList();
        return new ProjectDtos.MyProjectSummary(
            resolved.project().getId(), resolved.project().getProjectCode(), resolved.project().getWorkspaceCode(),
            resolved.project().getName(), modules, resolved.roleCodes()
        );
    }

    public ProjectContext toContext(ResolvedProject resolved) {
        return new ProjectContext(
            resolved.tenantId(), resolved.project().getId(),
            resolved.project().getProjectCode(), resolved.roleCodes()
        );
    }
}
