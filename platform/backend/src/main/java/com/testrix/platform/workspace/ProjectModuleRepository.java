package com.testrix.platform.workspace;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProjectModuleRepository extends JpaRepository<ProjectModule, Long> {
    List<ProjectModule> findByProjectId(Long projectId);
    List<ProjectModule> findByProjectIdAndEnabledTrue(Long projectId);
}
