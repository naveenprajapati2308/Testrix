package com.testrix.platform.workspace;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    Optional<Project> findByProjectCode(String projectCode);
    boolean existsByNameIgnoreCase(String name);
    boolean existsByPreferredWorkspaceSlugIgnoreCase(String preferredWorkspaceSlug);
}
